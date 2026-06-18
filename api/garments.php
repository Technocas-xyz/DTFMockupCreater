<?php
// ============================================================
// Garment API — handles save, load, delete of garment images
// Auto-creates data directory and sets permissions on first run
// ============================================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Increase PHP limits for large base64 image uploads
@ini_set('post_max_size', '50M');
@ini_set('upload_max_filesize', '50M');
@ini_set('memory_limit', '256M');
@ini_set('max_execution_time', 60);

$dataDir = __DIR__ . '/garment-data';
$dataFile = $dataDir . '/garments.json';

// Auto-create directory with proper permissions
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0777, true);
    if (!is_dir($dataDir)) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot create directory: ' . $dataDir . '. Please create it manually with write permissions.']);
        exit;
    }
}

// Ensure writable
if (!is_writable($dataDir)) {
    @chmod($dataDir, 0777);
}

// Create .htaccess to allow image serving in garment-data
$htaccess = $dataDir . '/.htaccess';
if (!file_exists($htaccess)) {
    @file_put_contents($htaccess, "Options -Indexes\n<FilesMatch \"\\.png$\">\n  Allow from all\n</FilesMatch>\n");
}

// Initialize JSON file if missing
if (!file_exists($dataFile)) {
    @file_put_contents($dataFile, '[]');
    @chmod($dataFile, 0666);
}

$method = $_SERVER['REQUEST_METHOD'];

// ==================== GET: Return all garments ====================
if ($method === 'GET') {
    $data = @file_get_contents($dataFile);
    if ($data === false || empty($data)) {
        echo '[]';
    } else {
        $decoded = json_decode($data, true);
        echo json_encode(is_array($decoded) ? $decoded : []);
    }
    exit;
}

// ==================== POST: Save a new garment ====================
if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    
    if (empty($rawInput)) {
        http_response_code(400);
        echo json_encode(['error' => 'Empty request body. PHP post_max_size may be too small.']);
        exit;
    }
    
    $input = json_decode($rawInput, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON: ' . json_last_error_msg()]);
        exit;
    }
    
    if (!$input || !isset($input['name']) || !isset($input['dataUrl'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields (name, dataUrl)']);
        exit;
    }

    // Load existing garments
    $garments = json_decode(@file_get_contents($dataFile), true);
    if (!is_array($garments)) $garments = [];
    
    // Save image to file
    $imageData = $input['dataUrl'];
    $imageId = uniqid('garment_');
    
    if (strpos($imageData, 'data:image/png;base64,') === 0) {
        $base64 = str_replace('data:image/png;base64,', '', $imageData);
        $base64 = str_replace(' ', '+', $base64); // fix URL-encoded spaces
        $imageBytes = base64_decode($base64, true);
        
        if ($imageBytes === false) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid base64 image data']);
            exit;
        }
        
        $imagePath = $dataDir . '/' . $imageId . '.png';
        $written = @file_put_contents($imagePath, $imageBytes);
        
        if ($written === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to write image. Directory may not be writable: ' . $dataDir]);
            exit;
        }
        
        @chmod($imagePath, 0666);
        $input['imageFile'] = $imageId . '.png';
        unset($input['dataUrl']); // Don't store base64 in JSON
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'dataUrl must be a PNG base64 data URL']);
        exit;
    }

    $input['id'] = $imageId;
    $input['createdAt'] = date('Y-m-d H:i:s');
    
    $garments[] = $input;
    $jsonOutput = json_encode($garments, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    
    if (@file_put_contents($dataFile, $jsonOutput) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save garments.json. Check file permissions.']);
        exit;
    }
    
    // Return saved garment with dataUrl for immediate use
    $input['dataUrl'] = $imageData;
    echo json_encode($input, JSON_UNESCAPED_UNICODE);
    exit;
}

// ==================== DELETE: Remove a garment ====================
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = isset($input['id']) ? $input['id'] : (isset($_GET['id']) ? $_GET['id'] : null);
    
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id']);
        exit;
    }

    $garments = json_decode(@file_get_contents($dataFile), true);
    if (!is_array($garments)) $garments = [];
    
    $garments = array_values(array_filter($garments, function($g) use ($id) {
        return isset($g['id']) && $g['id'] !== $id;
    }));
    
    // Delete image file
    $imagePath = $dataDir . '/' . $id . '.png';
    if (file_exists($imagePath)) {
        @unlink($imagePath);
    }
    
    @file_put_contents($dataFile, json_encode($garments, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
