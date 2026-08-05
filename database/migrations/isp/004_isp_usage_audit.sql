-- =====================================================
-- ISP Module — 004: Usage rollups, audit trail, job state
--
-- Requirements: A6 (usage tracking), plus operational safety
-- =====================================================

-- -----------------------------------------------------
-- isp_usage_daily — pre-aggregated usage so the dashboard never scans
-- session history. One row per subject per day.
--
-- MySQL treats NULLs as distinct in unique indexes, so the two unique keys
-- coexist: subscriber rows have voucher_id NULL and vice versa.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_usage_daily` (
  `id`              BIGINT NOT NULL AUTO_INCREMENT,
  `subscriber_id`   INT DEFAULT NULL,
  `voucher_id`      INT DEFAULT NULL,
  `usage_date`      DATE NOT NULL,
  `upload_bytes`    BIGINT NOT NULL DEFAULT '0',
  `download_bytes`  BIGINT NOT NULL DEFAULT '0',
  `session_seconds` INT NOT NULL DEFAULT '0',
  `session_count`   INT NOT NULL DEFAULT '0',
  `updated_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_usage_sub_date` (`subscriber_id`, `usage_date`),
  UNIQUE KEY `uq_isp_usage_vou_date` (`voucher_id`, `usage_date`),
  KEY `idx_date` (`usage_date`),
  CONSTRAINT `fk_isp_usage_sub` FOREIGN KEY (`subscriber_id`) REFERENCES `isp_subscribers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_isp_usage_vou` FOREIGN KEY (`voucher_id`)    REFERENCES `isp_vouchers` (`id`)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- isp_audit_log — who did what to whom.
--
-- Every lifecycle transition and every voucher binding change is recorded.
-- When a subscriber disputes a suspension, or a voucher binding is reset by
-- counter staff, this is the record.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_audit_log` (
  `id`            BIGINT NOT NULL AUTO_INCREMENT,
  `entity_type`   VARCHAR(40) NOT NULL COMMENT 'subscriber|voucher|nas|package|session',
  `entity_id`     INT NOT NULL,
  `action`        VARCHAR(60) NOT NULL COMMENT 'activate|suspend|restore|bind_mac|reset_binding|...',
  `actor_user_id` INT DEFAULT NULL COMMENT 'NULL = system / cron',
  `detail`        JSON DEFAULT NULL,
  `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_entity` (`entity_type`, `entity_id`),
  KEY `idx_action` (`action`),
  KEY `idx_created` (`created_at`),
  KEY `idx_actor` (`actor_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- isp_job_state — durable cursors for background jobs.
--
-- The accounting ingester needs to remember the highest radacctid it has
-- processed. Holding that in memory would mean re-scanning all of radacct
-- after every restart, so it lives here.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_job_state` (
  `job_name`    VARCHAR(60) NOT NULL,
  `cursor_value` VARCHAR(64) NOT NULL DEFAULT '0',
  `last_run_at` DATETIME DEFAULT NULL,
  `last_status` VARCHAR(20) DEFAULT NULL,
  `last_error`  TEXT,
  `updated_at`  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
