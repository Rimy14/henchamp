-- =====================================================
-- ISP Module — 003: NAS registry and session tracking
--
-- Requirements: A4 (MikroTik/RADIUS integration), A6 (usage tracking)
-- =====================================================

-- -----------------------------------------------------
-- isp_nas — routers we manage.
--
-- Mirrors the FreeRADIUS `nas` table (which holds the RADIUS shared secret)
-- and additionally stores the RouterOS REST credentials we need for
-- imperative actions such as kicking a live session.
--
-- coa_port defaults to 1700 because that is MikroTik's default for
-- /radius incoming — NOT the RFC 5176 value of 3799.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_nas` (
  `id`                INT NOT NULL AUTO_INCREMENT,
  `name`              VARCHAR(120) NOT NULL,
  `shortname`         VARCHAR(32)  NOT NULL COMMENT 'matches freeradius nas.shortname',
  `nas_ip`            VARCHAR(45)  NOT NULL COMMENT 'IP the router sends RADIUS from',
  `radius_secret_enc` VARBINARY(512) NOT NULL,

  -- RouterOS REST API
  `api_host`          VARCHAR(255) NOT NULL,
  `api_port`          INT NOT NULL DEFAULT '443',
  `api_user`          VARCHAR(64)  NOT NULL,
  `api_password_enc`  VARBINARY(512) NOT NULL,
  `api_use_tls`       TINYINT NOT NULL DEFAULT '1',

  `coa_port`          INT NOT NULL DEFAULT '1700' COMMENT 'MikroTik default, not RFC 3799',
  `routeros_version`  VARCHAR(30) DEFAULT NULL,
  `last_seen_at`      DATETIME DEFAULT NULL,
  `last_error`        VARCHAR(255) DEFAULT NULL,
  `status`            ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at`        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_nas_shortname` (`shortname`),
  KEY `idx_nas_ip` (`nas_ip`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- isp_sessions — our projection of radacct.
--
-- Why copy instead of joining across databases at query time:
--   * radacct is FreeRADIUS's table and may be rotated or purged by the
--     RADIUS admin without warning
--   * cross-schema joins on every dashboard load do not scale
--   * we need the subscriber_id / voucher_id resolution once, not per query
--   * gigawords folding happens on ingest, so every reader sees true bytes
--
-- Ingest is incremental by radacctid watermark — never a full table scan.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_sessions` (
  `id`                 BIGINT NOT NULL AUTO_INCREMENT,
  `acct_unique_id`     VARCHAR(32) NOT NULL COMMENT 'join key; NOT acctsessionid',
  `acct_session_id`    VARCHAR(64) NOT NULL,
  `radacct_id`         BIGINT DEFAULT NULL COMMENT 'source row, for the ingest watermark',
  `username`           VARCHAR(64) NOT NULL,
  `subscriber_id`      INT DEFAULT NULL,
  `voucher_id`         INT DEFAULT NULL,
  `nas_id`             INT DEFAULT NULL,
  `nas_ip`             VARCHAR(45) DEFAULT NULL,
  `framed_ip`          VARCHAR(45) DEFAULT NULL,
  `calling_station_id` VARCHAR(50) DEFAULT NULL COMMENT 'normalised client MAC',
  `called_station_id`  VARCHAR(50) DEFAULT NULL,
  `service_type`       ENUM('hotspot','pppoe') DEFAULT NULL,

  `started_at`         DATETIME DEFAULT NULL,
  `last_update_at`     DATETIME DEFAULT NULL,
  `stopped_at`         DATETIME DEFAULT NULL COMMENT 'NULL = still online',
  `session_seconds`    INT NOT NULL DEFAULT '0',
  `input_octets`       BIGINT NOT NULL DEFAULT '0' COMMENT 'upload, gigawords folded in',
  `output_octets`      BIGINT NOT NULL DEFAULT '0' COMMENT 'download, gigawords folded in',
  `terminate_cause`    VARCHAR(32) DEFAULT NULL,

  `created_at`         TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_sess_unique` (`acct_unique_id`),
  KEY `idx_username` (`username`),
  KEY `idx_subscriber` (`subscriber_id`),
  KEY `idx_voucher` (`voucher_id`),
  KEY `idx_started` (`started_at`),
  KEY `idx_open` (`stopped_at`, `last_update_at`),
  KEY `idx_radacct` (`radacct_id`),
  CONSTRAINT `fk_isp_sess_sub` FOREIGN KEY (`subscriber_id`) REFERENCES `isp_subscribers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_isp_sess_vou` FOREIGN KEY (`voucher_id`)    REFERENCES `isp_vouchers` (`id`)    ON DELETE SET NULL,
  CONSTRAINT `fk_isp_sess_nas` FOREIGN KEY (`nas_id`)        REFERENCES `isp_nas` (`id`)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
