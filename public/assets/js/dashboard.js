const chartData = window.serverMonitorCharts || { labels: [], cpu: [], ram: [] };
const terminalData = chartData.terminal && typeof chartData.terminal === 'object' ? chartData.terminal : {};
const THEME_STORAGE_KEY = 'server_monitor_theme';
const PROCESS_LIMIT_OPTIONS = [5, 10, 20, 50, 100];

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
const systemDetailElements = new Map(
    Array.from(document.querySelectorAll('[data-system-detail]')).map((element) => [element.dataset.systemDetail || '', element])
);
const serviceStatusElements = new Map(
    Array.from(document.querySelectorAll('[data-service-status]')).map((element) => [element.dataset.serviceStatus || '', element])
);
const databaseStatusElement = document.querySelector('[data-database-status]');
const overviewToggle = document.querySelector('[data-overview-toggle]');
const overviewToggleLabel = document.querySelector('[data-overview-toggle-label]');
const overviewToggleMeta = document.querySelector('[data-overview-toggle-meta]');
const overviewReveal = document.querySelector('[data-overview-reveal]');
const overviewRevealInner = overviewReveal?.querySelector('.overview-reveal-inner') || null;
const overviewRevealGroups = overviewReveal
    ? Array.from(overviewReveal.querySelectorAll('[data-dashboard-group]'))
    : [];
const overviewCardSlots = Array.from(document.querySelectorAll('.overview-card-slot'));
const processLimitButtons = Array.from(document.querySelectorAll('[data-process-limit-option]'));
const terminalElements = {
    cpuUsage: document.querySelector('[data-terminal-cpu-usage]'),
    cpuBar: document.querySelector('[data-terminal-cpu-bar]'),
    cpuLoad: document.querySelector('[data-terminal-cpu-load]'),
    processSummary: document.querySelector('[data-terminal-process-summary]'),
    coreGrid: document.querySelector('[data-terminal-core-grid]'),
    processTableBody: document.querySelector('[data-terminal-process-table-body]')
};
const PROCESS_STATE_LABELS = {
    R: 'running',
    S: 'sleeping',
    D: 'uninterruptible sleep',
    I: 'idle kernel thread',
    T: 'stopped',
    Z: 'zombie'
};
const CPU_DISPLAY_DIGITS = 2;
const OVERVIEW_REVEAL_DURATION_MS = 620;
let overviewRevealResetTimerId = null;
let overviewRevealGroupAnimations = [];
let overviewCardAnimations = [];
let overviewCardAnimationCleanups = [];
let selectedProcessLimit = PROCESS_LIMIT_OPTIONS.includes(Number(chartData.initialProcessLimit))
    ? Number(chartData.initialProcessLimit)
    : 10;
let currentTerminalData = terminalData;

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

function clampPercent(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(100, Math.max(0, value));
}

function formatPercent(value, digits = 1) {
    if (!Number.isFinite(value)) {
        return 'N/A';
    }

    return `${Number(value).toFixed(digits)}%`;
}

function meterTone(value) {
    if (!Number.isFinite(value)) {
        return 'idle';
    }

    if (value >= 90) {
        return 'alert';
    }

    if (value >= 75) {
        return 'warn';
    }

    return 'ok';
}

function setTextContent(element, value) {
    if (element) {
        element.textContent = value;
    }
}

function setMeterFill(element, width, tone) {
    if (!element) {
        return;
    }

    element.style.width = `${clampPercent(width)}%`;
    element.dataset.tone = tone;
}

function formatLoadAverages(loads) {
    if (!Array.isArray(loads) || loads.length === 0) {
        return 'n/a / n/a / n/a';
    }

    return loads
        .slice(0, 3)
        .map((value) => (Number.isFinite(value) ? Number(value).toFixed(2) : 'n/a'))
        .join(' / ');
}

