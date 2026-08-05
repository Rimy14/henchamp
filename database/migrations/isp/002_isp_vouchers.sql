-- =====================================================
-- ISP Module — 002: Hotspot vouchers
--
-- Requirements: A2 (hotspot voucher access), A5 (single-device lock)
-- =====================================================

-- -----------------------------------------------------
-- isp_voucher_batches — vouchers are always generated in batches so they can
-- be printed, reconciled and revoked as a unit
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_voucher_batches` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `batch_no`      VARCHAR(30) NOT NULL COMMENT 'HC-VB-20260805-001',
  `package_id`    INT NOT NULL,
  `quantity`      INT NOT NULL,
  `generated_by`  INT DEFAULT NULL COMMENT 'users.id',
  `notes`         TEXT,
  `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_batch_no` (`batch_no`),
  KEY `idx_package` (`package_id`),
  KEY `idx_generated_by` (`generated_by`),
  CONSTRAINT `fk_isp_batch_package` FOREIGN KEY (`package_id`)   REFERENCES `isp_packages` (`id`),
  CONSTRAINT `fk_isp_batch_user`    FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- isp_vouchers
--
-- `code` doubles as the RADIUS username, so it must be unique across the
-- whole system, not just within a batch.
--
-- A5: bound_mac locks the voucher to the first device that uses it. See
-- voucher.service.js for the binding flow and its documented limits
-- (MAC spoofing, phone MAC randomisation).
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `isp_vouchers` (
  `id`                INT NOT NULL AUTO_INCREMENT,
  `batch_id`          INT NOT NULL,
  `code`              VARCHAR(32) NOT NULL COMMENT 'printed code == RADIUS username',
  `secret_enc`        VARBINARY(256) NOT NULL COMMENT 'AES-256-GCM',
  `package_id`        INT NOT NULL,
  `price`             DECIMAL(15,2) NOT NULL DEFAULT '0.00',

  `status`            ENUM('unused','active','used','expired','revoked')
                      NOT NULL DEFAULT 'unused',

  -- A5: single-device lock
  `bound_mac`         VARCHAR(17) DEFAULT NULL COMMENT 'normalised AA:BB:CC:DD:EE:FF',
  `bound_at`          DATETIME DEFAULT NULL,
  `binding_resets`    INT NOT NULL DEFAULT '0' COMMENT 'audit counter for support resets',

  `first_used_at`     DATETIME DEFAULT NULL,
  `expires_at`        DATETIME DEFAULT NULL,
  `data_used_bytes`   BIGINT NOT NULL DEFAULT '0',
  `time_used_seconds` INT NOT NULL DEFAULT '0',

  `sale_id`           INT DEFAULT NULL COMMENT 'POS sale that sold this voucher',
  `sold_at`           DATETIME DEFAULT NULL,

  `created_at`        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_voucher_code` (`code`),
  KEY `idx_status` (`status`),
  KEY `idx_bound_mac` (`bound_mac`),
  KEY `idx_batch` (`batch_id`),
  KEY `idx_package` (`package_id`),
  KEY `idx_expires` (`expires_at`),
  CONSTRAINT `fk_isp_v_batch`   FOREIGN KEY (`batch_id`)   REFERENCES `isp_voucher_batches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_isp_v_package` FOREIGN KEY (`package_id`) REFERENCES `isp_packages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
