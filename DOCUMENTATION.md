# HenChamp POS & Customer Ordering Portal — Technical Documentation

This document provides an exhaustive technical overview of the architecture, database migrations, data seeding, customer portal features, API endpoints, and deployment guidelines for **HenChamp POS & Customer Storefront Portal**.

---

## 📑 Table of Contents
1. [System Architecture & Tech Stack](#1-system-architecture--tech-stack)
2. [Database Setup & Migration Guide](#2-database-setup--migration-guide)
3. [Data Seeding & HenChamp Service Categories](#3-data-seeding--henchamp-service-categories)
4. [Customer Portal & UI Enhancements](#4-customer-portal--ui-enhancements)
5. [API Endpoints Reference](#5-api-endpoints-reference)
6. [Deployment Guide (Linux VPS / Production)](#6-deployment-guide-linux-vps--production)

---

## 1. 🏗️ System Architecture & Tech Stack

The application is structured into two main components:
- **Admin POS & ERP Backend**: Node.js, Express, MySQL backend serving API endpoints and POS administration at `/app.html`.
- **Customer Storefront Portal**: Modern web application served at `/store.html` (and `/portal/index.html`), allowing customers to view items, filter by category, check real-time stock, and place direct orders into the ERP.

### Tech Stack Specifications:
- **Runtime & Server**: Node.js (ES Modules `"type": "module"`), Express.js
- **Database Layer**: MySQL 8.0 with `mysql2/promise` connection pooling
- **Frontend Layer**: Vanilla JavaScript, Vanilla CSS3 (Custom Design System with Glassmorphism, CSS Variables, Flex/Grid), FontAwesome 6
- **Configuration**: `dotenv` for environment management

---

## 2. 🗄️ Database Setup & Migration Guide

### 2.1 Environment Configuration (`.env`)
Ensure your `.env` file at the root of `henchamp-pos` has valid database credentials:

```env
# Server Configuration
PORT=7001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=henchamp_pos_db
DB_CONNECTION_LIMIT=10
```

### 2.2 Running Database Migrations (`scripts/run_migration.js`)
To automatically create the `henchamp_pos_db` database and import the database dump file (`database/autora_db.sql`), run:

```bash
node scripts/run_migration.js
```

#### Key Features of the Migration Script:
- Reads database configuration dynamically from `.env`.
- Uses `MYSQL_PWD` environment variable to securely hide passwords from terminal history.
- Prompts interactively for the MySQL password if empty or incorrect in `.env`.

---

## 3. 📦 Data Seeding & HenChamp Service Categories

The data seeding script (`scripts/seed_henchamp_demo_data.js`) populates authentic service categories extracted directly from [solutions.henchamp.com](https://solutions.henchamp.com/), along with suppliers, customers, items, and inventory batches.

### 3.1 Supported Categories & Code Prefixes

| Category Name | Prefix | Description |
| :--- | :--- | :--- |
| **Printing & Stationery** | `PNS` | Premium printing supplies, office stationery, and corporate branding materials |
| **Office Equipment** | `OEQ` | Modern office machinery, monitors, printers, and accessories |
| **Staff Uniforms** | `UNI` | High-quality corporate apparel, safety gear, and branded workwear |
| **Building & Engineering** | `BNE` | Construction tools, engineering supplies, and maintenance hardware |
| **Lab & Medical** | `LNM` | Medical instruments, laboratory glassware, and clinical consumables |
| **ICT Equipment** | `ICT` | Enterprise networking gear, servers, computers, and IT peripherals |
| **Security** | `SEC` | Access control systems, surveillance cameras, and security gear |
| **Interior Design** | `INT` | Office furniture, ergonomic seating, and decor solutions |
| **Painting** | `PNT` | Industrial and commercial paints, coatings, and application tools |

### 3.2 Executing the Seed Script
To reset and seed demo categories, items, and inventory batches into your database:

```bash
node scripts/seed_henchamp_demo_data.js
```

---

## 4. 🎨 Customer Portal & UI Enhancements

The customer ordering portal (`public/store.html` & `public/portal/index.html`) has been upgraded to **Premium UI v2.0**.

### 4.1 UI Highlights:
- **Glassmorphism Design System**: Tailored HSL colors (`#041710`, `#0e4a35`, `#a6ce3a`), frosted-glass backdrops, smooth transitions, and subtle hover animations.
- **Custom Accessible Category Dropdown Filter**:
  - Element ID: `#catDropdownWrapper`
  - Replaces old horizontal button pills with an accessible custom dropdown menu.
  - Dynamically switches category selection and updates live result counts.
- **Real-Time Stock Quantity Display**:
  - Each item card shows actual live stock aggregated from inventory batches (e.g., `500 In Stock` or red `Out of Stock` badge).
- **Slide-Out Cart Drawer & Express Checkout**:
  - Real-time shopping cart calculation including VAT.
  - Instant order submission creating live ERP sales records.

---

## 5. 🔌 API Endpoints Reference

### Public Customer Storefront API

#### `GET /api/config/public-items`
Fetches all active items for the storefront along with category names and aggregated stock quantities.

**Sample SQL Query:**
```sql
SELECT i.id, i.code, i.name, i.description, i.selling_price, i.reorder_level, i.status,
       c.name as category_name, c.code_prefix,
       (SELECT COALESCE(SUM(quantity), 0) FROM inventory WHERE item_id = i.id) as stock_quantity
FROM items i
LEFT JOIN categories c ON i.category_id = c.id
WHERE i.status = 'active'
ORDER BY i.id ASC;
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "code": "PNS-0001",
      "name": "Premium Office Copier Paper A4 (Box of 5)",
      "description": "High-quality 80gsm white printing paper for all office needs.",
      "selling_price": "4060.00",
      "category_name": "Printing & Stationery",
      "code_prefix": "PNS",
      "stock_quantity": 500
    }
  ]
}
```

---

## 6. 🚀 Deployment Guide (Linux VPS / Production)

Follow these steps to deploy and run the database & portal on a Linux VPS (e.g., Ubuntu/Debian/CentOS):

### Step 1: Clone & Install Dependencies
```bash
git clone <your-repository-url>
cd henchamp-pos
npm install
```

### Step 2: Configure `.env`
```bash
cp .env.example .env
nano .env
# Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
```

### Step 3: Run Database Migration
```bash
node scripts/run_migration.js
```

### Step 4: Seed Service Categories & Products
```bash
node scripts/seed_henchamp_demo_data.js
```

### Step 5: Start Dev / Production Server
```bash
# For development:
npm run dev

# For production (using PM2):
npm install -g pm2
pm2 start server/index.js --name "henchamp-pos"
```

Access your customer portal in browser at: `http://<your-server-ip>:7001/store.html`
