import pool from '../server/config/database.js';
import fs from 'fs';

async function exportDirectPurchasingPO() {
    try {
        const [items] = await pool.query('SELECT code, name, selling_price_excl_tax, tax_rate FROM items WHERE status = "active" ORDER BY id ASC');
        console.log(`Found ${items.length} active items in database.`);

        const headers = ['po_ref', 'supplier_name', 'order_date', 'expected_delivery', 'notes', 'item_name', 'item_code', 'quantity', 'unit_price_excl_tax', 'tax_rate'];
        const todayStr = new Date().toISOString().split('T')[0];

        const rows = [headers.join(',')];

        items.forEach((item, index) => {
            const row = [
                'PO-002',
                'DIRECT PURCHASING',
                todayStr,
                '',
                'Direct Purchasing Order',
                `"${item.name.replace(/"/g, '""')}"`,
                item.code || '',
                '1', // default quantity 1
                item.selling_price_excl_tax !== null && item.selling_price_excl_tax !== undefined ? item.selling_price_excl_tax : '0.00',
                item.tax_rate !== null && item.tax_rate !== undefined ? item.tax_rate : '0'
            ];
            rows.push(row.join(','));
        });

        const csvContent = rows.join('\n');
        fs.writeFileSync('po_bulk_upload_direct_purchasing.csv', csvContent);
        console.log(`🎉 Created po_bulk_upload_direct_purchasing.csv with ${items.length} items!`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating direct purchasing PO CSV:', error);
        process.exit(1);
    }
}

exportDirectPurchasingPO();
