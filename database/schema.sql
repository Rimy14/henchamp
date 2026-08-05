-- MySQL dump 10.13  Distrib 8.0.38, for Win64 (x86_64)
--
-- Host: localhost    Database: henchamp_pos_db
-- ------------------------------------------------------
-- Server version	8.0.38

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `adjustment_batch_items`
--

DROP TABLE IF EXISTS `adjustment_batch_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `adjustment_batch_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `adjustment_id` int NOT NULL,
  `batch_id` int NOT NULL,
  `quantity_adjusted` decimal(10,2) NOT NULL COMMENT 'Positive for addition, negative for subtraction',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Batch-specific reason for adjustment',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_adjustment` (`adjustment_id`),
  KEY `idx_batch` (`batch_id`),
  CONSTRAINT `adjustment_batch_items_ibfk_1` FOREIGN KEY (`adjustment_id`) REFERENCES `stock_adjustments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `adjustment_batch_items_ibfk_2` FOREIGN KEY (`batch_id`) REFERENCES `inventory_batches` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `adjustment_batch_items`
--

LOCK TABLES `adjustment_batch_items` WRITE;
/*!40000 ALTER TABLE `adjustment_batch_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `adjustment_batch_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `table_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `record_id` int DEFAULT NULL,
  `old_values` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `new_values` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,1,'USER_LOGOUT',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 03:45:21'),(2,1,'USER_LOGOUT',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 03:45:21'),(3,1,'USER_LOGOUT',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 03:45:21'),(4,1,'USER_LOGOUT',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 03:45:21'),(5,1,'USER_LOGOUT',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 03:45:21'),(6,1,'USER_LOGIN',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 03:45:32'),(7,1,'USER_LOGIN_FAILED',NULL,NULL,NULL,'{\"username\":\"Admin\",\"reason\":\"Invalid password\"}','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 05:21:24'),(8,1,'USER_LOGIN',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 05:21:29'),(9,1,'USER_LOGIN',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 06:09:01'),(10,1,'PO_CREATED','purchase_orders',1,NULL,NULL,NULL,NULL,'2026-08-04 06:20:32'),(11,1,'PO_CREATED','purchase_orders',2,NULL,NULL,NULL,NULL,'2026-08-04 06:29:09'),(12,1,'PO_STATUS_UPDATED','purchase_orders',2,NULL,'{\"status\":\"Approved\"}',NULL,NULL,'2026-08-04 06:29:12'),(13,1,'GRN_CREATED','grn',1,NULL,NULL,NULL,NULL,'2026-08-04 07:08:09'),(14,1,'GRN_APPROVED','grn',1,NULL,NULL,NULL,NULL,'2026-08-04 07:08:14'),(15,1,'USER_LOGOUT',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 08:24:45'),(16,1,'USER_LOGOUT',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 08:24:45'),(17,1,'USER_LOGOUT',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 08:24:45'),(18,1,'USER_LOGIN_FAILED',NULL,NULL,NULL,'{\"username\":\"Admin\",\"reason\":\"Invalid password\"}','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 08:25:04'),(19,1,'USER_LOGIN_FAILED',NULL,NULL,NULL,'{\"username\":\"Admin\",\"reason\":\"Invalid password\"}','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 08:25:09'),(20,1,'USER_LOGIN_FAILED',NULL,NULL,NULL,'{\"username\":\"Admin\",\"reason\":\"Invalid password\"}','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 08:34:11'),(21,1,'USER_LOGIN',NULL,NULL,NULL,NULL,'::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36','2026-08-04 08:37:40');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `batch_consumption`
--

DROP TABLE IF EXISTS `batch_consumption`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `batch_consumption` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_id` int NOT NULL,
  `reference_type` enum('production','adjustment','sale') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_id` int DEFAULT NULL,
  `quantity_consumed` decimal(10,2) NOT NULL,
  `consumed_by` int NOT NULL,
  `consumed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `consumed_by` (`consumed_by`),
  KEY `idx_batch_id` (`batch_id`),
  KEY `idx_reference` (`reference_type`,`reference_id`),
  KEY `idx_consumed_at` (`consumed_at`),
  CONSTRAINT `batch_consumption_ibfk_1` FOREIGN KEY (`batch_id`) REFERENCES `inventory_batches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `batch_consumption_ibfk_2` FOREIGN KEY (`consumed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `batch_consumption`
--

LOCK TABLES `batch_consumption` WRITE;
/*!40000 ALTER TABLE `batch_consumption` DISABLE KEYS */;
/*!40000 ALTER TABLE `batch_consumption` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bom`
--

DROP TABLE IF EXISTS `bom`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bom` (
  `id` int NOT NULL AUTO_INCREMENT,
  `finished_good_id` int NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) DEFAULT '1',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_finished_good_version` (`finished_good_id`,`version`),
  KEY `created_by` (`created_by`),
  KEY `idx_finished_good` (`finished_good_id`),
  KEY `idx_active` (`is_active`),
  CONSTRAINT `bom_ibfk_1` FOREIGN KEY (`finished_good_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `bom_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bom`
--

LOCK TABLES `bom` WRITE;
/*!40000 ALTER TABLE `bom` DISABLE KEYS */;
/*!40000 ALTER TABLE `bom` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bom_items`
--

DROP TABLE IF EXISTS `bom_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bom_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bom_id` int NOT NULL,
  `raw_material_id` int NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_bom_id` (`bom_id`),
  KEY `idx_raw_material_id` (`raw_material_id`),
  CONSTRAINT `bom_items_ibfk_1` FOREIGN KEY (`bom_id`) REFERENCES `bom` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bom_items_ibfk_2` FOREIGN KEY (`raw_material_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bom_items`
--

LOCK TABLES `bom_items` WRITE;
/*!40000 ALTER TABLE `bom_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `bom_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `carts`
--

DROP TABLE IF EXISTS `carts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `carts` (
  `user_id` int NOT NULL,
  `items` json NOT NULL,
  `payments` json DEFAULT NULL,
  `customer_id` int DEFAULT NULL,
  `discount_percent` decimal(5,2) DEFAULT '0.00',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `carts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `carts`
--

LOCK TABLES `carts` WRITE;
/*!40000 ALTER TABLE `carts` DISABLE KEYS */;
INSERT INTO `carts` VALUES (1,'[]','[]',NULL,0.00,'2026-08-04 07:27:39');
/*!40000 ALTER TABLE `carts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `parent_id` int DEFAULT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code_prefix` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `type` enum('Raw Materials','Finished Goods','Services','Other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Other',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parent_id` (`parent_id`),
  KEY `idx_type` (`type`),
  KEY `idx_status` (`status`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (1,NULL,'Printing & Stationery','PNS','Premium printing supplies, office stationery, and corporate branding materials.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(2,NULL,'Office Equipment','OEQ','Modern office machinery, monitors, printers, and accessories.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(3,NULL,'Staff Uniforms','UNI','High-quality corporate apparel, safety gear, and branded workwear.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(4,NULL,'Building & Engineering','BNE','Construction tools, engineering supplies, and maintenance hardware.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(5,NULL,'Lab & Medical','LNM','Medical instruments, laboratory glassware, and clinical consumables.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(6,NULL,'ICT Equipment','ICT','Enterprise networking gear, servers, computers, and IT peripherals.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(7,NULL,'Security','SEC','Access control systems, surveillance cameras, and security gear.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(8,NULL,'Interior Design','INT','Office furniture, ergonomic seating, and decor solutions.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(9,NULL,'Painting','PNT','Industrial and commercial paints, coatings, and application tools.','Finished Goods','active','2026-08-04 08:37:17','2026-08-04 08:37:17');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `customer_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company` enum('PRINTHUB','NATURAL','OUTSIDE') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PRINTHUB',
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tax_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `credit_limit` decimal(15,2) DEFAULT '0.00',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `credit_period` int DEFAULT '30' COMMENT 'Credit period in days',
  PRIMARY KEY (`id`),
  KEY `idx_name` (`name`),
  KEY `idx_phone` (`phone`),
  KEY `idx_status` (`status`),
  KEY `idx_company` (`company`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
INSERT INTO `customers` VALUES ('CUST-001',1,'Online / Walk-in Customer','online@solutions.henchamp.com','+254 700 000 000',NULL,'Nairobi','PRINTHUB',NULL,NULL,0.00,'active','2026-08-04 08:37:17','2026-08-04 08:37:17',30),('CUST-002',2,'Nairobi Freight Center Ltd','orders@nairobigroup.co.ke','+254 712 345 678',NULL,'Nairobi','PRINTHUB',NULL,NULL,0.00,'active','2026-08-04 08:37:17','2026-08-04 08:37:17',30),('CUST-003',3,'Kenya Logistics Hub Ltd','purchasing@kenyalogistics.co.ke','+254 722 111 222',NULL,'Mombasa','PRINTHUB',NULL,NULL,0.00,'active','2026-08-04 08:37:17','2026-08-04 08:37:17',30);
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `grn`
--

DROP TABLE IF EXISTS `grn`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `grn` (
  `id` int NOT NULL AUTO_INCREMENT,
  `grn_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `po_id` int NOT NULL,
  `received_date` date NOT NULL,
  `receiver_id` int NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','rejected') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `grn_number` (`grn_number`),
  KEY `receiver_id` (`receiver_id`),
  KEY `idx_grn_number` (`grn_number`),
  KEY `idx_po_id` (`po_id`),
  KEY `idx_received_date` (`received_date`),
  CONSTRAINT `grn_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `grn_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `grn`
--

LOCK TABLES `grn` WRITE;
/*!40000 ALTER TABLE `grn` DISABLE KEYS */;
INSERT INTO `grn` VALUES (1,'GRN-2026-0001',2,'2026-08-04',1,'','approved','2026-08-04 07:08:09','2026-08-04 07:08:14');
/*!40000 ALTER TABLE `grn` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `grn_items`
--

DROP TABLE IF EXISTS `grn_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `grn_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `grn_id` int NOT NULL,
  `item_id` int NOT NULL,
  `ordered_quantity` int NOT NULL,
  `received_quantity` int NOT NULL,
  `unit_cost` decimal(10,2) NOT NULL DEFAULT '0.00',
  `unit_price` decimal(15,2) DEFAULT NULL COMMENT 'Cost price per unit at time of receipt',
  `quality_status` enum('accepted','rejected','partial') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'accepted',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_grn_id` (`grn_id`),
  KEY `idx_item_id` (`item_id`),
  CONSTRAINT `grn_items_ibfk_1` FOREIGN KEY (`grn_id`) REFERENCES `grn` (`id`) ON DELETE CASCADE,
  CONSTRAINT `grn_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `grn_items`
--

LOCK TABLES `grn_items` WRITE;
/*!40000 ALTER TABLE `grn_items` DISABLE KEYS */;
INSERT INTO `grn_items` VALUES (1,1,1,100,100,4640.00,NULL,'accepted',NULL);
/*!40000 ALTER TABLE `grn_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory`
--

DROP TABLE IF EXISTS `inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `location_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_item_location` (`item_id`,`location_id`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `inventory_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `inventory_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory`
--

LOCK TABLES `inventory` WRITE;
/*!40000 ALTER TABLE `inventory` DISABLE KEYS */;
INSERT INTO `inventory` VALUES (1,1,1,500,'2026-08-04 08:37:17'),(2,1,2,500,'2026-08-04 08:37:17'),(3,2,1,15,'2026-08-04 08:37:17'),(4,2,2,15,'2026-08-04 08:37:17'),(5,3,1,50,'2026-08-04 08:37:17'),(6,3,2,50,'2026-08-04 08:37:17'),(7,4,1,25,'2026-08-04 08:37:17'),(8,4,2,25,'2026-08-04 08:37:17'),(9,5,1,40,'2026-08-04 08:37:17'),(10,5,2,40,'2026-08-04 08:37:17'),(11,6,1,20,'2026-08-04 08:37:17'),(12,6,2,20,'2026-08-04 08:37:17'),(13,7,1,30,'2026-08-04 08:37:17'),(14,7,2,30,'2026-08-04 08:37:17'),(15,8,1,40,'2026-08-04 08:37:17'),(16,8,2,40,'2026-08-04 08:37:17'),(17,9,1,60,'2026-08-04 08:37:17'),(18,9,2,60,'2026-08-04 08:37:17');
/*!40000 ALTER TABLE `inventory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_batches`
--

DROP TABLE IF EXISTS `inventory_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `grn_id` int DEFAULT NULL,
  `location_id` int DEFAULT NULL,
  `grn_item_id` int DEFAULT NULL,
  `item_id` int NOT NULL,
  `initial_quantity` decimal(10,2) NOT NULL,
  `current_quantity` decimal(10,2) NOT NULL,
  `received_date` date NOT NULL,
  `expiry_date` date DEFAULT NULL,
  `cost_per_unit` decimal(10,2) NOT NULL,
  `quality_status` enum('accepted','rejected','partial') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'accepted',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `batch_number` (`batch_number`),
  KEY `grn_item_id` (`grn_item_id`),
  KEY `idx_item_id` (`item_id`),
  KEY `idx_grn_id` (`grn_id`),
  KEY `idx_batch_number` (`batch_number`),
  KEY `idx_received_date` (`received_date`),
  KEY `idx_batch_fifo` (`item_id`,`current_quantity`,`received_date`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `inventory_batches_ibfk_1` FOREIGN KEY (`grn_id`) REFERENCES `grn` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `inventory_batches_ibfk_2` FOREIGN KEY (`grn_item_id`) REFERENCES `grn_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `inventory_batches_ibfk_3` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `inventory_batches_ibfk_4` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `chk_quantity` CHECK (((`current_quantity` >= 0) and (`current_quantity` <= `initial_quantity`)))
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_batches`
--

LOCK TABLES `inventory_batches` WRITE;
/*!40000 ALTER TABLE `inventory_batches` DISABLE KEYS */;
INSERT INTO `inventory_batches` VALUES (1,'BATCH-PNS-0001-001',NULL,NULL,NULL,1,500.00,500.00,'2026-08-04',NULL,2800.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17'),(2,'BATCH-OEQ-0001-001',NULL,NULL,NULL,2,15.00,15.00,'2026-08-04',NULL,38000.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17'),(3,'BATCH-UNI-0001-001',NULL,NULL,NULL,3,50.00,50.00,'2026-08-04',NULL,8500.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17'),(4,'BATCH-BNE-0001-001',NULL,NULL,NULL,4,25.00,25.00,'2026-08-04',NULL,18000.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17'),(5,'BATCH-LNM-0001-001',NULL,NULL,NULL,5,40.00,40.00,'2026-08-04',NULL,22000.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17'),(6,'BATCH-ICT-0001-001',NULL,NULL,NULL,6,20.00,20.00,'2026-08-04',NULL,95000.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17'),(7,'BATCH-SEC-0001-001',NULL,NULL,NULL,7,30.00,30.00,'2026-08-04',NULL,26000.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17'),(8,'BATCH-INT-0001-001',NULL,NULL,NULL,8,40.00,40.00,'2026-08-04',NULL,12500.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17'),(9,'BATCH-PNT-0001-001',NULL,NULL,NULL,9,60.00,60.00,'2026-08-04',NULL,6000.00,'accepted','2026-08-04 08:37:17','2026-08-04 08:37:17');
/*!40000 ALTER TABLE `inventory_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `items`
--

DROP TABLE IF EXISTS `items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `barcode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `category_id` int NOT NULL,
  `supplier_id` int DEFAULT NULL,
  `unit_of_measure` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `selling_price` decimal(15,2) NOT NULL,
  `tax_rate` decimal(5,2) DEFAULT '0.00',
  `tax_type` enum('exclusive','inclusive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'exclusive',
  `selling_price_excl_tax` decimal(15,2) DEFAULT NULL,
  `selling_price_incl_tax` decimal(15,2) DEFAULT NULL,
  `current_stock` int NOT NULL DEFAULT '0' COMMENT 'Total stock across all locations (deprecated - use inventory table)',
  `reorder_level` int NOT NULL DEFAULT '100' COMMENT 'Minimum stock level before reorder alert',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  UNIQUE KEY `barcode` (`barcode`),
  KEY `idx_code` (`code`),
  KEY `idx_name` (`name`),
  KEY `idx_category` (`category_id`),
  KEY `idx_supplier` (`supplier_id`),
  KEY `idx_status` (`status`),
  KEY `idx_items_barcode` (`barcode`),
  CONSTRAINT `items_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  CONSTRAINT `items_ibfk_2` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `items`
--

LOCK TABLES `items` WRITE;
/*!40000 ALTER TABLE `items` DISABLE KEYS */;
INSERT INTO `items` VALUES (1,'PNS-0001','PNS-0001','Premium Office Copier Paper A4 (Box of 5)','High-quality 80gsm white printing paper for all office needs.',1,3,'PCS',4060.00,0.00,'exclusive',NULL,NULL,0,50,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(2,'OEQ-0001','OEQ-0001','Enterprise LaserJet Pro Multifunction Printer','High-speed wireless duplex office printer and scanner.',2,2,'PCS',52200.00,0.00,'exclusive',NULL,NULL,0,5,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(3,'UNI-0001','UNI-0001','Corporate Executive Polo Shirts (Pack of 10)','Custom branded cotton polo shirts for staff uniform.',3,1,'PCS',13920.00,0.00,'exclusive',NULL,NULL,0,10,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(4,'BNE-0001','BNE-0001','Industrial Power Drill Kit 18V','Heavy-duty cordless drill for construction and engineering projects.',4,2,'PCS',29000.00,0.00,'exclusive',NULL,NULL,0,8,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(5,'LNM-0001','LNM-0001','Clinical Digital Thermometers (Pack of 20)','Precision non-contact infrared thermometers for medical use.',5,1,'PCS',34800.00,0.00,'exclusive',NULL,NULL,0,10,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(6,'ICT-0001','ICT-0001','Business Class Core i7 Laptop 16GB RAM','High-performance laptop for enterprise computing needs.',6,1,'PCS',139200.00,0.00,'exclusive',NULL,NULL,0,5,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(7,'SEC-0001','SEC-0001','CCTV Surveillance Camera System 4CH HD','Complete security system with 4 cameras and 1TB NVR.',7,2,'PCS',40600.00,0.00,'exclusive',NULL,NULL,0,12,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(8,'INT-0001','INT-0001','Ergonomic Executive Mesh Office Chair','Premium adjustable office chair with lumbar support.',8,1,'PCS',20880.00,0.00,'exclusive',NULL,NULL,0,15,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),(9,'PNT-0001','PNT-0001','Commercial Grade Emulsion Paint 20L White','High-coverage interior and exterior paint for commercial buildings.',9,2,'PCS',9860.00,0.00,'exclusive',NULL,NULL,0,20,'active','2026-08-04 08:37:17','2026-08-04 08:37:17');
/*!40000 ALTER TABLE `items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `locations`
--

DROP TABLE IF EXISTS `locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `type` enum('Store','Shop','Warehouse') NOT NULL DEFAULT 'Store',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `locations`
--

LOCK TABLES `locations` WRITE;
/*!40000 ALTER TABLE `locations` DISABLE KEYS */;
INSERT INTO `locations` VALUES (1,'Shop','Shop',1,'2025-12-30 13:52:10',NULL);
/*!40000 ALTER TABLE `locations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `monthly_cost_categories`
--

DROP TABLE IF EXISTS `monthly_cost_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monthly_cost_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=1265 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `monthly_cost_categories`
--

LOCK TABLES `monthly_cost_categories` WRITE;
/*!40000 ALTER TABLE `monthly_cost_categories` DISABLE KEYS */;
INSERT INTO `monthly_cost_categories` VALUES (1,'Rent & Facilities','Shop, warehouse, and office property lease',1,'2026-07-22 05:44:05'),(2,'Utilities & Power','Electricity (CEB), water, gas bills',1,'2026-07-22 05:44:05'),(3,'Salaries & Payroll','Staff wages, commissions, EPF/ETF contributions',0,'2026-07-22 05:44:05'),(4,'Software & IT Services','Internet, phone bills, POS/cloud subscriptions',1,'2026-07-22 05:44:05'),(5,'Marketing & Advertising','Social media ads, print flyers, promotional banners',1,'2026-07-22 05:44:05'),(6,'Repairs & Maintenance','Equipment servicing, machinery and shop upkeep',1,'2026-07-22 05:44:05'),(7,'Insurance & Taxes','Business liability insurance, municipal council rates',1,'2026-07-22 05:44:05'),(8,'General Overhead','Miscellaneous recurring operational costs',1,'2026-07-22 05:44:05');
/*!40000 ALTER TABLE `monthly_cost_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `monthly_costs`
--

DROP TABLE IF EXISTS `monthly_costs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monthly_costs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `category_id` int DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_voided` tinyint(1) DEFAULT '0',
  `void_reason` varchar(255) DEFAULT NULL,
  `voided_at` timestamp NULL DEFAULT NULL,
  `voided_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `monthly_costs`
--

LOCK TABLES `monthly_costs` WRITE;
/*!40000 ALTER TABLE `monthly_costs` DISABLE KEYS */;
/*!40000 ALTER TABLE `monthly_costs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `monthly_sales_targets`
--

DROP TABLE IF EXISTS `monthly_sales_targets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `monthly_sales_targets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `target_month` date NOT NULL COMMENT 'First day of target month (YYYY-MM-01)',
  `overall_target` decimal(15,2) NOT NULL COMMENT 'Company-wide sales target for the month',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_target_month` (`target_month`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `monthly_sales_targets_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Overall monthly sales targets for the company';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `monthly_sales_targets`
--

LOCK TABLES `monthly_sales_targets` WRITE;
/*!40000 ALTER TABLE `monthly_sales_targets` DISABLE KEYS */;
/*!40000 ALTER TABLE `monthly_sales_targets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `operator_monthly_targets`
--

DROP TABLE IF EXISTS `operator_monthly_targets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `operator_monthly_targets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `target_month` date NOT NULL COMMENT 'First day of target month (YYYY-MM-01)',
  `operator_id` int NOT NULL,
  `target_amount` decimal(15,2) NOT NULL COMMENT 'Individual operator sales target',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_operator_month` (`operator_id`,`target_month`),
  KEY `idx_target_month` (`target_month`),
  KEY `idx_operator_id` (`operator_id`),
  KEY `idx_created_by` (`created_by`),
  CONSTRAINT `operator_monthly_targets_ibfk_1` FOREIGN KEY (`operator_id`) REFERENCES `operators` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `operator_monthly_targets_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Individual operator monthly sales targets';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `operator_monthly_targets`
--

LOCK TABLES `operator_monthly_targets` WRITE;
/*!40000 ALTER TABLE `operator_monthly_targets` DISABLE KEYS */;
/*!40000 ALTER TABLE `operator_monthly_targets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `operators`
--

DROP TABLE IF EXISTS `operators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `operators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_code` (`employee_code`),
  KEY `idx_name` (`name`),
  KEY `idx_employee_code` (`employee_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `operators`
--

LOCK TABLES `operators` WRITE;
/*!40000 ALTER TABLE `operators` DISABLE KEYS */;
/*!40000 ALTER TABLE `operators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `petty_cash_categories`
--

DROP TABLE IF EXISTS `petty_cash_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `petty_cash_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `petty_cash_categories`
--

LOCK TABLES `petty_cash_categories` WRITE;
/*!40000 ALTER TABLE `petty_cash_categories` DISABLE KEYS */;
INSERT INTO `petty_cash_categories` VALUES (1,'Transport / Travel','Taxi, fuel, bus, vehicle expenses',0,'2026-07-22 05:14:59'),(2,'Stationery / Office Supplies','Pens, paper, printer cartridges, office items',1,'2026-07-22 05:14:59'),(3,'Refreshments / Food','Tea, coffee, snacks, staff meals',0,'2026-07-22 05:14:59'),(4,'Repairs / Maintenance','Office, machinery, or shop repairs',1,'2026-07-22 05:14:59'),(5,'Courier / Postage','Postal, delivery, courier charges',0,'2026-07-22 05:14:59'),(6,'Other Expenses','Miscellaneous petty cash expenses',0,'2026-07-22 05:14:59'),(7,'test',NULL,1,'2026-07-22 05:33:26'),(8,'test1',NULL,1,'2026-07-22 05:38:04');
/*!40000 ALTER TABLE `petty_cash_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `petty_cash_funds`
--

DROP TABLE IF EXISTS `petty_cash_funds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `petty_cash_funds` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reference_no` varchar(20) NOT NULL,
  `opened_by` int NOT NULL,
  `opened_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `opening_balance` decimal(12,2) NOT NULL,
  `current_balance` decimal(12,2) NOT NULL,
  `status` enum('open','closed') DEFAULT 'open',
  `closed_by` int DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `closing_note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference_no` (`reference_no`),
  KEY `opened_by` (`opened_by`),
  KEY `closed_by` (`closed_by`),
  CONSTRAINT `petty_cash_funds_ibfk_1` FOREIGN KEY (`opened_by`) REFERENCES `users` (`id`),
  CONSTRAINT `petty_cash_funds_ibfk_2` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `petty_cash_funds`
--

LOCK TABLES `petty_cash_funds` WRITE;
/*!40000 ALTER TABLE `petty_cash_funds` DISABLE KEYS */;
INSERT INTO `petty_cash_funds` VALUES (1,'PCF-20260720-214303',1,'2026-07-20 21:43:03',100000.00,100000.00,'closed',1,'2026-07-21 15:45:47','RECONSILED','2026-07-20 16:13:03'),(2,'PCF-20260721-161504',1,'2026-07-21 16:15:04',12000.00,11135.00,'open',NULL,NULL,NULL,'2026-07-21 10:45:04');
/*!40000 ALTER TABLE `petty_cash_funds` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `petty_cash_transactions`
--

DROP TABLE IF EXISTS `petty_cash_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `petty_cash_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fund_id` int NOT NULL,
  `type` enum('replenishment','disbursement') NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `description` text NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `balance_after` decimal(12,2) NOT NULL,
  `reference_no` varchar(30) DEFAULT NULL,
  `transaction_date` date NOT NULL,
  `recorded_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_voided` tinyint(1) DEFAULT '0',
  `void_reason` text,
  PRIMARY KEY (`id`),
  KEY `fund_id` (`fund_id`),
  KEY `recorded_by` (`recorded_by`),
  CONSTRAINT `petty_cash_transactions_ibfk_1` FOREIGN KEY (`fund_id`) REFERENCES `petty_cash_funds` (`id`) ON DELETE CASCADE,
  CONSTRAINT `petty_cash_transactions_ibfk_2` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `petty_cash_transactions`
--

LOCK TABLES `petty_cash_transactions` WRITE;
/*!40000 ALTER TABLE `petty_cash_transactions` DISABLE KEYS */;
INSERT INTO `petty_cash_transactions` VALUES (1,1,'replenishment','Opening Balance','Initial float setup',100000.00,100000.00,NULL,'2026-07-20',1,'2026-07-20 16:13:03',0,NULL),(2,1,'disbursement','Transport','pick me',765.00,99235.00,NULL,'2026-07-20',1,'2026-07-20 16:38:44',1,'INCORRECT'),(3,1,'disbursement','Maintenance','AC REPAIR',12000.00,88000.00,NULL,'2026-07-20',1,'2026-07-20 17:06:45',1,'INC'),(4,1,'disbursement','Stationery','BOOKS',12000.00,88000.00,NULL,'2026-07-20',1,'2026-07-20 17:08:13',1,'INC'),(5,2,'replenishment','Opening Balance','Initial float setup',12000.00,12000.00,NULL,'2026-07-21',1,'2026-07-21 10:45:04',0,NULL),(6,2,'disbursement','Transport','pickme',765.00,11235.00,NULL,'2026-07-21',1,'2026-07-21 11:27:08',0,NULL),(7,2,'disbursement','Repairs / Maintenance','ac',100.00,11135.00,NULL,'2026-07-22',1,'2026-07-22 05:37:28',0,NULL);
/*!40000 ALTER TABLE `petty_cash_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `po_items`
--

DROP TABLE IF EXISTS `po_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `po_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `unit_price_excl_tax` decimal(15,2) DEFAULT NULL,
  `tax_rate` decimal(5,2) DEFAULT '0.00',
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `unit_price_incl_tax` decimal(15,2) DEFAULT NULL,
  `total_price_excl_tax` decimal(15,2) DEFAULT NULL,
  `total_price_incl_tax` decimal(15,2) DEFAULT NULL,
  `total_price` decimal(15,2) NOT NULL,
  `received_quantity` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_po` (`po_id`),
  KEY `idx_item` (`item_id`),
  CONSTRAINT `po_items_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `po_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `po_items`
--

LOCK TABLES `po_items` WRITE;
/*!40000 ALTER TABLE `po_items` DISABLE KEYS */;
INSERT INTO `po_items` VALUES (1,1,4,11,1276.00,1276.00,0.00,0.00,1276.00,14036.00,14036.00,14036.00,0),(2,2,1,100,4640.00,4640.00,10.00,46400.00,5104.00,464000.00,510400.00,510400.00,100);
/*!40000 ALTER TABLE `po_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `po_payments`
--

DROP TABLE IF EXISTS `po_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `po_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_id` int NOT NULL,
  `supplier_id` int NOT NULL,
  `payment_method` varchar(50) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `notes` text,
  `paid_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_cancelled` tinyint(1) NOT NULL DEFAULT '0',
  `cancelled_by` int DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancel_reason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `po_id` (`po_id`),
  KEY `supplier_id` (`supplier_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `po_payments_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `po_payments_ibfk_2` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `po_payments_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `po_payments`
--

LOCK TABLES `po_payments` WRITE;
/*!40000 ALTER TABLE `po_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `po_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `production`
--

DROP TABLE IF EXISTS `production`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `bom_id` int NOT NULL,
  `quantity_produced` int NOT NULL,
  `production_date` date NOT NULL,
  `status` enum('pending','completed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `produced_by` int NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `production_number` (`production_number`),
  KEY `produced_by` (`produced_by`),
  KEY `idx_production_number` (`production_number`),
  KEY `idx_bom_id` (`bom_id`),
  KEY `idx_production_date` (`production_date`),
  KEY `idx_status` (`status`),
  CONSTRAINT `production_ibfk_1` FOREIGN KEY (`bom_id`) REFERENCES `bom` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `production_ibfk_2` FOREIGN KEY (`produced_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `production`
--

LOCK TABLES `production` WRITE;
/*!40000 ALTER TABLE `production` DISABLE KEYS */;
/*!40000 ALTER TABLE `production` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_id` int NOT NULL,
  `order_date` date NOT NULL,
  `expected_delivery` date DEFAULT NULL,
  `status` enum('Draft','Pending','Approved','Received','Cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `subtotal` decimal(15,2) NOT NULL,
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `discount_amount` decimal(15,2) DEFAULT '0.00',
  `total_amount` decimal(15,2) NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `payment_status` enum('unpaid','partial','paid') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `due_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `po_number` (`po_number`),
  KEY `created_by` (`created_by`),
  KEY `idx_po_number` (`po_number`),
  KEY `idx_supplier` (`supplier_id`),
  KEY `idx_status` (`status`),
  KEY `idx_order_date` (`order_date`),
  CONSTRAINT `purchase_orders_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `purchase_orders_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_orders`
--

LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
INSERT INTO `purchase_orders` VALUES (1,'PO-2026-0001',2,'2026-08-04',NULL,'Draft',14036.00,0.00,0.00,14036.00,'',1,'2026-08-04 06:20:32','2026-08-04 06:20:32','unpaid',0.00,'2026-08-04'),(2,'PO-2026-0002',2,'2026-08-04',NULL,'Received',464000.00,46400.00,0.00,510400.00,'',1,'2026-08-04 06:29:09','2026-08-04 07:08:14','unpaid',0.00,'2026-08-04');
/*!40000 ALTER TABLE `purchase_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quotation_items`
--

DROP TABLE IF EXISTS `quotation_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotation_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quotation_id` int NOT NULL,
  `item_id` int DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `total_price` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_quotation_id` (`quotation_id`),
  KEY `idx_item_id` (`item_id`),
  CONSTRAINT `quotation_items_ibfk_1` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `quotation_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quotation_items`
--

LOCK TABLES `quotation_items` WRITE;
/*!40000 ALTER TABLE `quotation_items` DISABLE KEYS */;
INSERT INTO `quotation_items` VALUES (1,1,1,'80x80mm Thermal Paper Rolls (Box of 50)',10,4840.00,48400.00);
/*!40000 ALTER TABLE `quotation_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quotations`
--

DROP TABLE IF EXISTS `quotations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int DEFAULT NULL,
  `customer_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_contact` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `quote_date` date NOT NULL,
  `validity_days` int DEFAULT '7',
  `payment_terms` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `subtotal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_percentage` decimal(5,2) DEFAULT '0.00',
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `discount_amount` decimal(10,2) DEFAULT '0.00',
  `total_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` enum('Draft','Pending','Approved','Rejected','Cancelled','Invoiced') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approved_at` timestamp NULL DEFAULT NULL,
  `discount_percentage` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `quote_number` (`quote_number`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_quote_number` (`quote_number`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_status` (`status`),
  KEY `idx_quote_date` (`quote_date`),
  KEY `idx_created_by` (`created_by`),
  CONSTRAINT `quotations_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `quotations_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `quotations_ibfk_3` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quotations`
--

LOCK TABLES `quotations` WRITE;
/*!40000 ALTER TABLE `quotations` DISABLE KEYS */;
INSERT INTO `quotations` VALUES (1,'QT-20260804-0597',3,'Kenya Logistics Hub Ltd','+254 722 111 222',NULL,'2026-08-04',7,'Payment Terms: 70% In Advance, balance After Completion. We will be happy to supply any further information you may need and trust that you call on us to fill your order, which will receive our prompt and careful attention.',48400.00,10.00,4840.00,0.00,53240.00,'Approved',NULL,1,1,'2026-08-04 06:32:36','2026-08-04 06:32:49','2026-08-04 06:32:49',0.00);
/*!40000 ALTER TABLE `quotations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `role_id` int NOT NULL,
  `permission` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_role_permission` (`role_id`,`permission`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (9,1,'adjustments:*'),(3,1,'categories:*'),(5,1,'customers:*'),(7,1,'grn:*'),(2,1,'items:*'),(6,1,'po:*'),(14,1,'quotations:*'),(12,1,'reports:*'),(10,1,'returns:*'),(11,1,'sales:*'),(13,1,'settings:*'),(4,1,'suppliers:*'),(8,1,'transfers:*'),(1,1,'users:*'),(30,2,'adjustments:*'),(19,2,'categories:create'),(18,2,'categories:read'),(20,2,'categories:update'),(36,2,'customers:*'),(28,2,'grn:create'),(27,2,'grn:read'),(16,2,'items:create'),(15,2,'items:read'),(17,2,'items:update'),(25,2,'po:create'),(24,2,'po:read'),(26,2,'po:update'),(38,2,'quotations:create'),(39,2,'quotations:delete'),(37,2,'quotations:read'),(33,2,'reports:inventory'),(34,2,'reports:purchase'),(32,2,'reports:read'),(31,2,'returns:*'),(35,2,'sales:*'),(22,2,'suppliers:create'),(21,2,'suppliers:read'),(23,2,'suppliers:update'),(29,2,'transfers:*'),(51,3,'grn:*'),(52,3,'grn:create'),(49,3,'po:*'),(50,3,'po:create'),(53,3,'sales:*');
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_system` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'Admin','System Administrator',1,'2026-07-22 15:04:24'),(2,'Coordinator','Inventory & Operations Coordinator',1,'2026-07-22 15:04:24'),(3,'Cashier','Sales Cashier',1,'2026-07-22 15:04:24');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_item_batches`
--

DROP TABLE IF EXISTS `sale_item_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_item_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_item_id` int NOT NULL,
  `batch_id` int NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `cost_price` decimal(10,4) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sale_item_id` (`sale_item_id`),
  KEY `batch_id` (`batch_id`),
  CONSTRAINT `sale_item_batches_ibfk_1` FOREIGN KEY (`sale_item_id`) REFERENCES `sale_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sale_item_batches_ibfk_2` FOREIGN KEY (`batch_id`) REFERENCES `inventory_batches` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_item_batches`
--

LOCK TABLES `sale_item_batches` WRITE;
/*!40000 ALTER TABLE `sale_item_batches` DISABLE KEYS */;
INSERT INTO `sale_item_batches` VALUES (1,2,2,1.00,1100.0000,'2026-08-04 04:00:40'),(2,3,7,1.00,1850.0000,'2026-08-04 04:05:36'),(3,4,8,1.00,4500.0000,'2026-08-04 04:07:23'),(4,5,2,1.00,1100.0000,'2026-08-04 04:11:41'),(5,6,2,1.00,1100.0000,'2026-08-04 04:12:07'),(6,7,3,1.00,3900.0000,'2026-08-04 04:32:44'),(7,8,3,1.00,3900.0000,'2026-08-04 04:45:50'),(8,9,3,1.00,3900.0000,'2026-08-04 04:46:16'),(9,10,3,1.00,3900.0000,'2026-08-04 04:58:53'),(10,11,2,1.00,1100.0000,'2026-08-04 05:36:42'),(11,12,4,1.00,750.0000,'2026-08-04 05:39:20'),(12,13,8,1.00,4500.0000,'2026-08-04 05:41:08'),(13,14,4,1.00,750.0000,'2026-08-04 05:41:08'),(14,15,3,1.00,3900.0000,'2026-08-04 07:20:10'),(15,16,2,1.00,1100.0000,'2026-08-04 07:56:09');
/*!40000 ALTER TABLE `sale_item_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_items`
--

DROP TABLE IF EXISTS `sale_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `discount_amount` decimal(15,2) DEFAULT '0.00' COMMENT 'Fixed discount amount per item',
  `discount_percentage` decimal(5,2) DEFAULT '0.00' COMMENT 'Percentage discount per item (0-100)',
  `total_price` decimal(15,2) NOT NULL,
  `cost_price` decimal(15,2) DEFAULT '0.00' COMMENT 'Actual cost at time of sale (from batch for direct items, calculated for BOM items, 0 for services)',
  PRIMARY KEY (`id`),
  KEY `idx_sale` (`sale_id`),
  KEY `idx_item` (`item_id`),
  KEY `idx_sale_items_cost` (`item_id`,`cost_price`),
  CONSTRAINT `sale_items_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sale_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_items`
--

LOCK TABLES `sale_items` WRITE;
/*!40000 ALTER TABLE `sale_items` DISABLE KEYS */;
INSERT INTO `sale_items` VALUES (2,3,2,1,1856.00,0.00,0.00,1856.00,1100.00),(3,4,7,1,3248.00,0.00,0.00,3248.00,1850.00),(4,5,8,1,8700.00,0.00,0.00,8700.00,4500.00),(5,6,2,1,1856.00,0.00,0.00,1856.00,1100.00),(6,7,2,1,1856.00,0.00,0.00,1856.00,1100.00),(7,8,3,1,6380.00,0.00,0.00,6380.00,3900.00),(8,9,3,1,6380.00,0.00,0.00,6380.00,3900.00),(9,10,3,1,6380.00,0.00,0.00,6380.00,3900.00),(10,11,3,1,6380.00,0.00,0.00,6380.00,3900.00),(11,12,2,1,1856.00,0.00,0.00,1856.00,1100.00),(12,13,4,1,1276.00,0.00,0.00,1276.00,750.00),(13,14,8,1,8700.00,0.00,0.00,8700.00,4500.00),(14,14,4,1,1276.00,0.00,0.00,1276.00,750.00),(15,15,3,1,6380.00,0.00,0.00,6380.00,3900.00),(16,16,2,1,1856.00,0.00,0.00,1856.00,1100.00);
/*!40000 ALTER TABLE `sale_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_operators`
--

DROP TABLE IF EXISTS `sale_operators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_operators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_id` int NOT NULL,
  `operator_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_sale_operator` (`sale_id`,`operator_id`),
  KEY `idx_sale_id` (`sale_id`),
  KEY `idx_operator_id` (`operator_id`),
  CONSTRAINT `sale_operators_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sale_operators_ibfk_2` FOREIGN KEY (`operator_id`) REFERENCES `operators` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_operators`
--

LOCK TABLES `sale_operators` WRITE;
/*!40000 ALTER TABLE `sale_operators` DISABLE KEYS */;
/*!40000 ALTER TABLE `sale_operators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_payments`
--

DROP TABLE IF EXISTS `sale_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_id` int NOT NULL,
  `payment_method` enum('Cash','Card','Bank Transfer','Credit','Mobile Money') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `reference_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Transaction reference for card/bank payments',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sale_id` (`sale_id`),
  KEY `idx_payment_method` (`payment_method`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `sale_payments_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_payments`
--

LOCK TABLES `sale_payments` WRITE;
/*!40000 ALTER TABLE `sale_payments` DISABLE KEYS */;
INSERT INTO `sale_payments` VALUES (2,3,'Cash',1856.00,NULL,NULL,'2026-08-04 04:00:40'),(3,4,'Cash',3248.00,NULL,NULL,'2026-08-04 04:05:36'),(4,5,'Card',8700.00,NULL,NULL,'2026-08-04 04:07:23'),(5,6,'Card',1856.00,NULL,NULL,'2026-08-04 04:11:41'),(6,7,'Cash',1856.00,NULL,'Pending payment','2026-08-04 04:12:07'),(7,8,'Card',6380.00,NULL,NULL,'2026-08-04 04:32:44'),(8,9,'Card',6380.00,NULL,NULL,'2026-08-04 04:45:50'),(9,10,'Card',6380.00,NULL,'Payment via Card','2026-08-04 04:46:27'),(10,11,'Cash',0.00,NULL,'100% Discount / Promo Sale','2026-08-04 04:58:52'),(11,15,'Cash',0.00,NULL,'100% Discount / Promo Sale','2026-08-04 07:20:10'),(12,16,'Card',1856.00,NULL,NULL,'2026-08-04 07:56:09');
/*!40000 ALTER TABLE `sale_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales`
--

DROP TABLE IF EXISTS `sales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int DEFAULT NULL,
  `sale_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `subtotal` decimal(15,2) NOT NULL,
  `discount_percentage` decimal(5,2) DEFAULT '0.00',
  `discount_amount` decimal(15,2) DEFAULT '0.00',
  `tax_percentage` decimal(5,2) DEFAULT '0.00',
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `total_amount` decimal(15,2) NOT NULL,
  `payment_method` enum('Cash','Card','Bank Transfer','Credit') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'DEPRECATED - Use sale_payments table for payment details',
  `payment_status` enum('Paid','Pending','Partial') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Paid',
  `status` enum('completed','cancelled','pending') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `cashier_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `sales_person_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `idx_invoice` (`invoice_number`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_sale_date` (`sale_date`),
  KEY `idx_cashier` (`cashier_id`),
  KEY `sales_person_id` (`sales_person_id`),
  CONSTRAINT `sales_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `sales_ibfk_2` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`id`),
  CONSTRAINT `sales_ibfk_3` FOREIGN KEY (`sales_person_id`) REFERENCES `sales_persons` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales`
--

LOCK TABLES `sales` WRITE;
/*!40000 ALTER TABLE `sales` DISABLE KEYS */;
INSERT INTO `sales` VALUES (3,'INV-20260804-0001',1,'2026-08-03 18:30:00',1856.00,0.00,0.00,0.00,0.00,1856.00,'Cash','Paid','completed','Online Order by TEST PVT (08901890918)',1,'2026-08-04 04:00:40',NULL),(4,'INV-20260804-0002',1,'2026-08-03 18:30:00',3248.00,0.00,0.00,0.00,0.00,3248.00,'Cash','Paid','completed','[Cash on Delivery] Online Order by TEST PVT (08901890918)',1,'2026-08-04 04:05:36',NULL),(5,'INV-20260804-0003',1,'2026-08-03 18:30:00',8700.00,0.00,0.00,0.00,0.00,8700.00,'Card','Paid','completed','[M-Pesa Express] Online Order by TEST PVT (08901890918)',1,'2026-08-04 04:07:23',NULL),(6,'INV-20260804-0004',1,'2026-08-03 18:30:00',1856.00,0.00,0.00,0.00,0.00,1856.00,'Card','Paid','completed','[M-Pesa Express] Online Order by TEST PVT (08901890918)',1,'2026-08-04 04:11:41',NULL),(7,'INV-20260804-0005',1,'2026-08-03 18:30:00',1856.00,0.00,0.00,0.00,0.00,1856.00,'Cash','Pending','pending','[Cash on Delivery] Online Order by TEST PVT (08901890918)',1,'2026-08-04 04:12:07',NULL),(8,'INV-20260804-0006',1,'2026-08-03 18:30:00',6380.00,0.00,0.00,0.00,0.00,6380.00,'Card','Paid','completed','[M-Pesa Express] Online Order by TEST PVT (08901890918)',1,'2026-08-04 04:32:44',NULL),(9,'INV-20260804-0007',1,'2026-08-03 18:30:00',6380.00,0.00,0.00,0.00,0.00,6380.00,'Card','Paid','completed','[M-Pesa Express] Online Order by TEST PVT (08901890918)',1,'2026-08-04 04:45:50',NULL),(10,'INV-20260804-0008',1,'2026-08-03 18:30:00',6380.00,0.00,0.00,0.00,0.00,6380.00,'Cash','Paid','completed','[Cash on Delivery] Online Order by TEST PVT (08901890918)',1,'2026-08-04 04:46:16',NULL),(11,'INV-20260804-0009',NULL,'2026-08-03 18:30:00',6380.00,100.00,6380.00,0.00,0.00,0.00,'Cash','Paid','completed',NULL,1,'2026-08-04 04:58:52',NULL),(12,'INV-20260804-0010',1,'2026-08-03 18:30:00',1856.00,0.00,0.00,0.00,0.00,1856.00,'Cash','Pending','pending','[Cash on Delivery] Online Order by TEST PVT (08901890918)',1,'2026-08-04 05:36:42',NULL),(13,'INV-20260804-0011',1,'2026-08-03 18:30:00',1276.00,0.00,0.00,0.00,0.00,1276.00,'Cash','Pending','pending','[Cash on Delivery] Online Order by TEST PVT (08901890918)',1,'2026-08-04 05:39:20',NULL),(14,'INV-20260804-0012',1,'2026-08-03 18:30:00',9976.00,0.00,0.00,0.00,0.00,9976.00,'Cash','Pending','pending','[Cash on Delivery] Online Order by TEST PVT (08901890918)',1,'2026-08-04 05:41:08',NULL),(15,'INV-20260804-0013',NULL,'2026-08-03 18:30:00',6380.00,100.00,6380.00,0.00,0.00,0.00,'Cash','Paid','completed',NULL,1,'2026-08-04 07:20:10',NULL),(16,'INV-20260804-0014',1,'2026-08-03 18:30:00',1856.00,0.00,0.00,0.00,0.00,1856.00,'Card','Paid','cancelled','[M-Pesa Express] Online Order by TEST PVT (08901890918)\n[CANCELLED] Return',1,'2026-08-04 07:56:09',NULL);
/*!40000 ALTER TABLE `sales` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_person_monthly_targets`
--

DROP TABLE IF EXISTS `sales_person_monthly_targets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_person_monthly_targets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `target_month` varchar(7) NOT NULL,
  `sales_person_id` int NOT NULL,
  `target_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_target` (`target_month`,`sales_person_id`),
  KEY `sales_person_id` (`sales_person_id`),
  CONSTRAINT `sales_person_monthly_targets_ibfk_1` FOREIGN KEY (`sales_person_id`) REFERENCES `sales_persons` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_person_monthly_targets`
--

LOCK TABLES `sales_person_monthly_targets` WRITE;
/*!40000 ALTER TABLE `sales_person_monthly_targets` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_person_monthly_targets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_persons`
--

DROP TABLE IF EXISTS `sales_persons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales_persons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `hide` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_sales_persons_hide` (`hide`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_persons`
--

LOCK TABLES `sales_persons` WRITE;
/*!40000 ALTER TABLE `sales_persons` DISABLE KEYS */;
INSERT INTO `sales_persons` VALUES (6,'Waruna','active','2026-02-08 20:19:39',0);
/*!40000 ALTER TABLE `sales_persons` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stock_adjustments`
--

DROP TABLE IF EXISTS `stock_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_adjustments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `adjustment_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_id` int NOT NULL,
  `adjustment_type` enum('addition','subtraction','correction') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_quantity` int NOT NULL,
  `adjusted_quantity` int NOT NULL,
  `difference` int NOT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','approved','rejected') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `adjusted_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `adjustment_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `uses_batch_tracking` tinyint(1) DEFAULT '0' COMMENT 'TRUE if adjustment uses batch-level tracking',
  PRIMARY KEY (`id`),
  UNIQUE KEY `adjustment_number` (`adjustment_number`),
  KEY `adjusted_by` (`adjusted_by`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_adjustment_number` (`adjustment_number`),
  KEY `idx_item_id` (`item_id`),
  KEY `idx_status` (`status`),
  KEY `idx_adjustment_date` (`adjustment_date`),
  CONSTRAINT `stock_adjustments_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `stock_adjustments_ibfk_2` FOREIGN KEY (`adjusted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `stock_adjustments_ibfk_3` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock_adjustments`
--

LOCK TABLES `stock_adjustments` WRITE;
/*!40000 ALTER TABLE `stock_adjustments` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_adjustments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stock_ledger`
--

DROP TABLE IF EXISTS `stock_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_ledger` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` int NOT NULL,
  `transaction_type` enum('purchase','sale','adjustment','transfer_in','transfer_out','return') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` int DEFAULT NULL,
  `quantity_before` int NOT NULL,
  `quantity_change` int NOT NULL,
  `quantity_after` int NOT NULL,
  `balance_after` decimal(15,2) DEFAULT '0.00',
  `unit_price` decimal(15,2) DEFAULT NULL,
  `performed_by` int NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `remarks` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_item` (`item_id`),
  KEY `idx_transaction_type` (`transaction_type`),
  KEY `idx_created_at` (`created_at`),
  KEY `fk_stock_ledger_performed_by` (`performed_by`),
  CONSTRAINT `fk_stock_ledger_performed_by` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `stock_ledger_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`),
  CONSTRAINT `stock_ledger_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock_ledger`
--

LOCK TABLES `stock_ledger` WRITE;
/*!40000 ALTER TABLE `stock_ledger` DISABLE KEYS */;
INSERT INTO `stock_ledger` VALUES (1,2,'sale','Sale - FIFO Batch Consumption',3,250,-1,249,0.00,1100.00,1,'FIFO: Consumed 1 from Batch #2 (GRN #null) for Heavy Duty Stretch Wrap Film 500mm x 300m',NULL,NULL,'2026-08-04 04:00:40'),(2,2,'sale','Sale - Item Summary',3,250,-1,249,0.00,1100.00,1,'Total sold for Heavy Duty Stretch Wrap Film 500mm x 300m from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:00:40'),(3,7,'sale','Sale - FIFO Batch Consumption',4,150,-1,149,0.00,1850.00,1,'FIFO: Consumed 1 from Batch #7 (GRN #null) for Self-Adhesive Courier Polybag Mailers 300x400mm (Pack of 500)',NULL,NULL,'2026-08-04 04:05:36'),(4,7,'sale','Sale - Item Summary',4,150,-1,149,0.00,1850.00,1,'Total sold for Self-Adhesive Courier Polybag Mailers 300x400mm (Pack of 500) from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:05:36'),(5,8,'sale','Sale - FIFO Batch Consumption',5,50,-1,49,0.00,4500.00,1,'FIFO: Consumed 1 from Batch #8 (GRN #null) for Warehouse Logistics & Processing Service (per CBM)',NULL,NULL,'2026-08-04 04:07:23'),(6,8,'sale','Sale - Item Summary',5,50,-1,49,0.00,4500.00,1,'Total sold for Warehouse Logistics & Processing Service (per CBM) from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:07:23'),(7,2,'sale','Sale - FIFO Batch Consumption',6,249,-1,248,0.00,1100.00,1,'FIFO: Consumed 1 from Batch #2 (GRN #null) for Heavy Duty Stretch Wrap Film 500mm x 300m',NULL,NULL,'2026-08-04 04:11:41'),(8,2,'sale','Sale - Item Summary',6,249,-1,248,0.00,1100.00,1,'Total sold for Heavy Duty Stretch Wrap Film 500mm x 300m from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:11:41'),(9,2,'sale','Sale - FIFO Batch Consumption',7,248,-1,247,0.00,1100.00,1,'FIFO: Consumed 1 from Batch #2 (GRN #null) for Heavy Duty Stretch Wrap Film 500mm x 300m',NULL,NULL,'2026-08-04 04:12:07'),(10,2,'sale','Sale - Item Summary',7,248,-1,247,0.00,1100.00,1,'Total sold for Heavy Duty Stretch Wrap Film 500mm x 300m from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:12:07'),(11,3,'sale','Sale - FIFO Batch Consumption',8,80,-1,79,0.00,3900.00,1,'FIFO: Consumed 1 from Batch #3 (GRN #null) for Custom Branded Shipping Boxes (Pack of 100)',NULL,NULL,'2026-08-04 04:32:44'),(12,3,'sale','Sale - Item Summary',8,80,-1,79,0.00,3900.00,1,'Total sold for Custom Branded Shipping Boxes (Pack of 100) from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:32:44'),(13,3,'sale','Sale - FIFO Batch Consumption',9,80,-1,79,0.00,3900.00,1,'FIFO: Consumed 1 from Batch #3 (GRN #null) for Custom Branded Shipping Boxes (Pack of 100)',NULL,NULL,'2026-08-04 04:45:50'),(14,3,'sale','Sale - Item Summary',9,80,-1,79,0.00,3900.00,1,'Total sold for Custom Branded Shipping Boxes (Pack of 100) from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:45:50'),(15,3,'sale','Sale - FIFO Batch Consumption',10,79,-1,78,0.00,3900.00,1,'FIFO: Consumed 1 from Batch #3 (GRN #null) for Custom Branded Shipping Boxes (Pack of 100)',NULL,NULL,'2026-08-04 04:46:16'),(16,3,'sale','Sale - Item Summary',10,79,-1,78,0.00,3900.00,1,'Total sold for Custom Branded Shipping Boxes (Pack of 100) from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:46:16'),(17,3,'sale','Sale - FIFO Batch Consumption',11,78,-1,77,0.00,3900.00,1,'FIFO: Consumed 1 from Batch #3 (GRN #null) for Custom Branded Shipping Boxes (Pack of 100)',NULL,NULL,'2026-08-04 04:58:53'),(18,3,'sale','Sale - Item Summary',11,78,-1,77,0.00,3900.00,1,'Total sold for Custom Branded Shipping Boxes (Pack of 100) from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 04:58:53'),(19,2,'sale','Sale - FIFO Batch Consumption',12,250,-1,249,0.00,1100.00,1,'FIFO: Consumed 1 from Batch #2 (GRN #null) for Heavy Duty Stretch Wrap Film 500mm x 300m',NULL,NULL,'2026-08-04 05:36:42'),(20,2,'sale','Sale - Item Summary',12,250,-1,249,0.00,1100.00,1,'Total sold for Heavy Duty Stretch Wrap Film 500mm x 300m from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 05:36:42'),(21,4,'sale','Sale - FIFO Batch Consumption',13,180,-1,179,0.00,750.00,1,'FIFO: Consumed 1 from Batch #4 (GRN #null) for Barcode Printer Wax Ribbon 110mm x 300m',NULL,NULL,'2026-08-04 05:39:20'),(22,4,'sale','Sale - Item Summary',13,180,-1,179,0.00,750.00,1,'Total sold for Barcode Printer Wax Ribbon 110mm x 300m from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 05:39:20'),(23,8,'sale','Sale - FIFO Batch Consumption',14,50,-1,49,0.00,4500.00,1,'FIFO: Consumed 1 from Batch #8 (GRN #null) for Warehouse Logistics & Processing Service (per CBM)',NULL,NULL,'2026-08-04 05:41:08'),(24,8,'sale','Sale - Item Summary',14,50,-1,49,0.00,4500.00,1,'Total sold for Warehouse Logistics & Processing Service (per CBM) from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 05:41:08'),(25,4,'sale','Sale - FIFO Batch Consumption',14,179,-1,178,0.00,750.00,1,'FIFO: Consumed 1 from Batch #4 (GRN #null) for Barcode Printer Wax Ribbon 110mm x 300m',NULL,NULL,'2026-08-04 05:41:08'),(26,4,'sale','Sale - Item Summary',14,179,-1,178,0.00,750.00,1,'Total sold for Barcode Printer Wax Ribbon 110mm x 300m from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 05:41:08'),(27,1,'purchase','GRN',1,0,100,100,0.00,NULL,1,'GRN approved: GRN-2026-0001 (Added to Store)',NULL,NULL,'2026-08-04 07:08:14'),(28,3,'sale','Sale - FIFO Batch Consumption',15,77,-1,76,0.00,3900.00,1,'FIFO: Consumed 1 from Batch #3 (GRN #null) for Custom Branded Shipping Boxes (Pack of 100)',NULL,NULL,'2026-08-04 07:20:10'),(29,3,'sale','Sale - Item Summary',15,77,-1,76,0.00,3900.00,1,'Total sold for Custom Branded Shipping Boxes (Pack of 100) from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 07:20:10'),(30,2,'sale','Sale - FIFO Batch Consumption',16,249,-1,248,0.00,1100.00,1,'FIFO: Consumed 1 from Batch #2 (GRN #null) for Heavy Duty Stretch Wrap Film 500mm x 300m',NULL,NULL,'2026-08-04 07:56:09'),(31,2,'sale','Sale - Item Summary',16,249,-1,248,0.00,1100.00,1,'Total sold for Heavy Duty Stretch Wrap Film 500mm x 300m from Shop (deducted from 1 batch(es))',NULL,NULL,'2026-08-04 07:56:09'),(32,2,'return','Batch Restored',16,248,1,249,0.00,1100.00,1,'Batch #2 restored from cancelled invoice (Relational)',NULL,NULL,'2026-08-04 07:57:00'),(33,2,'return','Shop Inventory Restored',16,248,1,249,0.00,1856.00,1,'Shop inventory restored from cancelled invoice',NULL,NULL,'2026-08-04 07:57:00'),(34,2,'return','Sale Cancelled',16,-2,1,-1,0.00,1856.00,1,'Stock restored from cancelled invoice',NULL,NULL,'2026-08-04 07:57:00');
/*!40000 ALTER TABLE `stock_ledger` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stock_transfers`
--

DROP TABLE IF EXISTS `stock_transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transfer_number` varchar(50) NOT NULL,
  `from_location` varchar(50) NOT NULL,
  `to_location` varchar(50) NOT NULL,
  `transfer_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` enum('pending','completed','cancelled') DEFAULT 'completed',
  `initiated_by` int DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transfer_number` (`transfer_number`),
  KEY `initiated_by` (`initiated_by`),
  CONSTRAINT `stock_transfers_ibfk_1` FOREIGN KEY (`initiated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock_transfers`
--

LOCK TABLES `stock_transfers` WRITE;
/*!40000 ALTER TABLE `stock_transfers` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_transfers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tax_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_terms` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `credit_limit` decimal(10,0) NOT NULL,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_name` (`name`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES ('SUP-001',1,'HenChamp Supply Hub Kenya','Sales Desk','orders@henchamp.com','+254 700 123 456',NULL,'Nairobi','Kenya',NULL,NULL,100000,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),('SUP-002',2,'Global Packtech Industries','Michael Chen','sales@packtech.co.ke','+254 722 987 654',NULL,'Mombasa','Kenya',NULL,NULL,100000,'active','2026-08-04 08:37:17','2026-08-04 08:37:17'),('SUP-003',3,'Media Print & Paper Ltd','Sarah Omondi','info@mediaprint.co.ke','+254 733 456 789',NULL,'Nairobi','Kenya',NULL,NULL,100000,'active','2026-08-04 08:37:17','2026-08-04 08:37:17');
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_settings`
--

LOCK TABLES `system_settings` WRITE;
/*!40000 ALTER TABLE `system_settings` DISABLE KEYS */;
INSERT INTO `system_settings` VALUES (1,'company_name','Autora (PVT) LTD','Autora (PVT) LTD','2026-02-14 04:10:41'),(2,'tax_rate','10','Default tax rate percentage','2025-12-24 09:01:10'),(3,'currency','LKR','Default currency','2026-01-13 14:40:45'),(4,'low_stock_threshold','10','Default low stock threshold','2025-12-24 09:01:10'),(5,'void_admin_password','Admin124','Password required for voiding transactions','2026-08-03 18:03:22'),(6,'show_print_preview','false','Show print preview modal before printing','2026-02-12 09:25:38');
/*!40000 ALTER TABLE `system_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transfer_items`
--

DROP TABLE IF EXISTS `transfer_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transfer_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transfer_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `transfer_id` (`transfer_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `transfer_items_ibfk_1` FOREIGN KEY (`transfer_id`) REFERENCES `stock_transfers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transfer_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transfer_items`
--

LOCK TABLES `transfer_items` WRITE;
/*!40000 ALTER TABLE `transfer_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `transfer_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `units_of_measure`
--

DROP TABLE IF EXISTS `units_of_measure`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `units_of_measure` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `short_name` varchar(10) NOT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `short_name` (`short_name`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `units_of_measure`
--

LOCK TABLES `units_of_measure` WRITE;
/*!40000 ALTER TABLE `units_of_measure` DISABLE KEYS */;
INSERT INTO `units_of_measure` VALUES (1,'Pieces','pcs',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(2,'Kilograms','kg',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(3,'Liters','ltr',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(4,'Meters','mtr',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(5,'Box','box',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(6,'Set','set',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(7,'Square Feet','sqft',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(8,'Feet','ft',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(9,'Numbers','nos',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24'),(10,'Milliliters','ml',NULL,'2026-03-27 03:52:24','2026-03-27 03:52:24');
/*!40000 ALTER TABLE `units_of_measure` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('Admin','Coordinator','Cashier') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Cashier',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_username` (`username`),
  KEY `idx_email` (`email`),
  KEY `idx_role` (`role`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Admin','admin@autora.lk','$2b$10$NGs6vN71eAeV25k5oNL8LudtRq7ONKI2zdLURvO2BL09wLjti3eIO','Admin','active','2025-12-24 09:01:10','2026-08-04 08:37:40','2026-08-04 08:37:40'),(6,'Cordinator',NULL,'$2b$10$.P62nC0mluUeRrZWMkkOAeEHnuLMTP.3qBM3lUscMQE1smeFNLgmC','Cashier','active','2026-02-12 08:37:49','2026-07-23 04:20:59','2026-07-23 04:20:59'),(7,'Saman',NULL,'$2b$10$F4D1P4FwemLFRsWlnjwZteZC.wf.Xvq6cRidUp2NV8rS7N1oMS/ga','Admin','active','2026-02-13 04:10:32','2026-02-13 04:13:03','2026-02-13 04:13:03'),(8,'Tharaka',NULL,'$2b$10$QKbJHasTkxLKERHLJkQmj.XjAZBYAZJgvVOIgr2WuIUiYKtyRgVMq','Admin','active','2026-07-16 04:22:28','2026-08-03 17:05:44','2026-08-03 17:05:44');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `delivery_notes`
--

DROP TABLE IF EXISTS `delivery_notes`;
CREATE TABLE `delivery_notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `delivery_number` varchar(50) NOT NULL UNIQUE,
  `sale_id` int NOT NULL,
  `delivery_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('Pending','Shipped','Delivered','Cancelled') NOT NULL DEFAULT 'Pending',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_delivery_notes_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `delivery_note_items`
--

DROP TABLE IF EXISTS `delivery_note_items`;
CREATE TABLE `delivery_note_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `delivery_note_id` int NOT NULL,
  `item_id` int DEFAULT NULL,
  `description` text NOT NULL,
  `quantity` int NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_delivery_note_items_note` FOREIGN KEY (`delivery_note_id`) REFERENCES `delivery_notes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_delivery_note_items_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-04 14:38:56
