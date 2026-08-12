<?php
/**
 * Garment Types API - Dynamic categories mapped to Garment Fit
 * GET    - List all types (optionally filter by fit)
 * POST   - Add a new type
 * PUT    - Update a type
 * DELETE - Delete a type
 *
 * Each type: { id, name, fits: ['Men','Women','Unisex','Kids'] }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataFile = __DIR__ . '/garment-data/garment-types.json';

if (!is_dir(dirname($dataFile))) {
    mkdir(dirname($dataFile), 0755, true);
}

function loadTypes() {
    global $dataFile;
    if (!file_exists($dataFile)) {
        $defaults = [
            ['id' => 'tshirt', 'name' => 'T-Shirt', 'fits' => ['Men', 'Women', 'Unisex', 'Kids']],
            ['id' => 'hoodie', 'name' => 'Hoodie', 'fits' => ['Men', 'Women', 'Unisex', 'Kids']],
            ['id' => 'women-tshirt', 'name' => 'Women T-Shirt', 'fits' => ['Women']],
            ['id' => 'sweatshirt', 'name' => 'Sweatshirt', 'fits' => ['Men', 'Women', 'Unisex']],
            ['id' => 'long-sleeve', 'name' => 'Long Sleeve T-Shirt', 'fits' => ['Men', 'Women', 'Unisex']],
            ['id' => 'tank-top', 'name' => 'Tank Top', 'fits' => ['Men', 'Women', 'Unisex']],
            ['id' => 'shorts', 'name' => 'Shorts', 'fits' => ['Men', 'Women', 'Unisex', 'Kids']],
            ['id' => 'bob-marley', 'name' => 'Bob Marley', 'fits' => ['Men', 'Women', 'Unisex']],
        ];
        file_put_contents($dataFile, json_encode($defaults, JSON_PRETTY_PRINT));
        return $defaults;
    }
    $content = file_get_contents($dataFile);
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function saveTypes($types) {
    global $dataFile;
    file_put_contents($dataFile, json_encode(array_values($types), JSON_PRETTY_PRINT));
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $types = loadTypes();
        // Optional filter by fit
        $fit = isset($_GET['fit']) ? $_GET['fit'] : null;
        if ($fit && $fit !== 'All') {
            $types = array_values(array_filter($types, function($t) use ($fit) {
                return in_array($fit, $t['fits']);
            }));
        }
        echo json_encode($types);
        break;

    case 'POST':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !isset($input['name']) || !isset($input['fits'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields: name, fits']);
            exit;
        }
        $types = loadTypes();
        $id = strtolower(preg_replace('/[^a-z0-9]+/i', '-', trim($input['name'])));
        // Check duplicate
        foreach ($types as $t) {
            if ($t['id'] === $id) {
                http_response_code(409);
                echo json_encode(['error' => 'Type already exists']);
                exit;
            }
        }
        $newType = [
            'id' => $id,
            'name' => trim($input['name']),
            'fits' => $input['fits'],
        ];
        $types[] = $newType;
        saveTypes($types);
        echo json_encode($newType);
        break;

    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !isset($input['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required field: id']);
            exit;
        }
        $types = loadTypes();
        $found = false;
        foreach ($types as &$t) {
            if ($t['id'] === $input['id']) {
                if (isset($input['name'])) $t['name'] = trim($input['name']);
                if (isset($input['fits'])) $t['fits'] = $input['fits'];
                $found = true;
                break;
            }
        }
        if (!$found) {
            http_response_code(404);
            echo json_encode(['error' => 'Type not found']);
            exit;
        }
        saveTypes($types);
        echo json_encode(['success' => true]);
        break;

    case 'DELETE':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !isset($input['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required field: id']);
            exit;
        }
        $types = loadTypes();
        $types = array_filter($types, function($t) use ($input) {
            return $t['id'] !== $input['id'];
        });
        saveTypes($types);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
