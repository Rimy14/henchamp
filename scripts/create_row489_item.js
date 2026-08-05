import pool from '../server/config/database.js';
import ExcelJS from 'exceljs';
import fs from 'fs';

function cleanName(name) {
    if (!name) return '';
    return name
        .replace(/^"|"$/g, '')
        .replace(/[\"']/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

async function createRow489AndRegenerateCSV() {
    try {
        const itemName = 'UNNAMED SPARE PART (Row 489)';

        // Find or create category
        let [categories] = await pool.query("SELECT id FROM categories WHERE name = 'Auto Parts' OR status = 'active' LIMIT 1");
        let catId = categories[0]?.id || 66;

        let code = '';
        const [existing] = await pool.query('SELECT id, code FROM items WHERE name = ?', [itemName]);
        if (existing.length > 0) {
            code = existing[0].code;
            console.log(`ℹ️ Item "${itemName}" already exists in DB with code: ${code}`);
        } else {
            const [lastItem] = await pool.query("SELECT code FROM items WHERE code LIKE 'ITEM-%' ORDER BY id DESC LIMIT 1");
            let nextNum = 1;
            if (lastItem.length > 0 && lastItem[0].code) {
                const match = lastItem[0].code.match(/ITEM-(\d+)$/i);
                if (match) nextNum = parseInt(match[1]) + 1;
            }
            code = `ITEM-${String(nextNum).padStart(4, '0')}`;

            const [res] = await pool.query(
                `INSERT INTO items (
                    code, name, description, category_id, unit_of_measure, 
                    selling_price, tax_rate, tax_type, selling_price_excl_tax, selling_price_incl_tax, 
                    reorder_level, status
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 'exclusive', ?, ?, 5, 'active')`,
                [
                    code, itemName, 'Created for Row 489 in Sithuruya Purchase Report', catId, 'Piece',
                    1000.00, 1000.00, 1000.00
                ]
            );
            console.log(`✅ Created "${itemName}" in DB -> ID: ${res.insertId}, Code: ${code}`);
        }

        // Now regenerate po_bulk_upload_sithuruya.csv with 100% matched codes
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile('Autora_Sithuruya_Purchase_Report_.xlsx');
        const dataSheet = workbook.getWorksheet('Data');

        const [dbItems] = await pool.query('SELECT code, name FROM items');
        const dbMap = new Map();
        dbItems.forEach(item => {
            if (item.name) dbMap.set(cleanName(item.name), item.code);
        });

        const poHeaders = ['po_ref', 'supplier_name', 'order_date', 'expected_delivery', 'notes', 'item_name', 'item_code', 'quantity', 'unit_price_excl_tax', 'tax_rate'];
        const poRows = [poHeaders.join(',')];

        let matched = 0;
        let valid = 0;

        function getCellValue(cell) {
            if (!cell || cell.value === null || cell.value === undefined) return null;
            if (typeof cell.value === 'object') {
                if (cell.value.result !== undefined) return cell.value.result;
                if (cell.value.text !== undefined) return cell.value.text;
                if (cell.value.richText) return cell.value.richText.map(t => t.text).join('');
            }
            return cell.value;
        }

        dataSheet.eachRow((row, rowNumber) => {
            if (rowNumber < 5) return;

            const dateVal = getCellValue(row.getCell(1));
            let itemNameVal = getCellValue(row.getCell(2));
            const unitPriceVal = getCellValue(row.getCell(3));
            const quantityVal = getCellValue(row.getCell(4));

            let nameStr = itemNameVal ? String(itemNameVal).trim() : '';

            if (!nameStr) {
                const uP = parseFloat(unitPriceVal) || 0;
                const qT = parseInt(quantityVal) || 0;
                if (uP > 0 && qT > 0) {
                    nameStr = itemName; // Use created DB item name
                } else {
                    return;
                }
            }

            if (nameStr === 'BUFFER' || nameStr.toLowerCase().includes('total')) return;

            const unitPrice = parseFloat(unitPriceVal) || 0;
            const quantity = parseInt(quantityVal) || 0;

            let dateStr = '2026-07-30';
            if (dateVal instanceof Date) {
                dateStr = dateVal.toISOString().split('T')[0];
            } else if (dateVal && typeof dateVal === 'string') {
                dateStr = dateVal.split('T')[0];
            }

            valid++;

            const cleaned = cleanName(nameStr);
            let itemCode = dbMap.get(cleaned) || '';

            if (!itemCode) {
                for (const item of dbItems) {
                    const dbClean = cleanName(item.name);
                    if (cleaned.replace(/[^a-z0-9]/g, '') === dbClean.replace(/[^a-z0-9]/g, '')) {
                        itemCode = item.code;
                        break;
                    }
                }
            }

            if (itemCode) matched++;

            const safeName = `"${nameStr.replace(/"/g, '""')}"`;

            const poRow = [
                'PO-SITHURUYA',
                'DIRECT PURCHASING',
                dateStr,
                '',
                'Purchases from Sithuriya Spare Parts',
                safeName,
                itemCode,
                quantity > 0 ? quantity : 1,
                unitPrice.toFixed(2),
                '0'
            ];
            poRows.push(poRow.join(','));
        });

        fs.writeFileSync('po_bulk_upload_sithuruya.csv', poRows.join('\n'));

        console.log(`\n🎉 CSV regenerated! Matched ${matched} / ${valid} items with DB codes.`);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

createRow489AndRegenerateCSV();
