<?php

declare(strict_types=1);

require_once __DIR__ . '/../app/metrics.php';
require_once __DIR__ . '/../app/server_info.php';

$dashboardMetrics = dashboard_metrics_payload();
$dbStatus = database_is_available();
$services = monitored_services();
$cards = $dashboardMetrics['cards'];
$chartLabels = $dashboardMetrics['charts']['labels'];
$cpuData = $dashboardMetrics['charts']['cpu'];
$ramData = $dashboardMetrics['charts']['ram'];
$historyCount = (int) $dashboardMetrics['history_count'];
$latestRecordedAt = $dashboardMetrics['latest_recorded_at'] ?? null;
$latestRecordedAtDisplay = $latestRecordedAt ?? 'No samples yet';
$autoRefreshMs = 5000;
$initialRefreshSeconds = (int) ceil($autoRefreshMs / 1000);
$cssVersion = (string) filemtime(__DIR__ . '/assets/css/app.css');
$jsVersion = (string) filemtime(__DIR__ . '/assets/js/dashboard.js');
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dashboard | Server Monitor</title>
    <script>
        (() => {
            try {
                const storedTheme = localStorage.getItem('server_monitor_theme');
                const theme = storedTheme === 'dark' || storedTheme === 'light'
                    ? storedTheme
                    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', theme);
            } catch (error) {
                document.documentElement.setAttribute('data-theme', 'light');
            }
        })();
    </script>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="/assets/css/app.css?v=<?= e($cssVersion) ?>" rel="stylesheet">
</head>
<body class="dashboard-page">
    <div class="app-layout" data-dashboard-shell>
        <aside class="sidebar">
            <div class="sidebar-tools">
                <a href="/dashboard.php" class="sidebar-badge" aria-label="Server Monitor dashboard">SM</a>
                <a
                    href="https://github.com/alberto-taccon"
                    class="sidebar-icon-link sidebar-icon-link-middle"
                    target="_blank"
                    rel="noopener"
                    aria-label="GitHub profile"
                    title="GitHub"
                >
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.56 7.56 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path>
                    </svg>
                </a>
                <button type="button" class="theme-toggle theme-toggle-sidebar sidebar-toggle-bottom" data-theme-toggle aria-pressed="false">
                    <span class="theme-toggle-icon" data-theme-toggle-icon aria-hidden="true"></span>
                    <span class="theme-toggle-label visually-hidden" data-theme-toggle-label>Dark mode</span>
                </button>
            </div>
        </aside>

        <main class="main-content">
            <header class="topbar">
                <div>
                    <p class="eyebrow">Linux VPS health</p>
                    <h1>Dashboard</h1>
                </div>
                <div class="topbar-actions">
                    <div class="refresh-indicator" data-refresh-indicator data-refresh-state="waiting">
                        <span class="refresh-indicator-status" data-refresh-status>Next update in <?= e((string) $initialRefreshSeconds) ?>s</span>
                    </div>
                </div>
            </header>

            <section class="row g-3 mb-4" id="overview" data-dashboard-group="overview">
                <?php foreach ($cards as $metricKey => $card): ?>
                    <div class="col-12 col-md-6 col-xl-3">
                        <article class="metric-card" data-metric-card="<?= e($metricKey) ?>">
                            <div class="mb-3">
                                <div>
                                    <h2><?= e($card['title']) ?></h2>
                                    <p><?= e($card['subtitle']) ?></p>
                                </div>
                            </div>
                            <strong class="<?= e($card['value_class'] ?? '') ?>" data-metric-value><?= e($card['formatted_value']) ?></strong>
                            <div class="progress mt-3<?= !($card['show_progress'] ?? true) ? ' d-none' : '' ?>" data-metric-progress-wrap role="progressbar" aria-valuenow="<?= e((string) $card['clamped_value']) ?>" aria-valuemin="0" aria-valuemax="100">
                                <div class="progress-bar bg-<?= e($card['variant']) ?>" data-metric-progress style="width: <?= e($card['clamped_value']) ?>%"></div>
                            </div>
                        </article>
                    </div>
                <?php endforeach; ?>
            </section>

            <section class="row g-3 mb-4" data-dashboard-group="charts">
                <div class="col-12 col-xl-6" id="cpu-history" data-dashboard-panel="cpu-history">
                    <article class="panel">
                        <div class="panel-header">
                            <h2>CPU History</h2>
                        </div>
                        <canvas id="cpuChart" height="115"></canvas>
                    </article>
                </div>
                <div class="col-12 col-xl-6" id="ram-history" data-dashboard-panel="ram-history">
                    <article class="panel">
                        <div class="panel-header">
                            <h2>RAM History</h2>
                        </div>
                        <canvas id="ramChart" height="115"></canvas>
                    </article>
                </div>
            </section>

            <section class="row g-3" data-dashboard-group="details">
                <div class="col-12 col-lg-6" id="system-info" data-dashboard-panel="system-info">
                    <article class="panel">
                        <div class="panel-header">
                            <h2>System Information</h2>
                        </div>
                        <dl class="system-list">
                            <div><dt>Server uptime</dt><dd><?= e(uptime_information()) ?></dd></div>
                            <div><dt>Operating system</dt><dd><?= e(os_information()) ?></dd></div>
                            <div><dt>PHP version</dt><dd><?= e(PHP_VERSION) ?></dd></div>
                            <div><dt>Last metric</dt><dd data-last-metric><?= e($latestRecordedAtDisplay) ?></dd></div>
                        </dl>
                    </article>
                </div>
                <div class="col-12 col-lg-6" id="service-status" data-dashboard-panel="service-status">
                    <article class="panel">
                        <div class="panel-header">
                            <h2>Service Status</h2>
                        </div>
                        <div class="status-list">
                            <div>
                                <span>Database</span>
                                <span class="badge text-bg-<?= $dbStatus ? 'success' : 'danger' ?>"><?= $dbStatus ? 'online' : 'offline' ?></span>
                            </div>
                            <?php foreach ($services as $service => $status): ?>
                                <?php $ok = in_array($status, ['active', 'running'], true); ?>
                                <div>
                                    <span><?= e($service) ?></span>
                                    <span class="badge text-bg-<?= $ok ? 'success' : 'secondary' ?>"><?= e($status) ?></span>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </article>
                </div>
            </section>

            <footer class="site-footer mt-4">
                <div class="panel footer-card d-flex justify-content-center align-items-center">
                    <div class="footer-left text-secondary fw-semibold">
                        <span>© 2026 Alberto Taccon</span>
                    </div>
                </div>
            </footer>
        </main>
    </div>

    <script>
        window.serverMonitorCharts = {
            labels: <?= json_encode($chartLabels, JSON_THROW_ON_ERROR) ?>,
            cpu: <?= json_encode($cpuData, JSON_THROW_ON_ERROR) ?>,
            ram: <?= json_encode($ramData, JSON_THROW_ON_ERROR) ?>,
            latestRecordedAt: <?= json_encode($latestRecordedAt, JSON_THROW_ON_ERROR) ?>,
            metricsEndpoint: '/api/metrics.php',
            autoRefreshMs: <?= e((string) $autoRefreshMs) ?>
        };
    </script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
    <script src="/assets/js/dashboard.js?v=<?= e($jsVersion) ?>"></script>
</body>
</html>
