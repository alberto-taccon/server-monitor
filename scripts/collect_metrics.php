#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once __DIR__ . '/../app/metrics.php';

function cpu_usage(): float
{
    $cpu = sampled_cpu_snapshot();

    if ($cpu === null || !isset($cpu['usage']) || !is_numeric($cpu['usage'])) {
        $load = sys_getloadavg();
        return isset($load[0]) ? min(100.0, round((float) $load[0] * 100, 2)) : 0.0;
    }

    return round((float) $cpu['usage'], 2);
}

function ram_usage(): float
{
    if (!is_readable('/proc/meminfo')) {
        return 0.0;
    }

    $data = file('/proc/meminfo', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($data === false) {
        return 0.0;
    }

    $values = [];
    foreach ($data as $line) {
        if (preg_match('/^([A-Za-z_()]+):\s+(\d+)/', $line, $matches)) {
            $values[$matches[1]] = (int) $matches[2];
        }
    }

    $total = $values['MemTotal'] ?? 0;
    $available = $values['MemAvailable'] ?? ($values['MemFree'] ?? 0);

    if ($total <= 0) {
        return 0.0;
    }

    return round((($total - $available) / $total) * 100, 2);
}

function disk_usage(string $path = '/'): float
{
    $total = @disk_total_space($path);
    $free = @disk_free_space($path);

    if ($total === false || $free === false || $total <= 0) {
        return 0.0;
    }

    return round((($total - $free) / $total) * 100, 2);
}

try {
    $cpu = sampled_cpu_snapshot();

    $metrics = [
        'cpu_usage' => isset($cpu['usage']) && is_numeric($cpu['usage'])
            ? round((float) $cpu['usage'], 2)
            : cpu_usage(),
        'ram_usage' => ram_usage(),
        'disk_usage' => disk_usage('/'),
    ];

    $stmt = db()->prepare('
        INSERT INTO server_metrics (cpu_usage, ram_usage, disk_usage)
        VALUES (:cpu_usage, :ram_usage, :disk_usage)
    ');
    $stmt->execute($metrics);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Metric collection failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}
