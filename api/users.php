<?php
// ═══════════════════════════════════════════════════════════════════════════════
// USERS API — CRUD for user management (superadmin/admin only)
// ═══════════════════════════════════════════════════════════════════════════════

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth-helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$currentUser = requireAuth();

// Only superadmin and admin can manage users
if (!in_array($currentUser['role'], ['superadmin', 'admin'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Insufficient permissions']);
    exit;
}

$db = getDB();

// ═══ GET: List all users ═══
if ($method === 'GET') {
    $stmt = $db->query("SELECT id, username, email, full_name, role, is_active, page_access, created_at, last_login FROM users ORDER BY created_at DESC");
    $users = $stmt->fetchAll();
    foreach ($users as &$u) {
        $u['page_access'] = json_decode($u['page_access'] ?? '[]', true);
    }
    echo json_encode($users);
    exit;
}

// ═══ POST: Create new user ═══
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = trim($input['username'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    $fullName = trim($input['full_name'] ?? '');
    $role = $input['role'] ?? 'viewer';
    $pageAccess = $input['page_access'] ?? ['bgremover', 'orders'];

    if (empty($username) || empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Username, email, and password required']);
        exit;
    }

    if (strlen($password) < 6) {
        http_response_code(400);
        echo json_encode(['error' => 'Password must be at least 6 characters']);
        exit;
    }

    // Only superadmin can create admins/superadmins
    if (in_array($role, ['superadmin', 'admin']) && $currentUser['role'] !== 'superadmin') {
        http_response_code(403);
        echo json_encode(['error' => 'Only superadmin can create admin users']);
        exit;
    }

    // Check unique
    $stmt = $db->prepare("SELECT id FROM users WHERE username = ? OR email = ?");
    $stmt->execute([$username, $email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Username or email already exists']);
        exit;
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $pageJson = json_encode($pageAccess);

    $stmt = $db->prepare("INSERT INTO users (username, email, password_hash, full_name, role, page_access) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$username, $email, $hash, $fullName, $role, $pageJson]);

    echo json_encode(['success' => true, 'id' => $db->lastInsertId()]);
    exit;
}

// ═══ PUT: Update user ═══
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'User ID required']); exit; }

    // Build update fields
    $fields = [];
    $params = [];

    if (isset($input['full_name'])) { $fields[] = 'full_name = ?'; $params[] = $input['full_name']; }
    if (isset($input['email'])) { $fields[] = 'email = ?'; $params[] = $input['email']; }
    if (isset($input['role'])) {
        if ($currentUser['role'] !== 'superadmin') { http_response_code(403); echo json_encode(['error' => 'Only superadmin can change roles']); exit; }
        $fields[] = 'role = ?'; $params[] = $input['role'];
    }
    if (isset($input['is_active'])) { $fields[] = 'is_active = ?'; $params[] = $input['is_active'] ? 1 : 0; }
    if (isset($input['page_access'])) { $fields[] = 'page_access = ?'; $params[] = json_encode($input['page_access']); }
    if (isset($input['password']) && !empty($input['password'])) {
        $fields[] = 'password_hash = ?'; $params[] = password_hash($input['password'], PASSWORD_BCRYPT);
    }

    if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }

    $params[] = $id;
    $db->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    echo json_encode(['success' => true]);
    exit;
}

// ═══ DELETE: Remove user ═══
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? $_GET['id'] ?? null;
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'User ID required']); exit; }

    // Can't delete yourself
    if ($id == $currentUser['id']) { http_response_code(400); echo json_encode(['error' => 'Cannot delete yourself']); exit; }
    // Only superadmin can delete admins
    if ($currentUser['role'] !== 'superadmin') {
        $stmt = $db->prepare("SELECT role FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $target = $stmt->fetch();
        if ($target && in_array($target['role'], ['superadmin', 'admin'])) {
            http_response_code(403); echo json_encode(['error' => 'Only superadmin can delete admin users']); exit;
        }
    }

    $db->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
