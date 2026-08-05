-- =====================================================
-- ISP Module — 001: Core tables
-- Packages, subscribers, subscription (billing) periods
--
-- Requirements: A1 (billing & customer management), A3 (PPPoE)
-- Depends on: base schema (users, customers)
-- =====================================================

-- -----------------------------------------------------
-- isp_packages — the tariff plans HenChamp sells
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_packages` (
  `id`                          INT NOT NULL AUTO_INCREMENT,
  `code`                        VARCHAR(30)  NOT NULL COMMENT 'HS-DAY-1, PPP-HOME-10M',
  `name`                        VARCHAR(120) NOT NULL,
  `description`                 TEXT,
  `service_type`                ENUM('hotspot','pppoe') NOT NULL,
  `price`                       DECIMAL(15,2) NOT NULL DEFAULT '0.00',
  `currency`                    CHAR(3) NOT NULL DEFAULT 'KES',

  -- Validity: days for recurring PPPoE, minutes for time-based hotspot vouchers
  `validity_days`               INT DEFAULT NULL,
  `validity_minutes`            INT DEFAULT NULL,

  -- Speed. Stored in kbps; translated to Mikrotik-Rate-Limit at provision time.
  -- rate_up = subscriber UPLOAD (router rx), rate_down = subscriber DOWNLOAD (router tx)
  `rate_up_kbps`                INT DEFAULT NULL,
  `rate_down_kbps`              INT DEFAULT NULL,
  `burst_up_kbps`               INT DEFAULT NULL,
  `burst_down_kbps`             INT DEFAULT NULL,
  `burst_threshold_up_kbps`     INT DEFAULT NULL,
  `burst_threshold_down_kbps`   INT DEFAULT NULL,
  `burst_time_seconds`          INT DEFAULT NULL,

  `data_cap_mb`                 BIGINT DEFAULT NULL COMMENT 'NULL = uncapped',
  `simultaneous_use`            TINYINT NOT NULL DEFAULT '1' COMMENT 'concurrent sessions allowed',

  `radius_group`                VARCHAR(64) NOT NULL COMMENT 'maps to radgroupreply.groupname',
  `status`                      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at`                  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_pkg_code` (`code`),
  UNIQUE KEY `uq_isp_pkg_group` (`radius_group`),
  KEY `idx_service_type` (`service_type`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- isp_subscribers — account holders (primarily PPPoE)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_subscribers` (
  `id`                  INT NOT NULL AUTO_INCREMENT,
  `subscriber_code`     VARCHAR(30)  NOT NULL COMMENT 'HC-ISP-00001',
  `customer_id`         INT DEFAULT NULL COMMENT 'link to CRM customer record (Dev 3)',
  `full_name`           VARCHAR(200) NOT NULL,
  `phone`               VARCHAR(20)  NOT NULL COMMENT 'MSISDN 2547XXXXXXXX for M-Pesa',
  `email`               VARCHAR(100) DEFAULT NULL,
  `national_id`         VARCHAR(30)  DEFAULT NULL,
  `address`             TEXT,

  `service_type`        ENUM('hotspot','pppoe') NOT NULL DEFAULT 'pppoe',
  `radius_username`     VARCHAR(64)  NOT NULL,
  `radius_secret_enc`   VARBINARY(512) NOT NULL COMMENT 'AES-256-GCM; CHAP needs cleartext',
  `package_id`          INT NOT NULL,

  `status`              ENUM('pending','active','grace','suspended','terminated')
                        NOT NULL DEFAULT 'pending',
  `status_reason`       VARCHAR(255) DEFAULT NULL,
  `status_changed_at`   DATETIME DEFAULT NULL,

  `billing_cycle_start` DATE DEFAULT NULL,
  `billing_cycle_end`   DATE DEFAULT NULL,
  `grace_until`         DATE DEFAULT NULL,

  `static_ip`           VARCHAR(45) DEFAULT NULL,
  `installed_at`        DATETIME DEFAULT NULL,
  `notes`               TEXT,

  `created_at`          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_sub_code` (`subscriber_code`),
  UNIQUE KEY `uq_isp_sub_username` (`radius_username`),
  KEY `idx_status` (`status`),
  KEY `idx_phone` (`phone`),
  KEY `idx_cycle_end` (`billing_cycle_end`),
  KEY `idx_package` (`package_id`),
  KEY `idx_customer` (`customer_id`),
  CONSTRAINT `fk_isp_sub_package`  FOREIGN KEY (`package_id`)  REFERENCES `isp_packages` (`id`),
  CONSTRAINT `fk_isp_sub_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- isp_subscriptions — billing periods
--
-- ⚠️ SHARED SURFACE WITH DEV 2 (Section B).
-- Dev 2 owns: status, invoice_ref, paid_at.
-- Dev 1 owns: everything else. See docs/ISP_PLAN.md §4.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_subscriptions` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `subscriber_id` INT NOT NULL,
  `package_id`    INT NOT NULL,
  `period_start`  DATE NOT NULL,
  `period_end`    DATE NOT NULL,
  `amount`        DECIMAL(15,2) NOT NULL,
  `currency`      CHAR(3) NOT NULL DEFAULT 'KES',
  `status`        ENUM('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending'
                  COMMENT 'written by Dev 2',
  `invoice_ref`   VARCHAR(50) DEFAULT NULL COMMENT 'written by Dev 2',
  `paid_at`       DATETIME DEFAULT NULL   COMMENT 'written by Dev 2',
  `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_subn_period` (`subscriber_id`, `period_start`),
  KEY `idx_status_period` (`status`, `period_end`),
  KEY `idx_package` (`package_id`),
  CONSTRAINT `fk_isp_subn_sub`     FOREIGN KEY (`subscriber_id`) REFERENCES `isp_subscribers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_isp_subn_package` FOREIGN KEY (`package_id`)    REFERENCES `isp_packages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
