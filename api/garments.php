<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = __DIR__ . '/garment-data';
$dataFile = $dataDir . '/garments.json';

// Create directory if not exists
if (!is_dir($dataDir)) {
    if (!mkdir($dataDir, 0777, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot create data directory: ' . $dataDir]);
        exit;
    }
}

// Ensure directory is writable
if (!is_writable($dataDir)) {
    chmod($dataDir, 0777);
    if (!is_writable($dataDir)) {
        http_response_code(500);
        echo json_encode(['error' => 'Data directory not writable: ' . $dataDir]);
        exit;
    }
}

// Initialize file if not exists
if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode([]));
    chmod($dataFile, 0666);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $data = file_get_contents($dataFile);
    if ($data === false) {
        echo json_encode([]);
    } else {
        $decoded = json_decode($data, true);
        echo json_encode($decoded ?: []);
    }
    exit;
}

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    
    if (!$input || !isset($input['name']) || !isset($input['dataUrl'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields (name, dataUrl)']);
        exit;
    }

    $garments = json_decode(file_get_contents($dataFile), true);
    if (!is_array($garments)) $garments = [];
    
    // Save image to file
    $imageData = $input['dataUrl'];
    $imageId = uniqid('garment_');
    
    if (strpos($imageData, 'data:image/png;base64,') === 0) {
        $base64 = str_replace('data:image/png;base64,', '', $imageData);
        $imageBytes = base64_decode($base64);
        if ($imageBytes === false) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid base64 image data']);
            exit;
        }
        $imagePath = $dataDir . '/' . $imageId . '.png';
        if (file_put_contents($imagePath, $imageBytes) === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to write image file']);
            exit;
        }
        chmod($imagePath, 0666);
        $input['imageFile'] = $imageId . '.png';
        unset($input['dataUrl']);
    }

    $input['id'] = $imageId;
    $input['createdAt'] = date('Y-m-d H:i:s');
    
    $garments[] = $input;
    $jsonOutput = json_encode($garments, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if (file_put_contents($dataFile, $jsonOutput) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save garments.json']);
        exit;
    }
    
    // Return saved garment with dataUrl
    $input['dataUrl'] = $imageData;
    echo json_encode($input, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = isset($input['id']) ? $input['id'] : (isset($_GET['id']) ? $_GET['id'] : null);
    
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id']);
        exit;
    }

    $garments = json_decode(file_get_contents($dataFile), true);
    if (!is_array($garments)) $garments = [];
    
    $garments = array_values(array_filter($garments, function($g) use ($id) {
        return isset($g['id']) && $g['id'] !== $id;
    }));
    
    $imagePath = $dataDir . '/' . $id . '.png';
    if (file_exists($imagePath)) {
        unlink($imagePath);
    }
    
    file_put_contents($dataFile, json_encode($garments, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
