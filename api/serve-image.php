<?php
// Serve garment images
$dataDir = __DIR__ . '/garment-data';
$file = $_GET['file'] ?? '';

if (!$file || !preg_match('/^garment_[a-z0-9]+\.png$/', $file)) {
    http_response_code(404);
    exit;
}

$path = $dataDir . '/' . $file;
if (!file_exists($path)) {
    http_response_code(404);
    exit;
}

header('Content-Type: image/png');
header('Cache-Control: public, max-age=86400');
readfile($path);
