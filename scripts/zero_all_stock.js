import pool from '../server/config/database.js';

/**
 * Reset Stock to Zero Script
 * 
 * Sets inventory quantity to 0 across all items and locations, 
 * updates inventory batches, and creates audit records in stock_adjustments 
 * and stock_ledger.
 */
async function resetAllStockToZero() {
    console.log('⚠️  STARTING STOCK ADJUSTMENT TO ZERO FOR ALL LOCATIONS...');
    console.log('----------------------------------------------------');

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Fetch all inventory records with non-zero quantity
        const [inventoryItems] = await conn.execute(`
            SELECT i.id, i.item_id, i.location_id, i.quantity, it.name as item_name, l.name as location_name
            FROM inventory i
            LEFT JOIN items it ON i.item_id = it.id
            LEFT JOIN locations l ON i.location_id = l.id
            WHERE i.quantity != 0
        `);

        console.log(`📋 Found ${inventoryItems.length} inventory records with non-zero stock.`);

        const year = new Date().getFullYear();
        let adjCount = 0;

        for (const record of inventoryItems) {
            const currentQty = parseFloat(record.quantity);
            const targetQty = 0;
            const difference = targetQty - currentQty; // Negative if reducing

            if (difference === 0) continue;

            // Generate adjustment number
            const [lastAdj] = await conn.execute(
                `SELECT adjustment_number FROM stock_adjustments 
                 WHERE adjustment_number LIKE ? 
                 ORDER BY id DESC LIMIT 1`,
                [`ADJ-${year}-%`]
            );

            let nextNumber = 1;
            if (lastAdj && lastAdj.length > 0) {
                const lastNum = lastAdj[0].adjustment_number.split('-')[2];
                nextNumber = parseInt(lastNum, 10) + 1;
            }
            const adjustmentNumber = `ADJ-${year}-${String(nextNumber).padStart(4, '0')}`;

            // Create stock adjustment entry
            const [adjResult] = await conn.execute(`
                INSERT INTO stock_adjustments 
                (adjustment_number, item_id, adjustment_type, current_quantity, 
                 adjusted_quantity, difference, reason, status, adjusted_by, 
                 adjustment_date, uses_batch_tracking)
                VALUES (?, ?, 'subtraction', ?, ?, ?, ?, 'approved', 1, CURDATE(), FALSE)
            `, [
                adjustmentNumber,
                record.item_id,
                currentQty,
                targetQty,
                difference,
                `System wide stock zeroing for location: ${record.location_name || record.location_id}`
            ]);

            const adjustmentId = adjResult.insertId;

            // Update inventory batches for this item & location
            const [batches] = await conn.execute(`
                SELECT id, current_quantity 
                FROM inventory_batches 
                WHERE item_id = ? AND location_id = ? AND current_quantity != 0
            `, [record.item_id, record.location_id]);

            for (const batch of batches) {
                const batchQtyBefore = parseFloat(batch.current_quantity);
                const batchChange = -batchQtyBefore;

                // Update batch current_quantity to 0
                await conn.execute(`
                    UPDATE inventory_batches 
                    SET current_quantity = 0 
                    WHERE id = ?
                `, [batch.id]);

                // Record in adjustment_batch_items
                await conn.execute(`
                    INSERT INTO adjustment_batch_items (adjustment_id, batch_id, quantity_adjusted, reason)
                    VALUES (?, ?, ?, ?)
                `, [adjustmentId, batch.id, batchChange, 'Zeroing stock via system adjustment script']);
            }

            // Record in stock_ledger
            await conn.execute(`
                INSERT INTO stock_ledger 
                (item_id, transaction_type, reference_type, reference_id, 
                 quantity_before, quantity_change, quantity_after, performed_by, notes)
                VALUES (?, 'adjustment', 'Zero Stock Script', ?, ?, ?, 0, 1, ?)
            `, [
                record.item_id,
                adjustmentId,
                currentQty,
                difference,
                `Zeroed stock for ${record.item_name || 'Item #' + record.item_id} at ${record.location_name || 'Location #' + record.location_id}`
            ]);

            adjCount++;
        }

        // 2. Set ALL inventory quantities to 0 across all locations
        const [updateResult] = await conn.execute(`
            UPDATE inventory SET quantity = 0
        `);

        // 3. Set ALL batch current_quantities to 0 across all locations
        const [batchUpdateResult] = await conn.execute(`
            UPDATE inventory_batches SET current_quantity = 0
        `);

        await conn.commit();

        console.log('----------------------------------------------------');
        console.log('✅ STOCK ADJUSTMENT COMPLETE!');
        console.log(`✨ Created ${adjCount} adjustment records.`);
        console.log(`✨ Updated ${updateResult.affectedRows} inventory records to 0.`);
        console.log(`✨ Updated ${batchUpdateResult.affectedRows} batch records to 0.`);
        process.exit(0);

    } catch (error) {
        await conn.rollback();
        console.error('❌ Error during stock adjustment:', error);
        process.exit(1);
    } finally {
        conn.release();
    }
}

resetAllStockToZero();
