<?php
// Central Decoinks PostgreSQL connection. DTF tables live in their own schema,
// so they cannot collide with Decoinks, Technocas CRM, or BlankTex tables.
$databaseUrl = getenv('DATABASE_URL') ?: '';
$dbSchema = getenv('DB_SCHEMA') ?: 'dtf';

function getDB() {
    global $databaseUrl, $dbSchema;
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    try {
        if (!$databaseUrl) throw new RuntimeException('DATABASE_URL is not configured');
        $parts = parse_url($databaseUrl);
        if (!$parts || !isset($parts['host'], $parts['path'])) throw new RuntimeException('DATABASE_URL is invalid');

        $host = $parts['host'];
        $port = $parts['port'] ?? 5432;
        $name = ltrim($parts['path'], '/');
        $user = urldecode($parts['user'] ?? 'postgres');
        $pass = urldecode($parts['pass'] ?? '');
        $pdo = new PDO("pgsql:host={$host};port={$port};dbname={$name}", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        if (!preg_match('/^[a-z_][a-z0-9_]*$/', $dbSchema)) throw new RuntimeException('DB_SCHEMA is invalid');
        $pdo->exec("SET search_path TO {$dbSchema}, public");
        return $pdo;
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed']);
        error_log('[database] ' . $e->getMessage());
        exit;
    }
}

// Additive and idempotent: startup never drops or truncates existing data.
function initDatabase() {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) DEFAULT '',
        role VARCHAR(20) NOT NULL DEFAULT 'viewer'
            CHECK (role IN ('superadmin', 'admin', 'editor', 'viewer')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        page_access JSONB DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMPTZ NULL
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(128) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        ip_address VARCHAR(45) DEFAULT '',
        user_agent TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS ix_dtf_sessions_user ON sessions(user_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS ix_dtf_sessions_expiry ON sessions(expires_at)");

    $stmt = $db->query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'superadmin'");
    if ((int)$stmt->fetch()['cnt'] === 0) {
        $hash = password_hash('admin123', PASSWORD_BCRYPT);
        $allPages = json_encode(['vault','bgremover','qa','orders','garments','gangsheet','gscalc','gsoptimize','contrast','ailab','users','mockupv2']);
        $db->prepare("INSERT INTO users (username, email, password_hash, full_name, role, page_access) VALUES (?, ?, ?, ?, 'superadmin', ?::jsonb)")
           ->execute(['admin', 'admin@printshop.local', $hash, 'Super Admin', $allPages]);
    }
}

try { initDatabase(); } catch (Throwable $e) { error_log('[database-init] ' . $e->getMessage()); }
