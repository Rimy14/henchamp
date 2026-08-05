import pool from '../server/config/database.js';
import fs from 'fs';

const items = [
    { name: 'Lights - Hard',               qty: 120,  totalCost: 1593 },
    { name: 'Lights  Normal',              qty: 60,   totalCost: 1593 },
    { name: 'Fans 6 Inch',                 qty: 90,   totalCost: 2465 },
    { name: 'Fans 8 Inch',                 qty: 80,   totalCost: 2665 },
    { name: 'Fans Double',                 qty: 60,   totalCost: 1865 },
    { name: 'Ratchet - 2000 kg',           qty: 60,   totalCost: 1017 },
    { name: 'Ratchet - 3000 kg',           qty: 50,   totalCost: 1167 },
    { name: 'Ratchet - 5000 kg',           qty: 50,   totalCost: 1317 },
    { name: '20 T Robe',                   qty: 20,   totalCost: 2921 },
    { name: '15 T Robe',                   qty: 20,   totalCost: 2771 },
    { name: '10 T Robe',                   qty: 20,   totalCost: 2271 },
    { name: '7.5 T Robe',                  qty: 25,   totalCost: 2071 },
    { name: '5 T Robe',                    qty: 25,   totalCost: 1621 },
    { name: '4 M Cable- Iron - 12 MM',     qty: 40,   totalCost: 1471 },
    { name: '4 M Cable -Iron - 10 MM',     qty: 40,   totalCost: 1271 },
    { name: 'Spring Locks',                qty: 1500, totalCost: 693  },
    { name: 'Number Plates - Small',       qty: 1350, totalCost: 176  },
    { name: 'Logo - Red/ Siver Letters',   qty: 300,  totalCost: 783  },
    { name: 'Logo- Red ( Black Plate)',    qty: 150,  totalCost: 1033 },
    { name: 'Logo- Silver ( Black Plate)', qty: 150,  totalCost: 1033 },
    { name: 'Logo -Small',                 qty: 600,  totalCost: 483  },
].map(i => ({ ...i, unitPrice: i.totalCost / i.qty }));

function cleanName(n) {
    return n.replace(/\s+/g, ' ').replace(/[\"']/g, '').trim().toLowerCase();
}

async function buildPO() {
    try {
        const [dbItems] = await pool.query('SELECT code, name FROM items WHERE status = "active"');
        const dbMap = new Map();
        dbItems.forEach(i => {
            if (i.name) dbMap.set(cleanName(i.name), i.code);
        });

        const today = new Date().toISOString().split('T')[0];
        const headers = ['po_ref','supplier_name','order_date','expected_delivery','notes','item_name','item_code','quantity','unit_price_excl_tax','tax_rate'];
        const rows = [headers.join(',')];

        let matched = 0;
        let notFound = [];

        for (const item of items) {
            const cleaned = cleanName(item.name);
            let code = dbMap.get(cleaned) || '';

            // Fallback: alphanumeric match
            if (!code) {
                const alpha = cleaned.replace(/[^a-z0-9]/g, '');
                for (const [key, val] of dbMap) {
                    if (key.replace(/[^a-z0-9]/g, '') === alpha) {
                        code = val;
                        break;
                    }
                }
            }

            if (code) matched++; else notFound.push(item.name);

            const safeName = `"${item.name.replace(/"/g, '""')}"`;
            rows.push([
                'PO-NEW',
                'DIRECT PURCHASING',
                today,
                '',
                '',
                safeName,
                code,
                item.qty,
                item.unitPrice.toFixed(2),
                '0'
            ].join(','));
        }

        const outFile = 'po_bulk_upload_new_items.csv';
        fs.writeFileSync(outFile, rows.join('\n'));

        console.log(`\n✅ Created ${outFile}`);
        console.log(`🎯 Matched ${matched} / ${items.length} items with DB codes`);
        if (notFound.length > 0) {
            console.log(`\n⚠️  Not found in DB (will be auto-created on upload):`);
            notFound.forEach(n => console.log(`   - "${n}"`));
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

buildPO();
