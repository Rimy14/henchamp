import ExcelJS from 'exceljs';
import pool from '../server/config/database.js';
import fs from 'fs';

async function parseSithuruyaExcel() {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile('Autora_Sithuruya_Purchase_Report_.xlsx');
        
        const dataSheet = workbook.getWorksheet('Data');
        console.log(`Processing "Data" sheet (Total rows: ${dataSheet.rowCount})...`);

        // Fetch DB items lookup to pre-fill item_code if item exists in DB
        let dbItems = [];
        try {
            [dbItems] = await pool.query('SELECT code, name FROM items');
        } catch (e) {
            console.log('Database query omitted or unavailable, proceeding with CSV generation.');
        }

        const itemCodeMap = new Map();
        dbItems.forEach(i => {
            if (i.name) itemCodeMap.set(i.name.trim().toLowerCase(), i.code);
        });

        const poHeaders = ['po_ref', 'supplier_name', 'order_date', 'expected_delivery', 'notes', 'item_name', 'item_code', 'quantity', 'unit_price_excl_tax', 'tax_rate'];
        const itemHeaders = ['name', 'description', 'category_name', 'unit_of_measure', 'selling_price_excl_tax', 'tax_rate', 'tax_type', 'reorder_level', 'supplier_name', 'barcode'];

        const poRows = [poHeaders.join(',')];
        const itemRows = [itemHeaders.join(',')];

        let validCount = 0;
        let matchedItemCodes = 0;
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
            if (rowNumber < 5) return; // Skip title and headers (row 4 is header)

            const dateVal = getCellValue(row.getCell(1));      // Col 1: Date
            const itemNameVal = getCellValue(row.getCell(2));  // Col 2: Item Name
            const unitPriceVal = getCellValue(row.getCell(3)); // Col 3: Unit Price (Cost Price)
            const quantityVal = getCellValue(row.getCell(4));  // Col 4: Quantity

            if (!itemNameVal) return;

            const itemName = String(itemNameVal).trim();
            if (!itemName || itemName === 'BUFFER' || itemName.toLowerCase().includes('total')) return;

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

            const dbCode = itemCodeMap.get(itemName.toLowerCase()) || '';
            if (dbCode) matchedItemCodes++;

            // PO Row (Unit Price from Excel mapped as unit_price_excl_tax / cost price)
            const poRow = [
                'PO-SITHURUYA',
                'Sithuriya Spare Parts',
                dateStr,
                '',
                'Purchases from Sithuriya Spare Parts',
                `"${itemName.replace(/"/g, '""')}"`,
                dbCode,
                quantity > 0 ? quantity : 1,
                unitPrice.toFixed(2),
                '0'
            ];
            poRows.push(poRow.join(','));

            // Item Row (Unit Price from Excel mapped as selling_price_excl_tax / cost price)
            const itemRow = [
                `"${itemName.replace(/"/g, '""')}"`,
                `Sourced from Sithuriya Spare Parts on ${dateStr}`,
                'Auto Parts',
                'Piece',
                unitPrice.toFixed(2),
                '0',
                'exclusive',
                '5',
                'Sithuriya Spare Parts',
                ''
            ];
            itemRows.push(itemRow.join(','));
        });

        fs.writeFileSync('po_bulk_upload_sithuruya.csv', poRows.join('\n'));
        fs.writeFileSync('items_bulk_upload_sithuruya.csv', itemRows.join('\n'));

        console.log(`✅ Successfully extracted ${validCount} purchase line items!`);
        console.log(`🎯 DB Item Code Matches: ${matchedItemCodes} items matched`);
        console.log(`📦 Total Quantity Sourced: ${totalQty.toLocaleString('en-US')} units`);
        console.log(`💰 Total Purchase Spend: LKR ${totalCost.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        console.log(`📁 Saved: po_bulk_upload_sithuruya.csv & items_bulk_upload_sithuruya.csv`);

        process.exit(0);
    } catch (err) {
        console.error('Error parsing Excel:', err);
        process.exit(1);
    }
}

parseSithuruyaExcel();
