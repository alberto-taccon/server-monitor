<?php

declare(strict_types=1);

require_once __DIR__ . '/../../app/metrics.php';

header('Content-Type: application/json; charset=utf-8');

try {
    echo json_encode(dashboard_metrics_payload(), JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    app_log($exception);
    http_response_code(500);
    echo json_encode([
        'error' => 'Unable to load dashboard metrics.',
    ], JSON_THROW_ON_ERROR);
}
