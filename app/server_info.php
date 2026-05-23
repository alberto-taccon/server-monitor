<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/database.php';

function os_information(): string
{
    if (is_readable('/etc/os-release')) {
        $contents = file('/etc/os-release', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($contents !== false) {
            foreach ($contents as $line) {
                if (str_starts_with($line, 'PRETTY_NAME=')) {
                    return trim(substr($line, 12), "\"'");
                }
            }
        }
    }

    return php_uname('s') . ' ' . php_uname('r');
}

function uptime_information(): string
{
    return command_output('uptime -p') ?? 'Unavailable';
}

function load_average_information(): string
{
    $load = sys_getloadavg();

    if (!is_array($load) || !isset($load[0], $load[1], $load[2])) {
        return 'Unavailable';
    }

    return sprintf('%.2f / %.2f / %.2f', (float) $load[0], (float) $load[1], (float) $load[2]);
}

function disk_free_information(string $path = '/'): string
{
    $total = @disk_total_space($path);
    $free = @disk_free_space($path);

    if ($total === false || $free === false || $total <= 0) {
        return 'Unavailable';
    }

    return sprintf('%s free of %s', format_bytes_value($free), format_bytes_value($total));
}

function swap_usage_information(): ?array
{
    if (!is_readable('/proc/meminfo')) {
        return null;
    }

    $lines = file('/proc/meminfo', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return null;
    }

    $values = [];

    foreach ($lines as $line) {
        if (preg_match('/^([A-Za-z_()]+):\s+(\d+)/', $line, $matches)) {
            $values[$matches[1]] = (int) $matches[2];
        }
    }

    $totalKb = $values['SwapTotal'] ?? null;
    $freeKb = $values['SwapFree'] ?? null;

    if (!is_int($totalKb) || !is_int($freeKb)) {
        return null;
    }

    $usedKb = max(0, $totalKb - $freeKb);
    $percent = $totalKb > 0 ? round(($usedKb / $totalKb) * 100, 1) : 0.0;

    return [
        'total_bytes' => $totalKb * 1024,
        'used_bytes' => $usedKb * 1024,
        'free_bytes' => $freeKb * 1024,
        'percent' => $percent,
    ];
}

function swap_usage_summary(): string
{
    $swap = swap_usage_information();

    if ($swap === null) {
        return 'Unavailable';
    }

    if (($swap['total_bytes'] ?? 0) <= 0) {
        return 'Swap disabled';
    }

    return sprintf(
        '%s used of %s (%s)',
        format_bytes_value((float) ($swap['used_bytes'] ?? 0)),
        format_bytes_value((float) ($swap['total_bytes'] ?? 0)),
        format_percentage(isset($swap['percent']) && is_numeric($swap['percent']) ? (float) $swap['percent'] : null, 1)
    );
}

function service_candidates_from_string(?string $value): array
{
    if ($value === null || trim($value) === '') {
        return [];
    }

    return array_values(array_filter(
        array_map('trim', explode('|', $value)),
        static fn (string $candidate): bool => $candidate !== ''
    ));
}

function service_status_from_candidates(array $candidates): string
{
    $fallback = 'unavailable';

    foreach ($candidates as $candidate) {
        $status = service_status($candidate);

        if (in_array($status, ['active', 'running'], true)) {
            return $status;
        }

        if ($status !== 'unavailable' && $fallback === 'unavailable') {
            $fallback = $status;
        }
    }

    return $fallback;
}

function extra_monitored_services(): array
{
    $value = env_value('SERVICE_EXTRA', '');
    if ($value === null || trim($value) === '') {
        return [];
    }

    $services = [];
    $pairs = preg_split('/\s*,\s*/', trim($value)) ?: [];

    foreach ($pairs as $pair) {
        if ($pair === '' || !str_contains($pair, '=')) {
            continue;
        }

        [$label, $targets] = explode('=', $pair, 2);
        $label = trim($label);
        $candidates = service_candidates_from_string($targets);

        if ($label === '' || $candidates === []) {
            continue;
        }

        $services[$label] = $candidates;
    }

    return $services;
}

function metrics_collector_status(): string
{
    try {
        $stmt = db()->query('SELECT recorded_at FROM server_metrics ORDER BY id DESC LIMIT 1');
        $row = $stmt->fetch();
    } catch (Throwable $exception) {
        app_log($exception);
        return 'missing';
    }

    if (!is_array($row) || !isset($row['recorded_at'])) {
        return 'missing';
    }

    $recordedAt = strtotime((string) $row['recorded_at']);
    if ($recordedAt === false) {
        return 'missing';
    }

    $staleAfter = max(5, (int) (env_value('SERVICE_COLLECTOR_STALE_AFTER', '20') ?? '20'));

    return (time() - $recordedAt) <= $staleAfter ? 'running' : 'stale';
}

function monitored_services(): array
{
    $definitions = [
        'Web server' => service_candidates_from_string(env_value('SERVICE_WEB', 'nginx|apache2|httpd')),
        'PHP runtime' => service_candidates_from_string(env_value('SERVICE_PHP', 'php8.3-fpm|php-fpm|php8.2-fpm|php8.1-fpm')),
    ];

    $services = [];

    foreach ($definitions as $label => $candidates) {
        if ($candidates === []) {
            continue;
        }

        $services[$label] = service_status_from_candidates($candidates);
    }

    if (strtolower((string) env_value('SERVICE_COLLECTOR_ENABLED', 'true')) !== 'false') {
        $services[env_value('SERVICE_COLLECTOR_LABEL', 'Metrics collector') ?? 'Metrics collector'] = metrics_collector_status();
    }

    foreach (extra_monitored_services() as $label => $candidates) {
        $services[$label] = service_status_from_candidates($candidates);
    }

    return $services;
}
