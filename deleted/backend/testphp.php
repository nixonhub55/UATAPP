
<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// MariaDB connection
$host = '127.0.0.1';
$port = '3306';
$dbname = 'uat_monitoring';
$username = 'root';
$password = 'PfNgB@y@n';

$pdo = new PDO(
    "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4",
    $username,
    $password,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
);

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    // GET: List projects
    if ($method === 'GET' && $action === 'projects') {
        $stmt = $pdo->query(
            'SELECT * FROM projects ORDER BY id DESC'
        );

        echo json_encode($stmt->fetchAll());
        exit;
    }

    // POST: Create project
    if ($method === 'POST' && $action === 'projects') {
        $input = json_decode(
            file_get_contents('php://input'),
            true
        );

        if (!is_array($input) ||
            empty(trim($input['name'] ?? ''))) {
            http_response_code(422);
            echo json_encode([
                'message' => 'Project name is required.'
            ]);
            exit;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO projects (name, description, status)
             VALUES (:name, :description, :status)'
        );

        $stmt->execute([
            'name' => trim($input['name']),
            'description' => $input['description'] ?? null,
            'status' => $input['status'] ?? 'Active',
        ]);

        http_response_code(201);

        echo json_encode([
            'id' => (int) $pdo->lastInsertId(),
            'name' => trim($input['name']),
            'description' => $input['description'] ?? null,
            'status' => $input['status'] ?? 'Active',
            'message' => 'Project created successfully.'
        ]);
        exit;
    }

    // GET: Dashboard
    if ($method === 'GET' && $action === 'dashboard') {
        $total = (int) $pdo->query(
            'SELECT COUNT(*) FROM projects'
        )->fetchColumn();

        echo json_encode([
            'total_projects' => $total,
        ]);
        exit;
    }

    http_response_code(404);
    echo json_encode(['message' => 'API endpoint not found.']);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['message' => 'A database operation failed.']);
}
