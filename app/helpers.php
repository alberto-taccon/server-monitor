<?php

declare(strict_types=1);

function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function redirect(string $path): never
{
    header('Location: ' . $path);
    exit;
}

function percentage_class(float $value): string
{
    if ($value >= 90.0) {
        return 'danger';
    }

    if ($value >= 75.0) {
        return 'warning';
    }

    return 'success';
}

function clamp_percentage(float $value): float
{
    return min(100.0, max(0.0, $value));
}

function format_percentage(?float $value, int $decimals = 1): string
{
    if ($value === null) {
        return 'N/A';
    }

    return number_format($value, max(0, $decimals)) . '%';
}

function format_bytes_value(int|float|null $bytes): string
{
    if ($bytes === null || $bytes < 0) {
        return 'N/A';
    }

    $value = (float) $bytes;
    $units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    $unitIndex = 0;

    while ($value >= 1024 && $unitIndex < count($units) - 1) {
        $value /= 1024;
        $unitIndex++;
    }

    $precision = $value >= 100 || $unitIndex === 0 ? 0 : 1;

    return number_format($value, $precision) . ' ' . $units[$unitIndex];
}

function command_output(string $command): ?string
{
    $output = @shell_exec($command . ' 2>/dev/null');
    $output = is_string($output) ? trim($output) : '';

    return $output === '' ? null : $output;
}

function app_log(Throwable|string $message): void
{
    $text = $message instanceof Throwable ? $message->getMessage() : $message;
    error_log('[server-monitor] ' . $text);
}

function service_status(string $service): string
{
    $escaped = escapeshellarg($service);
    $result = command_output("systemctl is-active {$escaped}");

    if ($result === 'active') {
        return 'active';
    }

    if ($result !== null) {
        return $result;
    }

    $process = command_output("pgrep -x {$escaped}");

    return $process !== null ? 'running' : 'unavailable';
}
