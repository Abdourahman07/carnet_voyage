<?php
// Compatible avec le PHP 5.5 du Wamp local.
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond($data, $status = 200) { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fail($message, $status = 400) { respond(array('error' => $message), $status); }
if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(openssl_random_pseudo_bytes(24)); }
$token = $_SESSION['csrf'];
session_write_close();
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET' && $method !== 'POST') { fail('Méthode non autorisée.', 405); }
if ($method === 'POST' && (!isset($_SERVER['HTTP_X_CSRF_TOKEN']) || $_SERVER['HTTP_X_CSRF_TOKEN'] !== $token)) { fail('Session expirée : rechargez le carnet.', 403); }
$file = fopen(__DIR__ . '/data/carnet.json', 'c+');
if (!$file || !flock($file, LOCK_EX)) { fail('Le dossier data doit être accessible en écriture.', 500); }
$raw = stream_get_contents($file);
$data = $raw === '' ? json_decode(file_get_contents(__DIR__ . '/data/seed.json'), true) : json_decode($raw, true);
if (!is_array($data) || !isset($data['memories'], $data['places'])) { fail('La sauvegarde est illisible. Restaurez le dossier data depuis une sauvegarde.', 500); }
if ($method === 'GET') { flock($file, LOCK_UN); fclose($file); $data['token'] = $token; $data['uploadLimit'] = ini_get('upload_max_filesize'); respond($data); }
function field($key) { return isset($_POST[$key]) ? trim($_POST[$key]) : ''; }
$action = field('action');
$id = field('id');
$index = -1;
foreach ($data['memories'] as $i => $item) { if ($item['id'] === $id) { $index = $i; break; } }
if ($action === 'favorite' || $action === 'delete') {
    if ($index < 0) { fail('Souvenir introuvable.', 404); }
    if ($action === 'favorite') { $data['memories'][$index]['favorite'] = !$data['memories'][$index]['favorite']; }
    else { array_splice($data['memories'], $index, 1); }
} elseif ($action === 'save') {
    $title = field('title'); $owner = field('owner'); $place = field('place'); $date = field('date'); $note = field('note');
    if ($title === '' || strlen($title) > 480 || strlen($note) > 12000) { fail('Renseignez un titre de moins de 120 caractères et une note de moins de 3 000 caractères.'); }
    if (!in_array($owner, array('madina', 'abdourahman', 'nous'), true)) { fail('Choisissez un carnet.'); }
    if ($date !== '') { $parsed = DateTime::createFromFormat('!Y-m-d', $date); if (!$parsed || $parsed->format('Y-m-d') !== $date) { fail('Date invalide.'); } }
    if ($id !== '' && $index < 0) { fail('Ce souvenir n’existe plus.', 404); }
    $custom = field('customPlace');
    if ($custom !== '') {
        if (strlen($custom) > 320) { fail('Le nom du lieu est trop long.'); }
        $lat = field('lat'); $lng = field('lng');
        if (($lat === '') !== ($lng === '') || ($lat !== '' && (!is_numeric($lat) || !is_numeric($lng) || abs((float)$lat) > 90 || abs((float)$lng) > 180))) { fail('Indiquez une latitude et une longitude valides, ou laissez les deux champs vides.'); }
        $place = 'lieu-' . bin2hex(openssl_random_pseudo_bytes(6));
        $data['places'][] = array('id'=>$place,'name'=>$custom,'country'=>'','lat'=>$lat === '' ? null : (float)$lat,'lng'=>$lng === '' ? null : (float)$lng,'owners'=>$owner === 'nous' ? array('madina','abdourahman') : array($owner));
    } elseif ($place !== '') {
        $found = false; foreach ($data['places'] as $p) { if ($p['id'] === $place) { $found = true; break; } } if (!$found) { fail('Lieu inconnu.'); }
    }
    $photo = $index >= 0 ? $data['memories'][$index]['photo'] : '';
    if (isset($_FILES['photo']) && $_FILES['photo']['error'] !== UPLOAD_ERR_NO_FILE) {
        $upload = $_FILES['photo'];
        if ($upload['error'] !== UPLOAD_ERR_OK) { fail('Photo non reçue. Limite actuelle du serveur : ' . ini_get('upload_max_filesize') . '. Essayez une photo plus légère.'); }
        if ($upload['size'] > 12 * 1024 * 1024) { fail('Choisissez une photo de moins de 12 Mo.'); }
        $info = @getimagesize($upload['tmp_name']);
        $types = array('image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif');
        if (!$info || !isset($types[$info['mime']])) { fail('Choisissez une vraie image JPG, PNG, WebP ou GIF.'); }
        $photo = 'uploads/' . bin2hex(openssl_random_pseudo_bytes(16)) . '.' . $types[$info['mime']];
        if (!move_uploaded_file($upload['tmp_name'], __DIR__ . '/' . $photo)) { fail('Impossible d’enregistrer la photo. Vérifiez le dossier uploads.', 500); }
    }
    $memory = array('id'=>$index >= 0 ? $id : bin2hex(openssl_random_pseudo_bytes(12)), 'title'=>$title,'owner'=>$owner,'place'=>$place,'date'=>$date,'note'=>$note,'photo'=>$photo,'favorite'=>$index >= 0 ? $data['memories'][$index]['favorite'] : false);
    if ($index >= 0) { $data['memories'][$index] = $memory; } else { array_unshift($data['memories'], $memory); }
} else { fail('Action inconnue. La photo dépasse peut-être la limite post_max_size du serveur.'); }
$encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encoded === false) { fail('Texte invalide.', 400); }
rewind($file);
if (fwrite($file, $encoded) !== strlen($encoded) || !ftruncate($file, strlen($encoded)) || !fflush($file)) { fail('Échec de sauvegarde : vérifiez l’espace disque et les permissions.', 500); }
flock($file, LOCK_UN); fclose($file);
$data['token'] = $token; respond($data);
