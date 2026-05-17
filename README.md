# Server Monitor

Lightweight PHP 8.3 dashboard for monitoring a Linux VPS without a framework.

`Server Monitor` shows the current health of a server through a public dashboard with live refresh, historical charts, dark mode, and a minimal responsive UI.

## Preview

![Server Monitor dashboard](docs/screenshots/dashboard.png)

## Features

- Public dashboard with no login
- CPU, RAM, and disk usage cards backed by stored metrics
- Live network throughput card (`RX` / `TX` per second)
- CPU and RAM history charts
- System information, uptime, and PHP version
- Database connectivity and service status checks
- Dark mode with saved preference
- Responsive layout for desktop and mobile
- JSON metrics endpoint for auto-refresh

## Stack

- PHP 8.3
- MariaDB / MySQL
- PDO
- Bootstrap 5
- Chart.js
- Linux `/proc`
- cron or systemd timer

No Laravel, no ORM, no framework.

## How It Works

1. `scripts/collect_metrics.php` collects `cpu_usage`, `ram_usage`, and `disk_usage`.
2. Those metrics are stored in MariaDB / MySQL for the dashboard history.
3. `app/metrics.php` builds the cards and chart payload used by the UI and by `/api/metrics.php`.
4. Network throughput is sampled live from `/proc/net/dev`, so it is shown in real time and is not stored in the database.

## Project Structure

```text
server-monitor/
├── app/
│   ├── config.php
│   ├── database.php
│   ├── helpers.php
│   ├── metrics.php
│   └── server_info.php
├── database/
│   └── schema.sql
├── public/
│   ├── api/
│   │   └── metrics.php
│   ├── assets/
│   │   ├── css/app.css
│   │   └── js/dashboard.js
│   ├── dashboard.php
│   └── index.php
├── scripts/
│   └── collect_metrics.php
├── .env
├── .env.example
├── LICENSE
└── README.md
```

## Requirements

- Linux server or VPS
- PHP 8.3 with `pdo_mysql`
- MariaDB or MySQL
- nginx or Apache
- cron or systemd

## Quick Start

Clone the project:

```bash
cd /var/www
git clone https://github.com/alberto-taccon/server-monitor.git server-monitor
cd server-monitor
```


Create the database and import the schema:

```sql
CREATE DATABASE server_monitor CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'server_monitor'@'localhost' IDENTIFIED BY 'change_me';
GRANT ALL PRIVILEGES ON server_monitor.* TO 'server_monitor'@'localhost';
FLUSH PRIVILEGES;
```

```bash
mysql -u server_monitor -p server_monitor < database/schema.sql
chmod +x scripts/collect_metrics.php
```

Copy `.env.example` to `.env` and update the database values:

```bash
cp .env.example .env
```

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=server_monitor
DB_USERNAME=server_monitor
DB_PASSWORD=change_me
```
Run the dashboard locally:

```bash
php -S localhost:8000 -t public
```

Open:

```text
http://localhost:8000
```

## Metrics Collection

Run the collector manually:

```bash
php scripts/collect_metrics.php
```

The database stores:

- `recorded_at`
- `cpu_usage`
- `ram_usage`
- `disk_usage`

Example cron setup every 5 seconds:

```cron
* * * * * /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 5 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 10 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 15 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 20 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 25 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 30 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 35 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 40 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 45 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 50 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
* * * * * sleep 55 && /usr/bin/php /var/www/server-monitor/scripts/collect_metrics.php >> /var/log/server-monitor-metrics.log 2>&1
```

The dashboard UI currently refreshes every `5s` through `$autoRefreshMs` in `public/dashboard.php`. If the collector runs less often, the page still refreshes, but the stored CPU/RAM/Disk values will update only when a new sample is written.

## Deployment Example

```nginx
server {
    listen 80;
    server_name monitor.example.com;
    root /var/www/server-monitor/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }

    location ~ /\. {
        deny all;
    }
}
```

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Security Notes

- The dashboard is public by design.
- Point the web root to `public`.
- Keep `.env` outside version control.
- Use HTTPS in production.
- If the dashboard should stay private, protect it at network or reverse-proxy level.

## License

MIT License.
