<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    global $config;

    $database = $config['database'];
    // A single PDO instance per request keeps connection handling predictable.
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        $database['host'],
        $database['port'],
        $database['database'],
        $database['charset']
    );

    $pdo = new PDO($dsn, $database['username'], $database['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function database_is_available(): bool
{
    try {
        db()->query('SELECT 1');
        return true;
    } catch (Throwable) {
        return false;
    }
}
