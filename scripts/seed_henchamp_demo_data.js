import pool from '../server/config/database.js';

/**
 * Seed Script for HenChamp Solutions (solutions.henchamp.com)
 * Inserts authentic categories, suppliers, items, and inventory batches.
 */

async function seedData() {
    console.log('🚀 Starting HenChamp Solutions Data Seeding...');
    console.log('----------------------------------------------------');

    try {
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');

        await pool.query('TRUNCATE TABLE items');
        await pool.query('TRUNCATE TABLE categories');
        await pool.query('TRUNCATE TABLE suppliers');
        await pool.query('TRUNCATE TABLE customers');
        await pool.query('TRUNCATE TABLE inventory_batches');
        await pool.query('TRUNCATE TABLE inventory');

        // 1. Insert Categories
        console.log('📦 Seeding Categories...');
        const categories = [
            { name: 'Printing & Stationery', prefix: 'PNS', desc: 'Premium printing supplies, office stationery, and corporate branding materials.' },
            { name: 'Office Equipment', prefix: 'OEQ', desc: 'Modern office machinery, monitors, printers, and accessories.' },
            { name: 'Staff Uniforms', prefix: 'UNI', desc: 'High-quality corporate apparel, safety gear, and branded workwear.' },
            { name: 'Building & Engineering', prefix: 'BNE', desc: 'Construction tools, engineering supplies, and maintenance hardware.' },
            { name: 'Lab & Medical', prefix: 'LNM', desc: 'Medical instruments, laboratory glassware, and clinical consumables.' },
            { name: 'ICT Equipment', prefix: 'ICT', desc: 'Enterprise networking gear, servers, computers, and IT peripherals.' },
            { name: 'Security', prefix: 'SEC', desc: 'Access control systems, surveillance cameras, and security gear.' },
            { name: 'Interior Design', prefix: 'INT', desc: 'Office furniture, ergonomic seating, and decor solutions.' },
            { name: 'Painting', prefix: 'PNT', desc: 'Industrial and commercial paints, coatings, and application tools.' }
        ];

        const catIds = {};
        for (const cat of categories) {
            const [res] = await pool.query(
                `INSERT INTO categories (name, code_prefix, description, status, type) VALUES (?, ?, ?, 'active', 'Finished Goods')`,
                [cat.name, cat.prefix, cat.desc]
            );
            catIds[cat.prefix] = res.insertId;
        }


        // 2. Insert Suppliers
        console.log('🏭 Seeding Suppliers...');
        const suppliers = [
            { code: 'SUP-001', name: 'HenChamp Supply Hub Kenya', contact: 'Sales Desk', phone: '+254 700 123 456', email: 'orders@henchamp.com', city: 'Nairobi', country: 'Kenya' },
            { code: 'SUP-002', name: 'Global Packtech Industries', contact: 'Michael Chen', phone: '+254 722 987 654', email: 'sales@packtech.co.ke', city: 'Mombasa', country: 'Kenya' },
            { code: 'SUP-003', name: 'Media Print & Paper Ltd', contact: 'Sarah Omondi', phone: '+254 733 456 789', email: 'info@mediaprint.co.ke', city: 'Nairobi', country: 'Kenya' }
        ];

        const supIds = {};
        for (const sup of suppliers) {
            const [res] = await pool.query(
                `INSERT INTO suppliers (code, name, contact_person, phone, email, city, country, credit_limit, status) VALUES (?, ?, ?, ?, ?, ?, ?, 100000.00, 'active')`,
                [sup.code, sup.name, sup.contact, sup.phone, sup.email, sup.city, sup.country]
            );
            supIds[sup.code] = res.insertId;
        }

        // 3. Insert Customers (including Default Walk-in / Online Customer)
        console.log('👤 Seeding Customers...');
        const customers = [
            { code: 'CUST-001', name: 'Online / Walk-in Customer', email: 'online@solutions.henchamp.com', phone: '+254 700 000 000', city: 'Nairobi', company: 'PRINTHUB' },
            { code: 'CUST-002', name: 'Nairobi Freight Center Ltd', email: 'orders@nairobigroup.co.ke', phone: '+254 712 345 678', city: 'Nairobi', company: 'PRINTHUB' },
            { code: 'CUST-003', name: 'Kenya Logistics Hub Ltd', email: 'purchasing@kenyalogistics.co.ke', phone: '+254 722 111 222', city: 'Mombasa', company: 'PRINTHUB' }
        ];

        for (const cust of customers) {
            await pool.query(
                `INSERT INTO customers (customer_code, name, email, phone, city, company, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
                [cust.code, cust.name, cust.email, cust.phone, cust.city, cust.company]
            );
        }



        // Fetch default UOM ID (e.g. Box, Roll, Unit, Pack, CBM)
        const [uoms] = await pool.query(`SELECT id, name FROM units_of_measure LIMIT 5`);
        const defaultUomId = uoms.length > 0 ? uoms[0].id : 1;


        // 3. Insert HenChamp Solutions Items
        console.log('🏷️ Seeding HenChamp Products & Services...');
        const items = [
            {
                code: 'PNS-0001',
                name: 'Premium Office Copier Paper A4 (Box of 5)',
                desc: 'High-quality 80gsm white printing paper for all office needs.',
                catPrefix: 'PNS',
                priceExcl: 3500.00,
                priceIncl: 4060.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 50,
                supCode: 'SUP-003',
                initialQty: 500,
                unitCost: 2800.00
            },
            {
                code: 'OEQ-0001',
                name: 'Enterprise LaserJet Pro Multifunction Printer',
                desc: 'High-speed wireless duplex office printer and scanner.',
                catPrefix: 'OEQ',
                priceExcl: 45000.00,
                priceIncl: 52200.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 5,
                supCode: 'SUP-002',
                initialQty: 15,
                unitCost: 38000.00
            },
            {
                code: 'UNI-0001',
                name: 'Corporate Executive Polo Shirts (Pack of 10)',
                desc: 'Custom branded cotton polo shirts for staff uniform.',
                catPrefix: 'UNI',
                priceExcl: 12000.00,
                priceIncl: 13920.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 10,
                supCode: 'SUP-001',
                initialQty: 50,
                unitCost: 8500.00
            },
            {
                code: 'BNE-0001',
                name: 'Industrial Power Drill Kit 18V',
                desc: 'Heavy-duty cordless drill for construction and engineering projects.',
                catPrefix: 'BNE',
                priceExcl: 25000.00,
                priceIncl: 29000.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 8,
                supCode: 'SUP-002',
                initialQty: 25,
                unitCost: 18000.00
            },
            {
                code: 'LNM-0001',
                name: 'Clinical Digital Thermometers (Pack of 20)',
                desc: 'Precision non-contact infrared thermometers for medical use.',
                catPrefix: 'LNM',
                priceExcl: 30000.00,
                priceIncl: 34800.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 10,
                supCode: 'SUP-001',
                initialQty: 40,
                unitCost: 22000.00
            },
            {
                code: 'ICT-0001',
                name: 'Business Class Core i7 Laptop 16GB RAM',
                desc: 'High-performance laptop for enterprise computing needs.',
                catPrefix: 'ICT',
                priceExcl: 120000.00,
                priceIncl: 139200.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 5,
                supCode: 'SUP-001',
                initialQty: 20,
                unitCost: 95000.00
            },
            {
                code: 'SEC-0001',
                name: 'CCTV Surveillance Camera System 4CH HD',
                desc: 'Complete security system with 4 cameras and 1TB NVR.',
                catPrefix: 'SEC',
                priceExcl: 35000.00,
                priceIncl: 40600.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 12,
                supCode: 'SUP-002',
                initialQty: 30,
                unitCost: 26000.00
            },
            {
                code: 'INT-0001',
                name: 'Ergonomic Executive Mesh Office Chair',
                desc: 'Premium adjustable office chair with lumbar support.',
                catPrefix: 'INT',
                priceExcl: 18000.00,
                priceIncl: 20880.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 15,
                supCode: 'SUP-001',
                initialQty: 40,
                unitCost: 12500.00
            },
            {
                code: 'PNT-0001',
                name: 'Commercial Grade Emulsion Paint 20L White',
                desc: 'High-coverage interior and exterior paint for commercial buildings.',
                catPrefix: 'PNT',
                priceExcl: 8500.00,
                priceIncl: 9860.00,
                taxRate: 16.00,
                taxType: 'exclusive',
                reorder: 20,
                supCode: 'SUP-002',
                initialQty: 60,
                unitCost: 6000.00
            }
        ];

        const today = new Date().toISOString().split('T')[0];

        for (const item of items) {
            const catId = catIds[item.catPrefix];
            const supId = supIds[item.supCode];

            // Insert Item matching DB schema
            const [itemRes] = await pool.query(
                `INSERT INTO items 
                (code, barcode, name, description, category_id, supplier_id, unit_of_measure, selling_price, reorder_level, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
                [
                    item.code, item.code, item.name, item.desc, catId, supId,
                    'PCS', item.priceIncl, item.reorder
                ]
            );

            const itemId = itemRes.insertId;

            // Seed Batch in inventory_batches
            const batchNo = `BATCH-${item.code}-001`;
            await pool.query(
                `INSERT INTO inventory_batches 
                (batch_number, item_id, initial_quantity, current_quantity, cost_per_unit, received_date, quality_status)
                VALUES (?, ?, ?, ?, ?, ?, 'accepted')`,
                [batchNo, itemId, item.initialQty, item.initialQty, item.unitCost, today]
            );


            // Seed inventory table for Shop location (location_id = 1) and Warehouse (location_id = 2)
            await pool.query(
                `INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, 1, ?)
                 ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
                [itemId, item.initialQty]
            );

            await pool.query(
                `INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, 2, ?)
                 ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
                [itemId, item.initialQty]
            );


            console.log(`  ✓ Item: ${item.name} (${item.initialQty} units in batch ${batchNo})`);
        }


        await pool.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('----------------------------------------------------');
        console.log('✅ HENCHAMP SOLUTIONS DEMO DATA SEEDED SUCCESSFULLY!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Error seeding HenChamp demo data:', err);
        process.exit(1);
    }
}

seedData();
