const chartData = window.serverMonitorCharts || { labels: [], cpu: [], ram: [] };
const THEME_STORAGE_KEY = 'server_monitor_theme';

function minuteLabel(label) {
    if (typeof label !== 'string' || label.length < 5) {
        return '';
    }

    return label.slice(0, 5);
}

function chartThemeColors() {
    const styles = getComputedStyle(document.documentElement);

    return {
        grid: styles.getPropertyValue('--chart-grid').trim() || 'rgba(148, 163, 184, .16)',
        tick: styles.getPropertyValue('--chart-tick').trim() || '#6b7280',
        tooltipBackground: styles.getPropertyValue('--tooltip-bg').trim() || 'rgba(15, 23, 42, .94)',
        tooltipText: styles.getPropertyValue('--tooltip-ink').trim() || '#f8fafc'
    };
}

const baseOptions = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
        x: {
            ticks: {
                autoSkip: false,
                maxRotation: 0,
                callback(value, index) {
                    const labels = Array.isArray(this.chart?.data?.labels) ? this.chart.data.labels : [];
                    const currentLabel = typeof labels[index] === 'string' ? labels[index] : '';
                    const previousLabel = index > 0 && typeof labels[index - 1] === 'string' ? labels[index - 1] : '';
                    const currentMinute = minuteLabel(currentLabel);
                    const previousMinute = minuteLabel(previousLabel);

                    if (index === 0 || currentMinute !== previousMinute) {
                        return currentMinute;
                    }

                    return '';
                }
            }
        },
        y: {
            min: 0,
            max: 100,
            ticks: {
                callback: (value) => `${value}%`
            }
        }
    },
    plugins: {
        legend: {
            display: false
        },
        tooltip: {
            callbacks: {
                label: (context) => `${context.dataset.label}: ${context.parsed.y}%`
            }
        }
    }
};

function createLineChart(canvasId, label, values, color) {
    const element = document.getElementById(canvasId);

    if (!element) {
        return;
    }

    const chart = new Chart(element, {
        type: 'line',
        data: {
            labels: [...chartData.labels],
            datasets: [{
                label,
                data: [...values],
                borderColor: color,
                backgroundColor: `${color}22`,
                fill: true,
                tension: 0.35,
                pointRadius: 2,
                borderWidth: 2
            }]
        },
        options: baseOptions
    });

    applyChartTheme(chart);

    return chart;
}

const charts = {
    cpu: createLineChart('cpuChart', 'CPU usage', chartData.cpu, '#2563eb'),
    ram: createLineChart('ramChart', 'RAM usage', chartData.ram, '#0891b2')
};
const dashboardShell = document.querySelector('[data-dashboard-shell]');
const dashboardGroups = Array.from(document.querySelectorAll('[data-dashboard-group]'));
const dashboardPanels = Array.from(document.querySelectorAll('[data-dashboard-panel]'));
const dashboardViewLinks = Array.from(document.querySelectorAll('[data-view-target]'));
const dashboardViews = new Set(['dashboard', ...dashboardPanels.map((panel) => panel.dataset.dashboardPanel)]);
const refreshIndicator = document.querySelector('[data-refresh-indicator]');
const refreshStatus = document.querySelector('[data-refresh-status]');
const themeToggle = document.querySelector('[data-theme-toggle]');
const themeToggleIcon = document.querySelector('[data-theme-toggle-icon]');
const themeToggleLabel = document.querySelector('[data-theme-toggle-label]');

function applyChartTheme(chart) {
    if (!chart) {
        return;
    }

    const colors = chartThemeColors();
    chart.options.scales.x.ticks.color = colors.tick;
    chart.options.scales.x.grid.color = colors.grid;
    chart.options.scales.y.ticks.color = colors.tick;
    chart.options.scales.y.grid.color = colors.grid;
    chart.options.plugins.tooltip.backgroundColor = colors.tooltipBackground;
    chart.options.plugins.tooltip.titleColor = colors.tooltipText;
    chart.options.plugins.tooltip.bodyColor = colors.tooltipText;
    chart.options.plugins.tooltip.borderColor = colors.grid;
    chart.options.plugins.tooltip.borderWidth = 1;
}

function resizeCharts() {
    Object.values(charts).forEach((chart) => {
        if (chart) {
            chart.resize();
        }
    });
}

