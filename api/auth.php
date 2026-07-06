<?php
// ═══════════════════════════════════════════════════════════════════════════════
// AUTH API — Login, Logout, Session Validation
// ═══════════════════════════════════════════════════════════════════════════════

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth-helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// ═══ LOGIN ═══
if ($method === 'POST' && $action === 'login') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Username and password required']);
        exit;
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1");
    $stmt->execute([$username, $username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid username or password']);
        exit;
    }

    // Create session token
    $token = bin2hex(random_bytes(48));
    $expiresAt = date('Y-m-d H:i:s', time() + 86400 * 7); // 7 days
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';

    $db->prepare("INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)")
       ->execute([$user['id'], $token, $expiresAt, $ip, $ua]);

    // Update last login
    $db->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$user['id']]);

    // Return user data (without password)
    unset($user['password_hash']);
    $user['page_access'] = json_decode($user['page_access'] ?? '[]', true);

    echo json_encode([
        'success' => true,
        'token' => $token,
        'user' => $user,
    ]);
    exit;
}

// ═══ VALIDATE SESSION ═══
if ($method === 'GET' && $action === 'validate') {
    $token = getAuthToken();
    if (!$token) { http_response_code(401); echo json_encode(['error' => 'No token']); exit; }

    $db = getDB();
    $stmt = $db->prepare("SELECT s.*, u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = 1");
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row) { http_response_code(401); echo json_encode(['error' => 'Invalid or expired session']); exit; }

    unset($row['password_hash'], $row['token']);
    $row['page_access'] = json_decode($row['page_access'] ?? '[]', true);

    echo json_encode(['success' => true, 'user' => $row]);
    exit;
}

// ═══ LOGOUT ═══
if ($method === 'POST' && $action === 'logout') {
    $token = getAuthToken();
    if ($token) {
        $db = getDB();
        $db->prepare("DELETE FROM sessions WHERE token = ?")->execute([$token]);
    }
    echo json_encode(['success' => true]);
    exit;
}

// ═══ CHANGE PASSWORD ═══
if ($method === 'POST' && $action === 'change-password') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $currentPass = $input['currentPassword'] ?? '';
    $newPass = $input['newPassword'] ?? '';

    if (strlen($newPass) < 6) {
        http_response_code(400);
        echo json_encode(['error' => 'New password must be at least 6 characters']);
        exit;
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT password_hash FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();

    if (!password_verify($currentPass, $row['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Current password is incorrect']);
        exit;
    }

    $hash = password_hash($newPass, PASSWORD_BCRYPT);
    $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?")->execute([$hash, $user['id']]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Unknown action']);

// Helper functions are in auth-helpers.php (shared with users.php)
