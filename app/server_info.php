<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

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

function monitored_services(): array
{
    return [
        'nginx' => service_status('nginx'),
        'apache2' => service_status('apache2'),
        'httpd' => service_status('httpd'),
    ];
}