function syncThemeToggle(theme) {
    if (!themeToggle || !themeToggleLabel) {
        return;
    }

    const darkMode = theme === 'dark';
    themeToggle.setAttribute('aria-pressed', darkMode ? 'true' : 'false');
    themeToggle.setAttribute('aria-label', darkMode ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('title', darkMode ? 'Light mode' : 'Dark mode');
    themeToggleLabel.textContent = darkMode ? 'Light mode' : 'Dark mode';

    if (themeToggleIcon) {
        themeToggleIcon.textContent = darkMode ? '☀' : '☾';
    }
}

function applyTheme(theme, options = {}) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    syncThemeToggle(nextTheme);

    if (options.persist !== false) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch (error) {
            // Ignore storage failures and keep the current in-memory theme.
        }
    }

    Object.values(charts).forEach((chart) => {
        if (!chart) {
            return;
        }

        applyChartTheme(chart);
        chart.update('none');
    });
}

themeToggle?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', { persist: false });

function setActiveDashboardView(view, options = {}) {
    if (!dashboardShell || !dashboardViews.has(view)) {
        return;
    }

    const scroll = options.scroll === true;
    const focusMode = view !== 'dashboard';
    dashboardShell.dataset.activeView = view;
    const activePanel = dashboardPanels.find((panel) => panel.dataset.dashboardPanel === view) || null;

    dashboardPanels.forEach((panel) => {
        const isActive = panel.dataset.dashboardPanel === view;
        panel.classList.toggle('dashboard-hidden', focusMode && !isActive);
        panel.classList.toggle('dashboard-focused', focusMode && isActive);
    });

    dashboardGroups.forEach((group) => {
        if (group.dataset.dashboardGroup === 'overview') {
            group.classList.toggle('dashboard-hidden', focusMode);
            return;
        }

        const visiblePanel = group.querySelector('[data-dashboard-panel]:not(.dashboard-hidden)');
        group.classList.toggle('dashboard-hidden', !visiblePanel);
    });

    dashboardViewLinks.forEach((link) => {
        link.classList.toggle('active', link.dataset.viewTarget === view);
    });

    const nextHash = view === 'dashboard' ? '' : `#${view}`;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, '', nextUrl);
    window.requestAnimationFrame(() => {
        resizeCharts();

        if (!scroll) {
            return;
        }

        const target = focusMode ? activePanel : document.getElementById('overview');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

dashboardViewLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
        const view = link.dataset.viewTarget;

        if (!dashboardViews.has(view)) {
            return;
        }

        event.preventDefault();
        setActiveDashboardView(view, { scroll: true });
    });
});

const initialDashboardView = (() => {
    const hashView = window.location.hash.replace('#', '');
    return dashboardViews.has(hashView) ? hashView : 'dashboard';
})();

setActiveDashboardView(initialDashboardView);

function updateLineChart(chart, labels, values) {
    if (!chart) {
        return;
    }

    chart.data.labels = [...labels];
    chart.data.datasets[0].data = [...values];
    chart.update('none');
}

function updateHistoryCount(count) {
    const element = document.querySelector('[data-history-count]');

    if (!Number.isFinite(count)) {
        return;
    }

    if (element) {
        element.textContent = `Last ${count} samples`;
    }
}

function updateLastMetric(recordedAt) {
    const element = document.querySelector('[data-last-metric]');
    const text = recordedAt || 'No samples yet';

    if (element) {
        element.textContent = text;
    }
}

function updateMetricCard(metricKey, cardData) {
    const card = document.querySelector(`[data-metric-card="${metricKey}"]`);

    if (!card || !cardData || typeof cardData !== 'object') {
        return;
    }

    const value = card.querySelector('[data-metric-value]');
    const progressWrap = card.querySelector('[data-metric-progress-wrap]');
    const progress = card.querySelector('[data-metric-progress]');
    const progressTrack = progress?.closest('.progress');
    const variant = typeof cardData.variant === 'string' ? cardData.variant : 'secondary';
    const formattedValue = typeof cardData.formatted_value === 'string' ? cardData.formatted_value : 'N/A';
    const clampedValue = Number.isFinite(cardData.clamped_value) ? cardData.clamped_value : 0;
    const valueClass = typeof cardData.value_class === 'string' ? cardData.value_class : '';
    const showProgress = cardData.show_progress !== false;

    if (value) {
        value.textContent = formattedValue;
        value.className = valueClass;
    }

    if (progressWrap) {
        progressWrap.classList.toggle('d-none', !showProgress);
    }

    if (progress && showProgress) {
        progress.className = `progress-bar bg-${variant}`;
        progress.style.width = `${clampedValue}%`;
    }

    if (progressTrack && showProgress) {
        progressTrack.setAttribute('aria-valuenow', String(clampedValue));
    }
}

