<?php
/**
 * Artwork Size Presets API
 * GET    - List all presets
 * POST   - Add a new preset
 * PUT    - Update a preset
 * DELETE - Delete a preset
 * 
 * Presets are stored in a JSON file on the server.
 * Each preset: { id, label, value, lockBy: 'width'|'height' }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataFile = __DIR__ . '/garment-data/artwork-sizes.json';

// Ensure directory exists
if (!is_dir(dirname($dataFile))) {
    mkdir(dirname($dataFile), 0755, true);
}

// Load existing presets
function loadPresets() {
    global $dataFile;
    if (!file_exists($dataFile)) {
        // Default presets
        $defaults = [
            ['id' => 'w-10.75', 'label' => 'W 10.75"', 'value' => 10.75, 'lockBy' => 'width'],
            ['id' => 'w-11', 'label' => 'W 11"', 'value' => 11, 'lockBy' => 'width'],
            ['id' => 'w-12', 'label' => 'W 12"', 'value' => 12, 'lockBy' => 'width'],
            ['id' => 'w-13', 'label' => 'W 13"', 'value' => 13, 'lockBy' => 'width'],
            ['id' => 'w-14', 'label' => 'W 14"', 'value' => 14, 'lockBy' => 'width'],
            ['id' => 'h-10.75', 'label' => 'H 10.75"', 'value' => 10.75, 'lockBy' => 'height'],
            ['id' => 'h-11', 'label' => 'H 11"', 'value' => 11, 'lockBy' => 'height'],
            ['id' => 'h-12', 'label' => 'H 12"', 'value' => 12, 'lockBy' => 'height'],
            ['id' => 'h-13', 'label' => 'H 13"', 'value' => 13, 'lockBy' => 'height'],
            ['id' => 'h-14', 'label' => 'H 14"', 'value' => 14, 'lockBy' => 'height'],
        ];
        file_put_contents($dataFile, json_encode($defaults, JSON_PRETTY_PRINT));
        return $defaults;
    }
    $content = file_get_contents($dataFile);
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function savePresets($presets) {
    global $dataFile;
    file_put_contents($dataFile, json_encode(array_values($presets), JSON_PRETTY_PRINT));
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        echo json_encode(loadPresets());
        break;

    case 'POST':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !isset($input['value']) || !isset($input['lockBy'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields: value, lockBy']);
            exit;
        }
        $presets = loadPresets();
        $value = floatval($input['value']);
        $lockBy = $input['lockBy'] === 'height' ? 'height' : 'width';
        $prefix = $lockBy === 'width' ? 'W' : 'H';
        $id = strtolower($prefix) . '-' . $value;
        $label = isset($input['label']) ? $input['label'] : $prefix . ' ' . $value . '"';

        // Check for duplicate
        foreach ($presets as $p) {
            if ($p['id'] === $id) {
                http_response_code(409);
                echo json_encode(['error' => 'Preset already exists']);
                exit;
            }
        }

        $newPreset = [
            'id' => $id,
            'label' => $label,
            'value' => $value,
            'lockBy' => $lockBy,
        ];
        $presets[] = $newPreset;
        savePresets($presets);
        echo json_encode($newPreset);
        break;

    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !isset($input['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required field: id']);
            exit;
        }
        $presets = loadPresets();
        $found = false;
        foreach ($presets as &$p) {
            if ($p['id'] === $input['id']) {
                if (isset($input['value'])) $p['value'] = floatval($input['value']);
                if (isset($input['label'])) $p['label'] = $input['label'];
                if (isset($input['lockBy'])) $p['lockBy'] = $input['lockBy'];
                $found = true;
                break;
            }
        }
        if (!$found) {
            http_response_code(404);
            echo json_encode(['error' => 'Preset not found']);
            exit;
        }
        savePresets($presets);
        echo json_encode(['success' => true]);
        break;

    case 'DELETE':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !isset($input['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required field: id']);
            exit;
        }
        $presets = loadPresets();
        $presets = array_filter($presets, function($p) use ($input) {
            return $p['id'] !== $input['id'];
        });
        savePresets($presets);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
