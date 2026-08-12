<?php
// Same-origin bridge between Design Studio and PrintShop's signed artwork API.
// Browsers never cross the Authentik boundary; every read/write is still
// validated by PrintShop against a short-lived HS256 token minted here.
//
// Two token scopes:
//   vault  — read the artwork index and its thumbnails (list, facets, revision,
//            thumb, handoff). Minted once per request, server-side.
//   asset  — read/replace the bytes of ONE asset. Only ever handed out for the
//            file a designer actually opened, via ?action=handoff.
//
// The vault scope is minted here rather than per row: the previous version
// signed one JWT for every one of the 5 800 rows on every poll.

$backend = rtrim(getenv('PRINTSHOP_INTERNAL_API') ?: 'http://decoinks_backend:8000/api', '/');
$action = $_GET['action'] ?? '';
$token = $_GET['token'] ?? ($_POST['token'] ?? '');

function base64UrlEncode($value) {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function signToken(array $claims) {
    $secret = getenv('PRINTSHOP_JWT_SECRET') ?: '';
    if (!$secret) throw new RuntimeException('JWT secret is not configured');
    $now = time();
    $header = base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64UrlEncode(json_encode($claims + [
        'user_id' => null,
        'iat' => $now,
        'exp' => $now + 7200,
        'aud' => 'decoinks-design-studio',
        'iss' => 'decoinks-printshop',
    ]));
    return $header . '.' . $payload . '.' . base64UrlEncode(hash_hmac('sha256', $header . '.' . $payload, $secret, true));
}

function createArtworkToken($assetId) {
    return signToken(['purpose' => 'design-studio-artwork', 'asset_id' => $assetId]);
}

function createVaultToken() {
    return signToken(['purpose' => 'design-studio-vault']);
}

function jsonError($status, $message, $detail = null) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(array_filter([
        'success' => false,
        'message' => $message,
        'detail' => $detail,
    ], fn($v) => $v !== null));
    exit;
}

// Forward a GET to PrintShop with a freshly minted vault token. `$binary`
// streams the upstream body and content type through untouched (thumbnails).
function proxyVaultGet($backend, $path, array $drop = [], $binary = false) {
    $query = $_GET;
    foreach (array_merge(['action'], $drop) as $key) unset($query[$key]);
    try {
        $query['token'] = createVaultToken();
    } catch (RuntimeException $e) {
        jsonError(500, $e->getMessage());
    }

    $headers = [];
    $request = [];
    // Pass the browser's cache validator through so an unchanged thumbnail can
    // come back as a bodyless 304 instead of being re-sent.
    if ($binary && !empty($_SERVER['HTTP_IF_NONE_MATCH'])) {
        $request[] = 'If-None-Match: ' . $_SERVER['HTTP_IF_NONE_MATCH'];
    }

    $curl = curl_init($backend . $path . '?' . http_build_query($query));
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => $request,
        CURLOPT_ENCODING => '',
        CURLOPT_HEADERFUNCTION => function ($curl, $line) use (&$headers) {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
            return strlen($line);
        },
    ]);
    $body = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($body === false) jsonError(502, 'PrintShop artwork service is unavailable', $error);

    http_response_code($status ?: 502);
    if ($binary) {
        if (!empty($headers['etag'])) header('ETag: ' . $headers['etag']);
        header('Cache-Control: private, max-age=604800, immutable');
        if ($status === 304) exit;                       // nothing to send
        header('Content-Type: ' . ($headers['content-type'] ?? 'image/webp'));
    } else {
        header('Content-Type: application/json');
        header('Cache-Control: private, no-store');
    }
    echo $body;
    exit;
}

// ── Vault-scope endpoints ───────────────────────────────────────────────────
if ($action === 'vault')    proxyVaultGet($backend, '/artworks/studio/vault');
if ($action === 'facets')   proxyVaultGet($backend, '/artworks/studio/vault/facets');
if ($action === 'revision') proxyVaultGet($backend, '/artworks/studio/vault/revision');
if ($action === 'thumb')    proxyVaultGet($backend, '/artworks/studio/thumb', ['v'], true);
if ($action === 'handoff')  proxyVaultGet($backend, '/artworks/studio/handoff');

