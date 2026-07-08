<?php
// ═══════════════════════════════════════════════════════════════════════════════
// VAULT PROXY — Server-side fetcher for cloud shared links
// Bypasses CORS by fetching from PHP backend
// Supports: Google Drive, OneDrive, Dropbox, Nextcloud, direct URLs
// ═══════════════════════════════════════════════════════════════════════════════

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$input = json_decode(file_get_contents('php://input'), true);
$url = $input['url'] ?? $_GET['url'] ?? '';

if (empty($url)) {
    echo json_encode(['error' => 'No URL provided']);
    exit;
}

// Detect service type
$service = detectService($url);
$result = [];

switch ($service) {
    case 'google-drive':
        $result = fetchGoogleDrive($url);
        break;
    case 'dropbox':
        $result = fetchDropbox($url);
        break;
    case 'onedrive':
        $result = fetchOneDrive($url);
        break;
    case 'nextcloud':
        $result = fetchNextcloud($url);
        break;
    default:
        $result = fetchGenericUrl($url);
        break;
}

echo json_encode($result);

// ─── SERVICE DETECTION ──────────────────────────────────────────────────────
function detectService($url) {
    if (strpos($url, 'drive.google.com') !== false || strpos($url, 'docs.google.com') !== false) return 'google-drive';
    if (strpos($url, 'dropbox.com') !== false || strpos($url, 'dl.dropboxusercontent.com') !== false) return 'dropbox';
    if (strpos($url, 'onedrive.live.com') !== false || strpos($url, '1drv.ms') !== false || strpos($url, 'sharepoint.com') !== false) return 'onedrive';
    if (strpos($url, 'nextcloud') !== false || strpos($url, '/s/') !== false) return 'nextcloud';
    return 'generic';
}

// ─── GOOGLE DRIVE ───────────────────────────────────────────────────────────
function fetchGoogleDrive($url) {
    // Extract folder/file ID
    $id = '';
    if (preg_match('/folders\/([a-zA-Z0-9_-]+)/', $url, $m)) $id = $m[1];
    elseif (preg_match('/d\/([a-zA-Z0-9_-]+)/', $url, $m)) $id = $m[1];
    elseif (preg_match('/id=([a-zA-Z0-9_-]+)/', $url, $m)) $id = $m[1];

    if (empty($id)) return ['error' => 'Could not extract Google Drive ID', 'service' => 'google-drive'];

    // Try to fetch folder listing page
    $pageUrl = "https://drive.google.com/drive/folders/{$id}";
    $html = @file_get_contents($pageUrl);

    if ($html === false) {
        // Single file — generate direct download link
        return [
            'service' => 'google-drive',
            'type' => 'file',
            'images' => [[
                'name' => 'google-drive-file.png',
                'url' => "https://drive.google.com/uc?export=download&id={$id}",
                'thumbnail' => "https://drive.google.com/thumbnail?id={$id}&sz=w400",
            ]],
        ];
    }

    // Parse file names and IDs from the page
    $images = [];
    // Look for data patterns in Google Drive HTML
    if (preg_match_all('/\["([a-zA-Z0-9_-]{20,})"[^]]*"([^"]+\.(png|jpg|jpeg|webp|gif|tiff|bmp))"/i', $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $fileId = $match[1];
            $fileName = $match[2];
            $images[] = [
                'name' => $fileName,
                'url' => "https://drive.google.com/uc?export=download&id={$fileId}",
                'thumbnail' => "https://drive.google.com/thumbnail?id={$fileId}&sz=w300",
            ];
        }
    }

    if (empty($images)) {
        // Fallback: treat as single file
        $images[] = [
            'name' => 'google-drive-file.png',
            'url' => "https://drive.google.com/uc?export=download&id={$id}",
            'thumbnail' => "https://drive.google.com/thumbnail?id={$id}&sz=w400",
        ];
    }

    return ['service' => 'google-drive', 'type' => 'folder', 'images' => $images];
}

