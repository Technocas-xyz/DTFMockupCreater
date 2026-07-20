<?php
require_once __DIR__ . '/auth-helpers.php';
requireAuth();
$db = getDB();
$itemId = $_GET['item_id'] ?? '';
if (!preg_match('/^[0-9a-f-]{36}$/i', $itemId)) { http_response_code(400); exit; }
$stmt = $db->prepare("SELECT COALESCE(a.file_url,i.artwork_image,i.front_image) url
  FROM public.order_items_dtf i LEFT JOIN LATERAL (SELECT file_url FROM public.artworks a WHERE a.order_id=i.order_id AND (a.artwork_no=i.artwork_no OR i.artwork_no IS NULL) ORDER BY (a.artwork_no=i.artwork_no) DESC,a.created_at LIMIT 1) a ON TRUE WHERE i.id=?");
$stmt->execute([$itemId]); $row=$stmt->fetch();
if (!$row || !$row['url']) { http_response_code(404); exit; }
$ch=curl_init($row['url']); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>true,CURLOPT_TIMEOUT=>20,CURLOPT_MAXREDIRS=>3]); $body=curl_exec($ch); $type=curl_getinfo($ch,CURLINFO_CONTENT_TYPE); $code=curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
if ($body===false || $code>=400) { http_response_code(502); exit; }
header('Content-Type: '.($type ?: 'image/png')); header('Cache-Control: private, max-age=300'); echo $body;