function formatProcessSummary(summary) {
    if (!summary || typeof summary !== 'object') {
        return '0 proc | 0 running | 0 sleeping | 0 zombie';
    }

    const total = Number.isFinite(summary.total) ? summary.total : 0;
    const running = Number.isFinite(summary.running) ? summary.running : 0;
    const sleeping = Number.isFinite(summary.sleeping) ? summary.sleeping : 0;
    const zombie = Number.isFinite(summary.zombie) ? summary.zombie : 0;

    return `${total} proc | ${running} running | ${sleeping} sleeping | ${zombie} zombie`;
}

function processCpuMaxLabel(processRow) {
    if (typeof processRow?.cpu_share_of_max_formatted === 'string' && processRow.cpu_share_of_max_formatted !== '') {
        return processRow.cpu_share_of_max_formatted;
    }

    if (Number.isFinite(processRow?.cpu_share_of_max)) {
        return `${Number(processRow.cpu_share_of_max).toFixed(1)}% max`;
    }

    const cpuValue = Number.isFinite(processRow?.cpu) ? Number(processRow.cpu) : null;
    const coreCount = Number.isFinite(currentTerminalData?.cpu?.core_count)
        ? Number(currentTerminalData.cpu.core_count)
        : (Array.isArray(currentTerminalData?.cpu?.cores) ? currentTerminalData.cpu.cores.length : 0);

    if (cpuValue === null || !Number.isFinite(coreCount) || coreCount <= 0) {
        return 'N/A';
    }

    return `${(cpuValue / coreCount).toFixed(1)}% max`;
}

function renderCoreGrid(cores) {
    const container = terminalElements.coreGrid;

    if (!container) {
        return;
    }

    container.replaceChildren();

    if (!Array.isArray(cores) || cores.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'terminal-empty';
        empty.textContent = 'No live core data';
        container.append(empty);
        return;
    }

    cores.forEach((core) => {
        const usage = Number.isFinite(core?.usage) ? core.usage : null;
        const item = document.createElement('div');
        item.className = 'terminal-core-item';

        const label = document.createElement('span');
        label.className = 'terminal-core-label';
        label.textContent = typeof core?.label === 'string' && core.label !== '' ? core.label : 'CPU';

        const bar = document.createElement('div');
        bar.className = 'terminal-inline-bar';

        const fill = document.createElement('span');
        fill.className = 'terminal-bar-fill';
        setMeterFill(fill, usage ?? 0, meterTone(usage));
        bar.append(fill);

        const value = document.createElement('span');
        value.className = 'terminal-core-value';
        value.textContent = formatPercent(usage);

        item.append(label, bar, value);
        container.append(item);
    });
}