// ─── DROPBOX ────────────────────────────────────────────────────────────────
function fetchDropbox($url) {
    // Convert sharing link to direct download
    $directUrl = str_replace('www.dropbox.com', 'dl.dropboxusercontent.com', $url);
    $directUrl = preg_replace('/\?dl=0/', '?dl=1', $directUrl);
    if (strpos($directUrl, '?') === false) $directUrl .= '?dl=1';

    // Check if it's a folder (contains /sh/) or file
    if (strpos($url, '/sh/') !== false || strpos($url, '/scl/') !== false) {
        // Folder — try to list contents
        $html = @file_get_contents($url);
        $images = [];
        if ($html && preg_match_all('/"filename":"([^"]+\.(png|jpg|jpeg|webp|gif))"/i', $html, $matches)) {
            foreach ($matches[1] as $name) {
                $images[] = ['name' => $name, 'url' => $directUrl, 'thumbnail' => ''];
            }
        }
        if (empty($images)) {
            $images[] = ['name' => basename(parse_url($url, PHP_URL_PATH)) ?: 'dropbox-file.png', 'url' => $directUrl, 'thumbnail' => ''];
        }
        return ['service' => 'dropbox', 'type' => 'folder', 'images' => $images];
    }

    return [
        'service' => 'dropbox',
        'type' => 'file',
        'images' => [['name' => basename(parse_url($url, PHP_URL_PATH)) ?: 'dropbox-file.png', 'url' => $directUrl, 'thumbnail' => '']],
    ];
}

// ─── ONEDRIVE ───────────────────────────────────────────────────────────────
function fetchOneDrive($url) {
    // OneDrive shared links need to be converted to Graph API format
    // The sharing URL is base64-encoded to create an API token
    
    // Step 1: Follow redirects to get the final URL
    $finalUrl = $url;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_NOBODY => false,
    ]);
    $html = curl_exec($ch);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);

    // Step 2: Try to use the sharing API
    // Encode sharing URL for Graph API: u!<base64url>
    $encodedUrl = rtrim(strtr(base64_encode($url), '+/', '-_'), '=');
    $graphUrl = "https://api.onedrive.com/v1.0/shares/u!{$encodedUrl}/root/children";
    
    $ch = curl_init($graphUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        $data = json_decode($response, true);
        if (isset($data['value']) && is_array($data['value'])) {
            $images = [];
            $folders = [];
            foreach ($data['value'] as $item) {
                $name = $item['name'] ?? '';
                if (isset($item['folder'])) {
                    $folders[] = ['name' => $name, 'type' => 'folder', 'childCount' => $item['folder']['childCount'] ?? 0];
                } elseif (preg_match('/\.(png|jpg|jpeg|webp|gif|tiff|bmp|svg)$/i', $name)) {
                    $downloadUrl = $item['@content.downloadUrl'] ?? '';
                    $thumbnail = '';
                    if (isset($item['thumbnails'][0]['large']['url'])) {
                        $thumbnail = $item['thumbnails'][0]['large']['url'];
                    }
                    $images[] = [
                        'name' => $name,
                        'url' => $downloadUrl ?: $url,
                        'thumbnail' => $thumbnail ?: $downloadUrl,
                        'size' => $item['size'] ?? 0,
                    ];
                }
            }
            return ['service' => 'onedrive', 'type' => 'folder', 'images' => $images, 'folders' => $folders];
        }
    }

    // Step 3: Try the driveItem endpoint
    $graphUrl2 = "https://api.onedrive.com/v1.0/shares/u!{$encodedUrl}/driveItem?expand=children";
    $ch = curl_init($graphUrl2);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $response2 = curl_exec($ch);
    $httpCode2 = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode2 === 200 && $response2) {
        $data = json_decode($response2, true);
        $images = [];
        $folders = [];
        $children = $data['children'] ?? [];
        foreach ($children as $item) {
            $name = $item['name'] ?? '';
            if (isset($item['folder'])) {
                $folders[] = ['name' => $name, 'type' => 'folder', 'childCount' => $item['folder']['childCount'] ?? 0];
            } elseif (preg_match('/\.(png|jpg|jpeg|webp|gif|tiff|bmp|svg)$/i', $name)) {
                $downloadUrl = $item['@content.downloadUrl'] ?? '';
                $images[] = [
                    'name' => $name,
                    'url' => $downloadUrl ?: $url,
                    'thumbnail' => $downloadUrl,
                    'size' => $item['size'] ?? 0,
                ];
            }
        }
        if (!empty($images) || !empty($folders)) {
            return ['service' => 'onedrive', 'type' => 'folder', 'images' => $images, 'folders' => $folders];
        }
    }

    // Step 4: Parse HTML as fallback
    if ($html) {
        $images = [];
        // Look for file entries in OneDrive's embedded JSON data
        if (preg_match_all('/"name":"([^"]+\.(png|jpg|jpeg|webp|gif))"/i', $html, $matches)) {
            foreach ($matches[1] as $name) {
                $images[] = ['name' => $name, 'url' => $url, 'thumbnail' => ''];
            }
        }
        if (!empty($images)) return ['service' => 'onedrive', 'type' => 'folder', 'images' => $images];
    }

    return [
        'service' => 'onedrive',
        'type' => 'file',
        'images' => [['name' => 'onedrive-file.png', 'url' => $finalUrl, 'thumbnail' => '']],
        'note' => 'Could not list folder contents. Try sharing individual files.',
    ];
}