// ── Upload to vault (new file) ──────────────────────────────────────────────
// Saves directly to the Nextcloud-synced artwork directory. The vault's live
// revision watcher picks up the new file within seconds.
if ($action === 'upload') {
    header('Content-Type: application/json');
    header('Cache-Control: private, no-store');

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonError(405, 'POST required');
    }
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        jsonError(400, 'File is required (error code: ' . ($_FILES['file']['error'] ?? 'missing') . ')');
    }
    if (empty($_POST['entity_key'])) {
        jsonError(400, 'Customer (entity_key) is required');
    }

    $entityKey = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_POST['entity_key']);
    $folder = preg_replace('/[^a-zA-Z0-9_\- ]/', '', $_POST['folder'] ?? 'Artworks');
    $lifecycleCode = preg_replace('/[^A-Z]/', '', strtoupper($_POST['lifecycle_code'] ?? 'WRK'));
    $originalName = $_FILES['file']['name'];
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION)) ?: 'png';

    // Artwork storage root — configurable via env, defaults to a local directory
    $storageRoot = rtrim(getenv('ARTWORK_STORAGE_PATH') ?: (__DIR__ . '/vault-uploads'), '/');

    // Build path: /storage_root/entity_key/folder/
    $targetDir = $storageRoot . '/' . $entityKey . '/' . $folder;
    if (!is_dir($targetDir)) {
        if (!mkdir($targetDir, 0755, true)) {
            jsonError(500, 'Could not create target directory');
        }
    }

    // Generate file name following convention: AW-ENTITY-NNNN-LIFECYCLE.ext
    // Find next sequence number for this entity
    $existing = glob($targetDir . '/AW-' . $entityKey . '-*');
    $maxSeq = 0;
    foreach ($existing as $f) {
        if (preg_match('/AW-' . preg_quote($entityKey) . '-(\d+)/', basename($f), $m)) {
            $maxSeq = max($maxSeq, (int)$m[1]);
        }
    }
    $seq = str_pad($maxSeq + 1, 4, '0', STR_PAD_LEFT);
    $newFileName = "AW-{$entityKey}-{$seq}-{$lifecycleCode}.{$ext}";
    $targetPath = $targetDir . '/' . $newFileName;

    // Move uploaded file
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
        jsonError(500, 'Failed to save file');
    }

    // Also try to notify PrintShop backend about the new file (non-blocking)
    $notifyPayload = json_encode([
        'entity_key' => $entityKey,
        'folder' => $folder,
        'file_name' => $newFileName,
        'lifecycle_code' => $lifecycleCode,
        'file_size' => filesize($targetPath),
        'source' => 'design-studio-upload',
    ]);

    // Non-blocking notification to PrintShop (best effort)
    try {
        $vaultToken = createVaultToken();
        $ch = curl_init($backend . '/artworks/studio/notify-upload');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $vaultToken],
            CURLOPT_POSTFIELDS => $notifyPayload,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
        ]);
        curl_exec($ch);
        curl_close($ch);
    } catch (Exception $e) {
        // Notification is best-effort; file is already saved
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'file_name' => $newFileName,
            'folder' => $folder,
            'entity_key' => $entityKey,
            'lifecycle_code' => $lifecycleCode,
            'file_size' => filesize($targetPath),
        ],
        'message' => 'File uploaded successfully',
    ]);
    exit;
}

if ($action === 'latest') {
    require_once __DIR__ . '/db.php';
    $row = getDB()->query("SELECT asset_id,file_name,version_no,last_opened_at
        FROM design_studio_vault_items ORDER BY last_opened_at DESC LIMIT 1")->fetch();
    header('Content-Type: application/json');
    header('Cache-Control: private, no-store');
    echo json_encode(['success' => true, 'data' => $row ? [
        'asset_id' => $row['asset_id'],
        'file_name' => $row['file_name'],
        'version_no' => (int)$row['version_no'],
        'token' => createArtworkToken($row['asset_id']),
    ] : null]);
    exit;
}

// ── Asset-scope endpoints ───────────────────────────────────────────────────
// `content` accepts an asset id + vault token as well, so a card can download
// its own file without the caller round-tripping through ?action=handoff first.
if ($action === 'content' && !$token && !empty($_GET['id'])) {
    try {
        $token = createArtworkToken($_GET['id']);
    } catch (RuntimeException $e) {
        jsonError(500, $e->getMessage());
    }
}

if (!$token || !in_array($action, ['asset', 'content', 'save'], true)) {
    jsonError(400, 'Invalid artwork request');
}

$curl = curl_init();
$headers = [];

if ($action === 'save') {
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        jsonError(400, 'Edited artwork file is required');
    }
    curl_setopt_array($curl, [
        CURLOPT_URL => $backend . '/artworks/studio/save',
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => [
            'token' => $token,
            // Which studio tool is saving: WRK (editor), MU (mockup), GS (gang sheet).
            'kind' => $_POST['kind'] ?? ($_GET['kind'] ?? 'WRK'),
            'file' => new CURLFile(
                $_FILES['file']['tmp_name'],
                $_FILES['file']['type'] ?: 'image/png',
                $_FILES['file']['name'] ?: 'artwork.png'
            ),
        ],
    ]);
} else {
    $endpoint = $action === 'asset' ? 'asset' : 'content';
    curl_setopt($curl, CURLOPT_URL, $backend . '/artworks/studio/' . $endpoint . '?token=' . rawurlencode($token));
}

curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_HEADERFUNCTION => function ($curl, $line) use (&$headers) {
        $length = strlen($line);
        $parts = explode(':', $line, 2);
        if (count($parts) === 2) $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
        return $length;
    },
]);

$body = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$error = curl_error($curl);
curl_close($curl);

if ($body === false) {
    jsonError(502, 'PrintShop artwork service is unavailable', $error);
}

http_response_code($status ?: 502);
header('Content-Type: ' . ($headers['content-type'] ?? ($action === 'content' ? 'application/octet-stream' : 'application/json')));
header('Cache-Control: private, no-store');

if ($action === 'asset' && $status >= 200 && $status < 300) {
    $payload = json_decode($body, true);
    $asset = $payload['data'] ?? null;
    if (!empty($asset['id']) && !empty($asset['file_name'])) {
        require_once __DIR__ . '/db.php';
        $statement = getDB()->prepare("INSERT INTO design_studio_vault_items
            (asset_id,file_name,version_no,last_opened_at) VALUES (?::uuid,?,?,NOW())
            ON CONFLICT (asset_id) DO UPDATE SET
              file_name=EXCLUDED.file_name,version_no=EXCLUDED.version_no,last_opened_at=NOW()");
        $statement->execute([$asset['id'], $asset['file_name'], (int)($asset['version_no'] ?? 0)]);
    }
}

echo $body;
