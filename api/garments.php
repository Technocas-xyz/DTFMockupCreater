<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = __DIR__ . '/garment-data';
$dataFile = $dataDir . '/garments.json';

// Create directory if not exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

// Initialize file if not exists
if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode([]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // Return all garments
    $data = file_get_contents($dataFile);
    echo $data;
    exit;
}

if ($method === 'POST') {
    // Save a new garment
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['name']) || !isset($input['dataUrl'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields']);
        exit;
    }

    $garments = json_decode(file_get_contents($dataFile), true) ?: [];
    
    // Save image to file (strip data URL prefix, save as PNG)
    $imageData = $input['dataUrl'];
    $imageId = uniqid('garment_');
    
    // Save base64 image as file
    if (strpos($imageData, 'data:image/png;base64,') === 0) {
        $base64 = str_replace('data:image/png;base64,', '', $imageData);
        $imageBytes = base64_decode($base64);
        $imagePath = $dataDir . '/' . $imageId . '.png';
        file_put_contents($imagePath, $imageBytes);
        // Store relative path instead of full data URL
        $input['imageFile'] = $imageId . '.png';
        unset($input['dataUrl']); // Don't store huge base64 in JSON
    }

    $input['id'] = $imageId;
    $input['createdAt'] = date('Y-m-d H:i:s');
    
    $garments[] = $input;
    file_put_contents($dataFile, json_encode($garments, JSON_PRETTY_PRINT));
    
    // Return with dataUrl for client
    $input['dataUrl'] = $imageData;
    echo json_encode($input);
    exit;
}

if ($method === 'DELETE') {
    // Delete a garment
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? $_GET['id'] ?? null;
    
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id']);
        exit;
    }

    $garments = json_decode(file_get_contents($dataFile), true) ?: [];
    $garments = array_filter($garments, function($g) use ($id) {
        return $g['id'] !== $id;
    });
    $garments = array_values($garments);
    
    // Delete image file
    $imagePath = $dataDir . '/' . $id . '.png';
    if (file_exists($imagePath)) {
        unlink($imagePath);
    }
    
    file_put_contents($dataFile, json_encode($garments, JSON_PRETTY_PRINT));
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