// ─── NEXTCLOUD ──────────────────────────────────────────────────────────────
function fetchNextcloud($url) {
    // Nextcloud public share: add /download to get file
    $downloadUrl = rtrim($url, '/') . '/download';

    // Try WebDAV listing for folders
    $davUrl = preg_replace('/\/s\/([^\/]+)$/', '/public.php/webdav/', $url);
    $token = '';
    if (preg_match('/\/s\/([a-zA-Z0-9]+)/', $url, $m)) $token = $m[1];

    if ($token) {
        // Try PROPFIND to list files
        $ctx = stream_context_create(['http' => [
            'method' => 'PROPFIND',
            'header' => "Authorization: Basic " . base64_encode($token . ':') . "\r\nDepth: 1\r\n",
        ]]);
        $response = @file_get_contents($davUrl, false, $ctx);
        if ($response) {
            $images = [];
            if (preg_match_all('/<d:href>([^<]+\.(png|jpg|jpeg|webp|gif))<\/d:href>/i', $response, $matches)) {
                foreach ($matches[1] as $path) {
                    $name = basename($path);
                    $images[] = ['name' => $name, 'url' => rtrim($url, '/') . '/download?path=' . urlencode(dirname($path)) . '&files=' . urlencode($name), 'thumbnail' => ''];
                }
            }
            if (!empty($images)) return ['service' => 'nextcloud', 'type' => 'folder', 'images' => $images];
        }
    }

    return [
        'service' => 'nextcloud',
        'type' => 'file',
        'images' => [['name' => 'nextcloud-file.png', 'url' => $downloadUrl, 'thumbnail' => '']],
    ];
}

// ─── GENERIC URL ────────────────────────────────────────────────────────────
function fetchGenericUrl($url) {
    $headers = @get_headers($url, 1);
    if (!$headers) return ['error' => 'Could not reach URL'];

    $contentType = $headers['Content-Type'] ?? '';
    if (is_array($contentType)) $contentType = end($contentType);

    // Direct image
    if (strpos($contentType, 'image/') === 0) {
        return ['service' => 'direct', 'type' => 'file', 'images' => [['name' => basename(parse_url($url, PHP_URL_PATH)) ?: 'image.png', 'url' => $url, 'thumbnail' => $url]]];
    }

    // HTML page — extract images
    $html = @file_get_contents($url);
    if (!$html) return ['error' => 'Could not fetch page content'];

    $images = [];
    $baseUrl = parse_url($url, PHP_URL_SCHEME) . '://' . parse_url($url, PHP_URL_HOST);

    // Find img tags
    if (preg_match_all('/<img[^>]+src=["\']([^"\']+)["\']/', $html, $matches)) {
        foreach ($matches[1] as $src) {
            if (strpos($src, 'data:') === 0) continue;
            if (strpos($src, '//') === 0) $src = 'https:' . $src;
            elseif (strpos($src, '/') === 0) $src = $baseUrl . $src;
            elseif (strpos($src, 'http') !== 0) $src = $baseUrl . '/' . $src;
            $name = basename(parse_url($src, PHP_URL_PATH)) ?: 'image.png';
            if (preg_match('/\.(png|jpg|jpeg|webp|gif|tiff|bmp)$/i', $name)) {
                $images[] = ['name' => $name, 'url' => $src, 'thumbnail' => $src];
            }
        }
    }

    // Find links to image files
    if (preg_match_all('/<a[^>]+href=["\']([^"\']+\.(png|jpg|jpeg|webp|gif|tiff))["\']/', $html, $matches)) {
        foreach ($matches[1] as $href) {
            if (strpos($href, '//') === 0) $href = 'https:' . $href;
            elseif (strpos($href, '/') === 0) $href = $baseUrl . $href;
            elseif (strpos($href, 'http') !== 0) $href = $baseUrl . '/' . $href;
            $name = basename(parse_url($href, PHP_URL_PATH));
            $images[] = ['name' => $name, 'url' => $href, 'thumbnail' => $href];
        }
    }

    if (empty($images)) return ['error' => 'No images found at this URL', 'service' => 'generic'];
    return ['service' => 'generic', 'type' => 'page', 'images' => $images];
}
