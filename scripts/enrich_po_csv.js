import pool from '../server/config/database.js';
import fs from 'fs';

async function enrichPOFile() {
    try {
        const [dbItems] = await pool.query('SELECT i.code, i.name, s.name as supplier_name FROM items i LEFT JOIN suppliers s ON i.supplier_id = s.id');
        console.log(`Found ${dbItems.length} active items in database.`);
        
        const itemMap = new Map();
        dbItems.forEach(item => {
            if (item.name) itemMap.set(item.name.trim().toLowerCase(), item);
        });

        const csvContent = fs.readFileSync('po_bulk_upload.csv', 'utf8');
        const lines = csvContent.split('\n').filter(Boolean);
        const headers = lines[0];
        const newRows = [headers];

        let matchedCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            // po_ref,supplier_name,order_date,expected_delivery,notes,item_name,item_code,quantity,unit_price_excl_tax,tax_rate
            const itemName = parts[5].replace(/^"|"$/g, '').trim();
            const dbItem = itemMap.get(itemName.toLowerCase());

            if (dbItem) {
                matchedCount++;
                parts[1] = parts[1] || dbItem.supplier_name || '';
                parts[6] = dbItem.code || '';
                console.log(`✅ Line ${i + 1}: Matched "${itemName}" -> Code: ${dbItem.code}`);
            } else {
                console.log(`ℹ️ Line ${i + 1}: Item "${itemName}" not in DB yet (will match by item_name during import)`);
            }
            newRows.push(parts.join(','));
        }

        fs.writeFileSync('po_bulk_upload.csv', newRows.join('\n'));
        console.log(`🎉 po_bulk_upload.csv updated (${matchedCount} items matched with DB item codes)!`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error enriching PO CSV:', error);
        process.exit(1);
    }
}

enrichPOFile();
