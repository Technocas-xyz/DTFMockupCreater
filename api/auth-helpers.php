<?php
// ═══════════════════════════════════════════════════════════════════════════════
// AUTH HELPERS — Shared functions for authentication (no routing logic)
// ═══════════════════════════════════════════════════════════════════════════════

require_once __DIR__ . '/db.php';

function getAuthToken() {
    $headers = [];
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
    } else {
        foreach ($_SERVER as $key => $value) {
            if (substr($key, 0, 5) === 'HTTP_') {
                $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))))] = $value;
            }
        }
    }
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (strpos($auth, 'Bearer ') === 0) return substr($auth, 7);
    return $_GET['token'] ?? null;
}

function requireAuth() {
    $token = getAuthToken();
    if (!$token) { http_response_code(401); echo json_encode(['error' => 'Authentication required']); exit; }
    $db = getDB();
    $stmt = $db->prepare("SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = 1");
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user) { http_response_code(401); echo json_encode(['error' => 'Invalid session']); exit; }
    unset($user['password_hash']);
    $user['page_access'] = json_decode($user['page_access'] ?? '[]', true);
    return $user;
}
