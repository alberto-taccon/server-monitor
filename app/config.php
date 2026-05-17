<?php

declare(strict_types=1);

function base_path(string $path = ''): string
{
    $base = dirname(__DIR__);

    return $path === '' ? $base : $base . DIRECTORY_SEPARATOR . ltrim($path, DIRECTORY_SEPARATOR);
}

function load_env(string $path): void
{
    if (!is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);

        // Keep the parser small but still support quoted values in local .env files.
        if ($value !== '' && (
            ($value[0] === '"' && substr($value, -1) === '"') ||
            ($value[0] === "'" && substr($value, -1) === "'")
        )) {
            $value = substr($value, 1, -1);
        }

        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

load_env(base_path('.env'));

function env_value(string $key, ?string $default = null): ?string
{
    $value = getenv($key);

    return $value === false ? $default : $value;
}

return [
    'database' => [
        'host' => env_value('DB_HOST', '127.0.0.1'),
        'port' => env_value('DB_PORT', '3306'),
        'database' => env_value('DB_DATABASE', 'server_monitor'),
        'username' => env_value('DB_USERNAME', 'root'),
        'password' => env_value('DB_PASSWORD', ''),
        'charset' => 'utf8mb4',
    ],
];
