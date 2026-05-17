#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once __DIR__ . '/../app/database.php';

function read_cpu_stat(): ?array
{
    if (!is_readable('/proc/stat')) {
        return null;
    }

    $handle = fopen('/proc/stat', 'rb');
    if ($handle === false) {
        return null;
    }

    $line = fgets($handle);
    fclose($handle);
    if (!is_string($line) || !str_starts_with($line, 'cpu ')) {
        return null;
    }

    $parts = array_values(array_filter(explode(' ', trim($line)), static fn (string $part): bool => $part !== ''));
    array_shift($parts);
    $values = array_map('intval', $parts);

    $idle = ($values[3] ?? 0) + ($values[4] ?? 0);
    $total = array_sum($values);

    return ['idle' => $idle, 'total' => $total];
}

function cpu_usage(): float
{
    $first = read_cpu_stat();
    usleep(250000);
    $second = read_cpu_stat();

    if ($first === null || $second === null) {
        $load = sys_getloadavg();
        return isset($load[0]) ? min(100.0, round((float) $load[0] * 100, 2)) : 0.0;
    }

    $idleDelta = $second['idle'] - $first['idle'];
    $totalDelta = $second['total'] - $first['total'];

    if ($totalDelta <= 0) {
        return 0.0;
    }

    return round((1 - ($idleDelta / $totalDelta)) * 100, 2);
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
    $metrics = [
        'cpu_usage' => cpu_usage(),
        'ram_usage' => ram_usage(),
        'disk_usage' => disk_usage('/'),
    ];

    $stmt = db()->prepare('
        INSERT INTO server_metrics (cpu_usage, ram_usage, disk_usage)
        VALUES (:cpu_usage, :ram_usage, :disk_usage)
    ');
    $stmt->execute($metrics);

    echo sprintf(
        "Metric collected: CPU %.2f%%, RAM %.2f%%, Disk %.2f%%\n",
        $metrics['cpu_usage'],
        $metrics['ram_usage'],
        $metrics['disk_usage']
    );
} catch (Throwable $exception) {
    fwrite(STDERR, 'Metric collection failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}
