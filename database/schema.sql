CREATE TABLE IF NOT EXISTS server_metrics (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cpu_usage DECIMAL(5,2) NOT NULL,
    ram_usage DECIMAL(5,2) NOT NULL,
    disk_usage DECIMAL(5,2) NOT NULL,
    INDEX idx_server_metrics_recorded_at (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