function syncProcessLimitButtons(limit) {
    processLimitButtons.forEach((button) => {
        const buttonLimit = Number(button.dataset.processLimit || 0);
        const active = buttonLimit === limit;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function renderProcessTable(processes) {
    const tableBody = terminalElements.processTableBody;

    if (!tableBody) {
        return;
    }

    const visibleProcesses = Array.isArray(processes)
        ? processes.slice(0, selectedProcessLimit)
        : [];

    tableBody.replaceChildren();

    if (visibleProcesses.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.className = 'terminal-empty-cell';
        cell.textContent = 'No process data';
        row.append(cell);
        tableBody.append(row);
        return;
    }

    visibleProcesses.forEach((processRow) => {
        const row = document.createElement('tr');
        const cells = [
            Number.isFinite(processRow?.pid) ? String(processRow.pid) : '',
            typeof processRow?.command === 'string' ? processRow.command : '',
            null,
            typeof processRow?.state === 'string' ? processRow.state : ''
        ];

        cells.forEach((value, index) => {
            const cell = document.createElement('td');

            if (index === 1) {
                cell.className = 'terminal-process-command';
            }

            if (index === 2) {
                const wrapper = document.createElement('div');
                wrapper.className = 'terminal-process-cpu';

                const secondary = document.createElement('span');
                secondary.className = 'terminal-process-cpu-max';
                secondary.textContent = processCpuMaxLabel(processRow);
                wrapper.append(secondary);

                cell.append(wrapper);
                row.append(cell);
                return;
            }

            cell.textContent = value;

            if (index === 3) {
                cell.title = typeof processRow?.state === 'string'
                    ? (PROCESS_STATE_LABELS[processRow.state] || 'unknown state')
                    : 'unknown state';
            }

            row.append(cell);
        });

        tableBody.append(row);
    });
}

function renderTerminalMonitor(terminal) {
    if (!terminal || typeof terminal !== 'object') {
        return;
    }

    currentTerminalData = terminal;
    const cpu = terminal.cpu && typeof terminal.cpu === 'object' ? terminal.cpu : {};

    setTextContent(terminalElements.cpuUsage, formatPercent(cpu.usage, CPU_DISPLAY_DIGITS));
    setMeterFill(terminalElements.cpuBar, cpu.usage, meterTone(cpu.usage));
    setTextContent(terminalElements.cpuLoad, `load ${formatLoadAverages(cpu.load_averages)}`);
    setTextContent(terminalElements.processSummary, formatProcessSummary(cpu.process_summary));
    renderCoreGrid(cpu.cores);

    renderProcessTable(Array.isArray(terminal.processes) ? terminal.processes : []);
}

function syncOverviewToggle(expanded) {
    if (!overviewToggle) {
        return;
    }

    overviewToggle.dataset.state = expanded ? 'expanded' : 'collapsed';
    overviewToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');

    if (overviewToggleLabel) {
        overviewToggleLabel.textContent = expanded ? 'Show less' : 'Show more';
    }

    if (overviewToggleMeta) {
        overviewToggleMeta.textContent = expanded
            ? 'Back to the overview-only layout'
            : 'Charts, system info';
    }
}

function syncOverviewReveal(expanded, options = {}) {
    if (!overviewReveal) {
        return;
    }

    const animate = options.animate !== false;
    const targetHeight = overviewRevealInner?.scrollHeight || 0;

    window.clearTimeout(overviewRevealResetTimerId);
    overviewRevealGroupAnimations.forEach((animation) => animation.cancel());
    overviewRevealGroupAnimations = [];

    if (!animate) {
        overviewReveal.classList.add('overview-reveal-no-motion');
        overviewReveal.dataset.state = expanded ? 'expanded' : 'collapsed';
        overviewReveal.setAttribute('aria-hidden', expanded ? 'false' : 'true');
        overviewReveal.style.height = expanded ? 'auto' : '0px';
        window.requestAnimationFrame(() => {
            overviewReveal.classList.remove('overview-reveal-no-motion');
        });

        return;
    }

    if (expanded) {
        overviewReveal.style.height = '0px';
        overviewReveal.dataset.state = 'expanded';
        overviewReveal.setAttribute('aria-hidden', 'false');
        void overviewReveal.offsetHeight;
        overviewReveal.style.height = `${targetHeight}px`;

        overviewRevealGroups.forEach((group, index) => {
            if (typeof group.animate !== 'function') {
                return;
            }

            const animation = group.animate(
                [
                    {
                        transform: 'translateY(28px)'
                    },
                    {
                        transform: 'translateY(0)'
                    }
                ],
                {
                    duration: 560,
                    delay: 40 + (index * 70),
                    easing: 'cubic-bezier(.22, 1, .36, 1)',
                    fill: 'both'
                }
            );

            overviewRevealGroupAnimations.push(animation);
        });

        overviewRevealResetTimerId = window.setTimeout(() => {
            if (overviewReveal.dataset.state === 'expanded') {
                overviewReveal.style.height = 'auto';
            }
        }, OVERVIEW_REVEAL_DURATION_MS);

        return;
    }

    const currentHeight = overviewReveal.getBoundingClientRect().height || targetHeight;
    overviewReveal.style.height = `${currentHeight}px`;
    void overviewReveal.offsetHeight;
    overviewReveal.dataset.state = 'collapsed';
    overviewReveal.setAttribute('aria-hidden', 'true');
    overviewReveal.style.height = '0px';
}

function stopOverviewCardAnimations() {
    overviewCardAnimations.forEach((animation) => animation.cancel());
    overviewCardAnimations = [];
    overviewCardAnimationCleanups.forEach((cleanup) => cleanup());
    overviewCardAnimationCleanups = [];

    overviewCardSlots.forEach((slot) => {
        slot.style.opacity = '';
        slot.style.transform = '';
        slot.style.transformOrigin = '';
        slot.style.zIndex = '';
        slot.style.willChange = '';
    });
}

function animateOverviewCardsLayout(applyLayout) {
    if (overviewCardSlots.length === 0) {
        applyLayout();
        return;
    }

    stopOverviewCardAnimations();

    const firstRects = new Map(
        overviewCardSlots.map((slot) => [slot, slot.getBoundingClientRect()])
    );

    applyLayout();

    window.requestAnimationFrame(() => {
        overviewCardSlots.forEach((slot) => {
            const firstRect = firstRects.get(slot);
            const lastRect = slot.getBoundingClientRect();

            if (!firstRect || !lastRect.width || !lastRect.height) {
                return;
            }

            const deltaX = lastRect.left - firstRect.left;
            const deltaY = lastRect.top - firstRect.top;
            const widthChanged = Math.abs(firstRect.width - lastRect.width);
            const heightChanged = Math.abs(firstRect.height - lastRect.height);

            if (
                Math.abs(deltaX) < 0.5 &&
                Math.abs(deltaY) < 0.5 &&
                widthChanged < 0.5 &&
                heightChanged < 0.5
            ) {
                return;
            }

            const ghost = slot.cloneNode(true);
            ghost.classList.add('overview-card-ghost');
            ghost.style.left = `${firstRect.left}px`;
            ghost.style.top = `${firstRect.top}px`;
            ghost.style.width = `${firstRect.width}px`;
            ghost.style.height = `${firstRect.height}px`;
            document.body.append(ghost);

            slot.style.opacity = '0';
            slot.style.willChange = 'opacity';

            const ghostAnimation = ghost.animate(
                [
                    {
                        left: `${firstRect.left}px`,
                        top: `${firstRect.top}px`,
                        width: `${firstRect.width}px`,
                        height: `${firstRect.height}px`
                    },
                    {
                        left: `${lastRect.left}px`,
                        top: `${lastRect.top}px`,
                        width: `${lastRect.width}px`,
                        height: `${lastRect.height}px`
                    }
                ],
                {
                    duration: 700,
                    easing: 'cubic-bezier(.22, 1, .36, 1)',
                    fill: 'both'
                }
            );

            const slotAnimation = slot.animate(
                [
                    { opacity: 0 },
                    { opacity: 0, offset: 0.999 },
                    { opacity: 1, offset: 1 }
                ],
                {
                    duration: 700,
                    easing: 'steps(1, end)',
                    fill: 'both'
                }
            );

            let cleanedUp = false;
            const cleanup = () => {
                if (cleanedUp) {
                    return;
                }

                cleanedUp = true;
                ghost.remove();
                slot.style.opacity = '';
                slot.style.willChange = '';
                slot.style.transform = '';
                slot.style.transformOrigin = '';
                slot.style.zIndex = '';
            };

            ghostAnimation.finished.then(cleanup).catch(cleanup);
            overviewCardAnimations.push(ghostAnimation, slotAnimation);
            overviewCardAnimationCleanups.push(cleanup);
        });
    });
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
syncProcessLimitButtons(selectedProcessLimit);

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

function setOverviewMode(mode, options = {}) {
    if (!dashboardShell) {
        return;
    }

    const expanded = mode === 'expanded';
    const animate = options.animate !== false;
    const applyLayout = () => {
        dashboardShell.dataset.overviewMode = expanded ? 'expanded' : 'hero';
        syncOverviewToggle(expanded);
        syncOverviewReveal(expanded, { animate });
        setActiveDashboardView('dashboard');
    };

    if (animate) {
        animateOverviewCardsLayout(applyLayout);
    } else {
        applyLayout();
    }

    window.requestAnimationFrame(() => {
        resizeCharts();

        if (expanded) {
            window.setTimeout(resizeCharts, animate ? OVERVIEW_REVEAL_DURATION_MS : 0);
        }

        if (options.scroll !== true) {
            return;
        }

        const target = expanded ? null : document.getElementById('overview');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

setActiveDashboardView(initialDashboardView);
setOverviewMode(initialDashboardView === 'dashboard' ? 'hero' : 'expanded', { animate: false });

overviewToggle?.addEventListener('click', () => {
    const expanded = dashboardShell?.dataset.overviewMode === 'expanded';
    setOverviewMode(expanded ? 'hero' : 'expanded', { scroll: true });
});

processLimitButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const nextLimit = Number(button.dataset.processLimit || 0);

        if (!PROCESS_LIMIT_OPTIONS.includes(nextLimit) || nextLimit === selectedProcessLimit) {
            return;
        }

        selectedProcessLimit = nextLimit;
        syncProcessLimitButtons(selectedProcessLimit);
        renderProcessTable(Array.isArray(currentTerminalData.processes) ? currentTerminalData.processes : []);
    });
});

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

function serviceBadgeVariant(status) {
    if (status === 'active' || status === 'running' || status === 'online') {
        return 'success';
    }

    if (['offline', 'failed', 'inactive', 'dead', 'stale', 'missing'].includes(status)) {
        return 'danger';
    }

    return 'secondary';
}

function updateBadge(element, status) {
    if (!element) {
        return;
    }

    const nextStatus = typeof status === 'string' && status !== '' ? status : 'unavailable';
    element.className = `badge text-bg-${serviceBadgeVariant(nextStatus)}`;
    element.textContent = nextStatus;
}

function updateDatabaseStatus(isOnline) {
    if (!databaseStatusElement) {
        return;
    }

    updateBadge(databaseStatusElement, isOnline ? 'online' : 'offline');
}

function updateServiceStatuses(services) {
    if (!services || typeof services !== 'object') {
        return;
    }

    Object.entries(services).forEach(([label, status]) => {
        const element = serviceStatusElements.get(label);
        if (!element) {
            return;
        }

        updateBadge(element, typeof status === 'string' ? status : 'unavailable');
    });
}

function updateSystemDetails(details) {
    if (!details || typeof details !== 'object') {
        return;
    }

    Object.entries(details).forEach(([key, value]) => {
        const element = systemDetailElements.get(key);
        if (!element) {
            return;
        }

        element.textContent = typeof value === 'string' && value !== '' ? value : 'Unavailable';
    });
}

function updateMetricCard(metricKey, cardData) {
    const card = document.querySelector(`[data-metric-card="${metricKey}"]`);

    if (!card || !cardData || typeof cardData !== 'object') {
        return;
    }

    const value = card.querySelector('[data-metric-value]');
    const subtitle = card.querySelector('[data-metric-subtitle]');
    const progressWrap = card.querySelector('[data-metric-progress-wrap]');
    const progress = card.querySelector('[data-metric-progress]');
    const progressTrack = progress?.closest('.progress');
    const variant = typeof cardData.variant === 'string' ? cardData.variant : 'secondary';
    const subtitleText = typeof cardData.subtitle === 'string' ? cardData.subtitle : '';
    const formattedValue = typeof cardData.formatted_value === 'string' ? cardData.formatted_value : 'N/A';
    const clampedValue = Number.isFinite(cardData.clamped_value) ? cardData.clamped_value : 0;
    const valueClass = typeof cardData.value_class === 'string' ? cardData.value_class : '';
    const showProgress = cardData.show_progress !== false;

    if (subtitle) {
        subtitle.textContent = subtitleText;
    }

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

    updateSystemDetails(payload.system && typeof payload.system === 'object' ? payload.system : {});
    updateDatabaseStatus(payload.database_status === true);
    updateServiceStatuses(payload.services && typeof payload.services === 'object' ? payload.services : {});
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
