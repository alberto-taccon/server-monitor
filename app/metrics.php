<?php

declare(strict_types=1);

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/helpers.php';

function latest_metric(): ?array
{
    try {
        $stmt = db()->query('SELECT * FROM server_metrics ORDER BY recorded_at DESC, id DESC LIMIT 1');
        $metric = $stmt->fetch();

        return $metric ?: null;
    } catch (Throwable $exception) {
        app_log($exception);
        return null;
    }
}

function metric_definitions(): array
{
    return [
        'cpu_usage' => ['title' => 'CPU Usage', 'subtitle' => 'Processor load'],
        'ram_usage' => ['title' => 'RAM Usage', 'subtitle' => 'System memory'],
        'disk_usage' => ['title' => 'Disk Usage', 'subtitle' => 'Root filesystem'],
    ];
}

function network_totals(): ?array
{
    if (!is_readable('/proc/net/dev')) {
        return null;
    }

    $lines = file('/proc/net/dev', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return null;
    }

    $rxBytes = 0;
    $txBytes = 0;
    $hasInterface = false;

    foreach ($lines as $line) {
        if (!str_contains($line, ':')) {
            continue;
        }

        [$interface, $stats] = explode(':', $line, 2);
        $interface = trim($interface);
        if ($interface === '' || $interface === 'lo') {
            continue;
        }

        $parts = preg_split('/\s+/', trim($stats));
        if (!is_array($parts) || count($parts) < 16) {
            continue;
        }

        $rxBytes += (int) ($parts[0] ?? 0);
        $txBytes += (int) ($parts[8] ?? 0);
        $hasInterface = true;
    }

    if (!$hasInterface) {
        return null;
    }

    return [
        'rx_bytes' => $rxBytes,
        'tx_bytes' => $txBytes,
    ];
}

function network_usage_snapshot(int $sampleMicroseconds = 200000): ?array
{
    $startedAt = microtime(true);
    $first = network_totals();

    if ($first === null) {
        return null;
    }

    usleep($sampleMicroseconds);

    $second = network_totals();
    $elapsedSeconds = max(0.001, microtime(true) - $startedAt);

    if ($second === null) {
        return null;
    }

    $rxPerSecond = max(0.0, ($second['rx_bytes'] - $first['rx_bytes']) / $elapsedSeconds);
    $txPerSecond = max(0.0, ($second['tx_bytes'] - $first['tx_bytes']) / $elapsedSeconds);

    return [
        'rx_per_second' => $rxPerSecond,
        'tx_per_second' => $txPerSecond,
        'total_per_second' => $rxPerSecond + $txPerSecond,
    ];
}

function metric_history(int $limit = 30): array
{
    $limit = min(200, max(1, $limit));

    try {
        $stmt = db()->prepare('
            SELECT id, recorded_at, cpu_usage, ram_usage, disk_usage
            FROM server_metrics
            ORDER BY recorded_at DESC, id DESC
            LIMIT :limit
        ');
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return array_reverse($stmt->fetchAll());
    } catch (Throwable $exception) {
        app_log($exception);
        return [];
    }
}

function metric_cards(?array $latest): array
{
    $cards = [];

    foreach (metric_definitions() as $metricKey => $definition) {
        $cards[] = [
            $definition['title'],
            isset($latest[$metricKey]) ? (float) $latest[$metricKey] : null,
            $definition['subtitle'],
        ];
    }

    return $cards;
}

function metric_card_payload(?array $latest): array
{
    $cards = [];

    foreach (metric_definitions() as $metricKey => $definition) {
        $value = isset($latest[$metricKey]) ? (float) $latest[$metricKey] : null;
        $cards[$metricKey] = [
            'title' => $definition['title'],
            'subtitle' => $definition['subtitle'],
            'value' => $value,
            'formatted_value' => format_percentage($value),
            'variant' => $value === null ? 'secondary' : percentage_class($value),
            'clamped_value' => clamp_percentage($value ?? 0.0),
            'show_progress' => true,
            'value_class' => '',
        ];
    }

    $network = network_usage_snapshot();
    $cards['network_usage'] = [
        'title' => 'Network Usage',
        'subtitle' => $network === null
            ? 'Live throughput unavailable'
            : 'RX ' . format_bytes_value($network['rx_per_second']) . '/s / TX ' . format_bytes_value($network['tx_per_second']) . '/s',
        'value' => $network,
        'formatted_value' => $network === null
            ? 'N/A'
            : format_bytes_value($network['total_per_second']) . '/s',
        'variant' => $network === null ? 'secondary' : 'primary',
        'clamped_value' => 0.0,
        'show_progress' => false,
        'value_class' => '',
    ];

    return $cards;
}

function dashboard_metrics_payload(int $limit = 30): array
{
    $history = metric_history($limit);
    $latest = latest_metric();

    return [
        'latest_recorded_at' => $latest['recorded_at'] ?? null,
        'history_count' => count($history),
        'charts' => [
            'labels' => array_map(static fn (array $row): string => date('H:i:s', strtotime($row['recorded_at'])), $history),
            'cpu' => array_map(static fn (array $row): float => (float) $row['cpu_usage'], $history),
            'ram' => array_map(static fn (array $row): float => (float) $row['ram_usage'], $history),
        ],
        'cards' => metric_card_payload($latest),
    ];
}
