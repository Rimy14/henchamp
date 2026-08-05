import pool from '../server/config/database.js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

async function executeSplit() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    console.log('🚀 Starting PO Split process...');

    // 1. Ensure supplier 'Sithuruya' exists
    let [suppliers] = await conn.query('SELECT id, name FROM suppliers WHERE name = ?', ['Sithuruya']);
    let sithuruyaId;
    if (suppliers.length === 0) {
      const [res] = await conn.query('INSERT INTO suppliers (code, name, credit_limit) VALUES (?, ?, ?)', ['SUP-SITHURUYA', 'Sithuruya', 0.00]);
      sithuruyaId = res.insertId;
      console.log(`✅ Created Supplier 'Sithuruya' with ID: ${sithuruyaId}`);
    } else {
      sithuruyaId = suppliers[0].id;
      console.log(`✅ Found Supplier 'Sithuruya' with ID: ${sithuruyaId}`);
    }

    // 2. Fetch original PO-2026-0006
    const [pos] = await conn.query('SELECT * FROM purchase_orders WHERE po_number = ?', ['PO-2026-0006']);
    if (pos.length === 0) {
      throw new Error('PO-2026-0006 not found in database');
    }
    const origPO = pos[0];
    console.log(`✅ Found PO-2026-0006 (ID: ${origPO.id}, Current Total: ${origPO.total_amount})`);

    // 3. Determine next available PO number
    const [lastPoRes] = await conn.query("SELECT po_number FROM purchase_orders WHERE po_number LIKE 'PO-2026-%' ORDER BY id DESC LIMIT 1");
    let nextPoNumber = 'PO-2026-0010';
    if (lastPoRes.length > 0) {
      const num = parseInt(lastPoRes[0].po_number.split('-')[2]) + 1;
      nextPoNumber = `PO-2026-${String(num).padStart(4, '0')}`;
    }
    console.log(`✅ Next PO Number: ${nextPoNumber}`);

    // 4. Fetch all po_items for PO-2026-0006 ordered by ID
    const [poItems] = await conn.query('SELECT * FROM po_items WHERE po_id = ? ORDER BY id ASC', [origPO.id]);
    console.log(`✅ Found ${poItems.length} items in PO-2026-0006`);

    // Split at index 109 (Items 1 to 109 -> PO1 (Sithuruya), Items 110 to 506 -> PO2 (Direct Purchasing))
    const po1Items = poItems.slice(0, 109);
    const po2Items = poItems.slice(109);

    const po1Total = po1Items.reduce((acc, it) => acc + Number(it.total_price || (it.unit_price * it.quantity)), 0);
    const po2Total = po2Items.reduce((acc, it) => acc + Number(it.total_price || (it.unit_price * it.quantity)), 0);

    console.log(`📊 PO-2026-0006 (Sithuruya): ${po1Items.length} items, Total: LKR ${po1Total.toLocaleString()}`);
    console.log(`📊 ${nextPoNumber} (Direct Purchasing): ${po2Items.length} items, Total: LKR ${po2Total.toLocaleString()}`);

    // 5. Update PO-2026-0006 to supplier Sithuruya and new total
    await conn.query(`
      UPDATE purchase_orders 
      SET supplier_id = ?, subtotal = ?, total_amount = ?, notes = 'Purchases from Sithuriya Spare Parts' 
      WHERE id = ?
    `, [sithuruyaId, po1Total, po1Total, origPO.id]);
    console.log(`✅ Updated PO-2026-0006 supplier to Sithuruya (ID ${sithuruyaId}) and total to ${po1Total}`);

    // 6. Create new PO (e.g. PO-2026-0010) for DIRECT PURCHASING (supplier_id = 1)
    const [po2Result] = await conn.query(`
      INSERT INTO purchase_orders 
      (po_number, supplier_id, order_date, expected_delivery, due_date, status, subtotal, tax_amount, discount_amount, total_amount, notes, created_by, payment_status, paid_amount)
      VALUES (?, 1, ?, ?, ?, 'Received', ?, 0.00, 0.00, ?, 'Purchases from Sithuriya Spare Parts (Direct Purchasing)', ?, 'unpaid', 0.00)
    `, [
      nextPoNumber, origPO.order_date, origPO.expected_delivery, origPO.due_date,
      po2Total, po2Total, origPO.created_by
    ]);
    const newPoId = po2Result.insertId;
    console.log(`✅ Created ${nextPoNumber} (ID: ${newPoId}) for DIRECT PURCHASING with total ${po2Total}`);

    // 7. Move po2Items to newPoId in po_items
    const po2ItemIds = po2Items.map(it => it.id);
    await conn.query(`UPDATE po_items SET po_id = ? WHERE id IN (?)`, [newPoId, po2ItemIds]);
    console.log(`✅ Reassigned ${po2ItemIds.length} items to ${nextPoNumber}`);

    // 8. Update GRN if exists
    const [grns] = await conn.query('SELECT * FROM grn WHERE po_id = ?', [origPO.id]);
    if (grns.length > 0) {
      const origGrn = grns[0];

      // Determine next available GRN number
      const [lastGrnRes] = await conn.query("SELECT grn_number FROM grn WHERE grn_number LIKE 'GRN-2026-%' ORDER BY id DESC LIMIT 1");
      let nextGrnNumber = 'GRN-2026-0003';
      if (lastGrnRes.length > 0) {
        const num = parseInt(lastGrnRes[0].grn_number.split('-')[2]) + 1;
        nextGrnNumber = `GRN-2026-${String(num).padStart(4, '0')}`;
      }

      // Create GRN for nextPoNumber
      const [grn2Result] = await conn.query(`
        INSERT INTO grn (grn_number, po_id, received_date, receiver_id, notes, status)
        VALUES (?, ?, ?, ?, 'Auto-created during PO split', 'approved')
      `, [nextGrnNumber, newPoId, origGrn.received_date, origGrn.receiver_id]);
      const newGrnId = grn2Result.insertId;

      // Reassign grn_items for items in po2Items
      const po2ItemCatalogIds = po2Items.map(it => it.item_id);
      await conn.query(`UPDATE grn_items SET grn_id = ? WHERE grn_id = ? AND item_id IN (?)`, [newGrnId, origGrn.id, po2ItemCatalogIds]);
      console.log(`✅ Created ${nextGrnNumber} (ID: ${newGrnId}) for ${nextPoNumber} and split GRN items`);
    }

    await conn.commit();
    console.log('🎉 Database split successfully completed!');

    // 9. Update po_bulk_upload_sithuruya.csv
    const csvPath = 'po_bulk_upload_sithuruya.csv';
    const csvLines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
    const header = csvLines[0];
    const dataLines = csvLines.slice(1);

    const updatedLines = [header];
    dataLines.forEach((line, idx) => {
      if (idx < 109) {
        // PO-2026-0006 / Sithuruya
        const updated = line.replace(/^PO-[^,]+,[^,]+,/, 'PO-2026-0006,Sithuruya,');
        updatedLines.push(updated);
      } else {
        // nextPoNumber / DIRECT PURCHASING
        const updated = line.replace(/^PO-[^,]+,[^,]+,/, `${nextPoNumber},DIRECT PURCHASING,`);
        updatedLines.push(updated);
      }
    });

    fs.writeFileSync(csvPath, updatedLines.join('\n'));
    console.log(`✅ Updated ${csvPath} with updated suppliers and PO numbers (109 items Sithuruya, 397 items DIRECT PURCHASING)`);

    process.exit(0);
  } catch (err) {
    await conn.rollback();
    console.error('❌ Error executing split:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

executeSplit();