function applyDashboardUpdate(payload) {
    if (!payload || typeof payload !== 'object') {
        return;
    }

    const chartsPayload = payload.charts && typeof payload.charts === 'object' ? payload.charts : {};
    const labels = Array.isArray(chartsPayload.labels) ? chartsPayload.labels : [];
    const cpuValues = Array.isArray(chartsPayload.cpu) ? chartsPayload.cpu : [];
    const ramValues = Array.isArray(chartsPayload.ram) ? chartsPayload.ram : [];

    updateLineChart(charts.cpu, labels, cpuValues);
    updateLineChart(charts.ram, labels, ramValues);

    const cards = payload.cards && typeof payload.cards === 'object' ? payload.cards : {};
    Object.entries(cards).forEach(([metricKey, cardData]) => {
        updateMetricCard(metricKey, cardData);
    });

    updateHistoryCount(Number(payload.history_count));
    updateLastMetric(payload.latest_recorded_at ?? null);
}

function setRefreshIndicator(state, statusText) {
    if (!refreshIndicator || !refreshStatus) {
        return;
    }

    refreshIndicator.dataset.refreshState = state;
    refreshStatus.textContent = statusText;
}

function scheduleDynamicRefresh() {
    const refreshMs = Number(chartData.autoRefreshMs || 0);
    const metricsEndpoint = typeof chartData.metricsEndpoint === 'string' ? chartData.metricsEndpoint : '';

    if (!Number.isFinite(refreshMs) || refreshMs <= 0 || metricsEndpoint === '') {
        setRefreshIndicator('disabled', 'Auto refresh disabled');
        return;
    }

    let refreshTimeoutId = null;
    let countdownIntervalId = null;
    let refreshInFlight = false;
    let nextRefreshAt = Date.now() + refreshMs;

    const renderRefreshIndicator = () => {
        if (document.visibilityState !== 'visible') {
            setRefreshIndicator('paused', 'Timer paused while tab is hidden');
            return;
        }

        if (refreshInFlight) {
            setRefreshIndicator('refreshing', 'Refreshing data...');
            return;
        }

        const remainingMs = Math.max(0, nextRefreshAt - Date.now());
        setRefreshIndicator('waiting', `Next update in ${Math.ceil(remainingMs / 1000)}s`);
    };

    const startCountdown = () => {
        window.clearInterval(countdownIntervalId);
        countdownIntervalId = window.setInterval(renderRefreshIndicator, 1000);
        renderRefreshIndicator();
    };

    const queueRefresh = (delay = refreshMs) => {
        window.clearTimeout(refreshTimeoutId);
        nextRefreshAt = Date.now() + delay;
        renderRefreshIndicator();
        refreshTimeoutId = window.setTimeout(async () => {
            if (document.visibilityState !== 'visible' || refreshInFlight) {
                queueRefresh(refreshMs);
                return;
            }

            refreshInFlight = true;
            renderRefreshIndicator();

            try {
                const response = await fetch(`${metricsEndpoint}?t=${Date.now()}`, {
                    cache: 'no-store',
                    headers: {
                        Accept: 'application/json'
                    }
                });

                const contentType = response.headers.get('content-type') || '';
                const payload = contentType.includes('application/json')
                    ? await response.json()
                    : null;

                if (response.ok && payload !== null) {
                    applyDashboardUpdate(payload);
                }
            } catch (error) {
                console.error('Unable to refresh dashboard metrics.', error);
                setRefreshIndicator('error', 'Refresh failed, retrying...');
            } finally {
                refreshInFlight = false;
                queueRefresh(refreshMs);
            }
        }, delay);
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            queueRefresh(0);
            return;
        }

        renderRefreshIndicator();
    });

    startCountdown();
    queueRefresh();
}

scheduleDynamicRefresh();
