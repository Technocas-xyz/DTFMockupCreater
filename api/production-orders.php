<?php
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once __DIR__ . '/auth-helpers.php';
$user = requireAuth();
$db = getDB();

function uuidOk($value) { return is_string($value) && preg_match('/^[0-9a-f-]{36}$/i', $value); }
function customerExpr() { return "COALESCE(c.name,s.name,o.contact_name,o.shipping_name,'Unknown Customer')"; }

if ($_SERVER['REQUEST_METHOD'] === 'GET' && empty($_GET['order_id'])) {
    $search = trim($_GET['search'] ?? '');
    $sql = "SELECT o.id,o.order_number,o.order_date,o.status,o.total,o.customer_id,o.supplier_id,
                   " . customerExpr() . " customer_name,
                   COALESCE(c.email,s.email,o.contact_email) email,
                   COALESCE(c.phone,s.phone,o.contact_phone) phone,
                   COUNT(DISTINCT i.id) item_count
            FROM public.orders o
            LEFT JOIN public.customers c ON c.id=o.customer_id
            LEFT JOIN public.suppliers s ON s.id=o.supplier_id
            LEFT JOIN public.order_items_dtf i ON i.order_id=o.id
            WHERE o.order_type='dtf' AND o.deleted_at IS NULL";
    $params = [];
    if ($search !== '') { $sql .= " AND (" . customerExpr() . " ILIKE ? OR o.order_number ILIKE ?)"; $params = ["%$search%", "%$search%"] ; }
    $sql .= " GROUP BY o.id,c.name,c.email,c.phone,s.name,s.email,s.phone ORDER BY o.created_at DESC LIMIT 500";
    $stmt = $db->prepare($sql); $stmt->execute($params); $orders = $stmt->fetchAll();
    $customers = [];
    foreach ($orders as $order) {
        $key = $order['customer_id'] ?: ($order['supplier_id'] ?: strtolower($order['customer_name']));
        if (!isset($customers[$key])) $customers[$key] = ['id'=>$key,'name'=>$order['customer_name'],'email'=>$order['email'],'phone'=>$order['phone'],'orders'=>[]];
        $customers[$key]['orders'][] = $order;
    }
    echo json_encode(['customers'=>array_values($customers),'refreshed_at'=>gmdate('c')]); exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $orderId = $_GET['order_id'] ?? '';
    if (!uuidOk($orderId)) { http_response_code(400); echo json_encode(['error'=>'Invalid order id']); exit; }
    $stmt = $db->prepare("SELECT o.*, " . customerExpr() . " customer_name,
                                COALESCE(c.email,s.email,o.contact_email) customer_email,
                                COALESCE(c.phone,s.phone,o.contact_phone) customer_phone,
                                po.po_number
                         FROM public.orders o
                         LEFT JOIN public.customers c ON c.id=o.customer_id
                         LEFT JOIN public.suppliers s ON s.id=o.supplier_id
                         LEFT JOIN LATERAL (SELECT po_number FROM public.purchase_orders WHERE order_id=o.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) po ON TRUE
                         WHERE o.id=? AND o.order_type='dtf' AND o.deleted_at IS NULL");
    $stmt->execute([$orderId]); $order = $stmt->fetch();
    if (!$order) { http_response_code(404); echo json_encode(['error'=>'DTF sales order not found']); exit; }
    $stmt = $db->prepare("SELECT i.id order_item_id,i.artwork_no,i.artwork_name,i.size,i.qty,i.unit_price,i.amount,
                                a.id artwork_id,a.artwork_no stored_artwork_no,a.name stored_name,a.width_inches,a.height_inches,a.qty artwork_qty,
                                CASE WHEN COALESCE(a.file_url,i.artwork_image,i.front_image) IS NULL THEN FALSE ELSE TRUE END has_image
                         FROM public.order_items_dtf i
                         LEFT JOIN LATERAL (SELECT * FROM public.artworks a WHERE a.order_id=i.order_id AND (a.artwork_no=i.artwork_no OR i.artwork_no IS NULL) ORDER BY (a.artwork_no=i.artwork_no) DESC,a.created_at LIMIT 1) a ON TRUE
                         WHERE i.order_id=? ORDER BY i.sort_order,i.id");
    $stmt->execute([$orderId]); $items = $stmt->fetchAll();
    echo json_encode(['order'=>$order,'items'=>$items]); exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $orderId = $input['order_id'] ?? '';
    if (!uuidOk($orderId) || !is_array($input['artworks'] ?? null)) { http_response_code(400); echo json_encode(['error'=>'Valid order and artworks are required']); exit; }
    $check = $db->prepare("SELECT customer_id FROM public.orders WHERE id=? AND order_type='dtf' AND deleted_at IS NULL"); $check->execute([$orderId]); $order = $check->fetch();
    if (!$order) { http_response_code(404); echo json_encode(['error'=>'DTF sales order not found']); exit; }
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("INSERT INTO gang_sheets (order_id,customer_id,created_by,status,sheet_width,total_height,total_sheets,total_artworks,total_quantity,estimated_price,settings,layout)
          VALUES (?,?,?,'ready',?,?,?,?,?,?,?::jsonb,?::jsonb)
          ON CONFLICT (order_id) DO UPDATE SET customer_id=EXCLUDED.customer_id,created_by=EXCLUDED.created_by,status='ready',sheet_width=EXCLUDED.sheet_width,total_height=EXCLUDED.total_height,total_sheets=EXCLUDED.total_sheets,total_artworks=EXCLUDED.total_artworks,total_quantity=EXCLUDED.total_quantity,estimated_price=EXCLUDED.estimated_price,settings=EXCLUDED.settings,layout=EXCLUDED.layout,updated_at=NOW() RETURNING id");
        $stmt->execute([$orderId,$order['customer_id'],$user['id'],22,(float)($input['total_height']??0),(int)($input['total_sheets']??1),count($input['artworks']),(int)($input['total_quantity']??0),(float)($input['estimated_price']??0),json_encode($input['settings']??[]),json_encode($input['layout']??[])]);
        $sheetId = $stmt->fetch()['id'];
        $db->prepare("DELETE FROM gang_sheet_artworks WHERE gang_sheet_id=?")->execute([$sheetId]);
        $ins = $db->prepare("INSERT INTO gang_sheet_artworks (gang_sheet_id,order_item_id,artwork_id,artwork_no,filename,image_url,width_inches,height_inches,quantity,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)");
        foreach ($input['artworks'] as $idx=>$art) $ins->execute([$sheetId,uuidOk($art['orderItemId']??'')?$art['orderItemId']:null,uuidOk($art['artworkId']??'')?$art['artworkId']:null,$art['artworkNo']??null,substr($art['filename']??'artwork.png',0,255),$art['sourceUrl']??null,(float)($art['widthInches']??0),(float)($art['heightInches']??0),max(1,(int)($art['repetitions']??1)),$idx]);
        $db->prepare("UPDATE public.orders SET gangsheet_status='ready',gangsheet_generated_at=NOW() WHERE id=?")->execute([$orderId]);
        $db->commit(); echo json_encode(['success'=>true,'gang_sheet_id'=>$sheetId,'saved_at'=>gmdate('c')]);
    } catch (Throwable $e) { $db->rollBack(); error_log('[gangsheet-save] '.$e->getMessage()); http_response_code(500); echo json_encode(['error'=>'Gang sheet could not be saved']); }
    exit;
}
http_response_code(405); echo json_encode(['error'=>'Method not allowed']);
