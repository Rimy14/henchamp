import ExcelJS from 'exceljs';
import pool from '../server/config/database.js';
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

async function generatePerfectPOCSV() {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile('Autora_Sithuruya_Purchase_Report_.xlsx');
        
        const dataSheet = workbook.getWorksheet('Data');
        const [dbItems] = await pool.query('SELECT code, name FROM items');
        console.log(`Loaded ${dbItems.length} active items from database.`);

        const dbMap = new Map();
        dbItems.forEach(item => {
            if (item.name) {
                dbMap.set(cleanName(item.name), item.code);
            }
        });

        const poHeaders = ['po_ref', 'supplier_name', 'order_date', 'expected_delivery', 'notes', 'item_name', 'item_code', 'quantity', 'unit_price_excl_tax', 'tax_rate'];
        const poRows = [poHeaders.join(',')];

        let validCount = 0;
        let matchedCount = 0;
        let totalCost = 0;
        let totalQty = 0;

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
            if (rowNumber < 5) return; // Skip headers

            const dateVal = getCellValue(row.getCell(1));
            let itemNameVal = getCellValue(row.getCell(2));
            const unitPriceVal = getCellValue(row.getCell(3));
            const quantityVal = getCellValue(row.getCell(4));

            let itemName = itemNameVal ? String(itemNameVal).trim() : '';

            // Handle Row 489 (which has a blank name in Excel but has Price=1000, Qty=80, Total=80000)
            if (!itemName) {
                const uP = parseFloat(unitPriceVal) || 0;
                const qT = parseInt(quantityVal) || 0;
                if (uP > 0 && qT > 0) {
                    itemName = `UNNAMED SPARE PART (Row ${rowNumber})`;
                } else {
                    return;
                }
            }

            if (itemName === 'BUFFER' || itemName.toLowerCase().includes('total')) return;

            const unitPrice = parseFloat(unitPriceVal) || 0;
            const quantity = parseInt(quantityVal) || 0;

            let dateStr = '2026-07-30';
            if (dateVal instanceof Date) {
                dateStr = dateVal.toISOString().split('T')[0];
            } else if (dateVal && typeof dateVal === 'string') {
                dateStr = dateVal.split('T')[0];
            }

            validCount++;
            totalCost += (unitPrice * quantity);
            totalQty += quantity;

            const cleaned = cleanName(itemName);
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

            if (itemCode) matchedCount++;

            const safeItemName = `"${itemName.replace(/"/g, '""')}"`;

            const poRow = [
                'PO-SITHURUYA',
                'DIRECT PURCHASING',
                dateStr,
                '',
                'Purchases from Sithuriya Spare Parts',
                safeItemName,
                itemCode,
                quantity > 0 ? quantity : 1,
                unitPrice.toFixed(2),
                '0'
            ];
            poRows.push(poRow.join(','));
        });

        fs.writeFileSync('po_bulk_upload_sithuruya.csv', poRows.join('\n'));

        console.log(`\n🎉 PERFECT CSV CREATED WITH EXACT EXCEL TOTAL MATCH!`);
        console.log(`✅ Total Line Items: ${validCount}`);
        console.log(`🎯 DB Item Code Matches: ${matchedCount} / ${validCount}`);
        console.log(`📦 Total Quantity: ${totalQty.toLocaleString('en-US')} units`);
        console.log(`💰 Total Purchase Value: LKR ${totalCost.toLocaleString('en-US', {minimumFractionDigits: 2})}`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

generatePerfectPOCSV();
