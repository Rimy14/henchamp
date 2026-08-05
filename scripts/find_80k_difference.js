import ExcelJS from 'exceljs';
import fs from 'fs';

async function audit80kDifference() {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile('Autora_Sithuruya_Purchase_Report_.xlsx');
        
        const dataSheet = workbook.getWorksheet('Data');
        console.log(`Auditing "Data" sheet (Rows: ${dataSheet.rowCount})...`);

        let excelFormulaSum = 0;
        let scriptCalculatedSum = 0;
        let skippedRows = [];
        let rowDiffs = [];

        function getVal(cell) {
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

            const dateVal = getVal(row.getCell(1));
            const itemNameVal = getVal(row.getCell(2));
            const unitPriceVal = getVal(row.getCell(3));
            const quantityVal = getVal(row.getCell(4));
            const totalAmountVal = getVal(row.getCell(5)); // Formula total cell

            const itemName = itemNameVal ? String(itemNameVal).trim() : '';
            const unitPrice = parseFloat(unitPriceVal) || 0;
            const quantity = parseInt(quantityVal) || 0;
            const rowTotalExcel = parseFloat(totalAmountVal) || 0;
            const rowTotalCalc = unitPrice * quantity;

            // Check if Excel formula total differs from UnitPrice * Qty
            if (Math.abs(rowTotalExcel - rowTotalCalc) > 0.01) {
                rowDiffs.push({
                    rowNumber,
                    itemName,
                    unitPrice,
                    quantity,
                    rowTotalExcel,
                    rowTotalCalc,
                    diff: rowTotalExcel - rowTotalCalc
                });
            }

            if (!itemName || itemName === 'BUFFER' || itemName.toLowerCase().includes('total')) {
                if (rowTotalExcel > 0 || rowTotalCalc > 0) {
                    skippedRows.push({
                        rowNumber,
                        itemName: itemName || '(Empty Name)',
                        unitPrice,
                        quantity,
                        rowTotalExcel,
                        rowTotalCalc
                    });
                }
                return;
            }

            excelFormulaSum += rowTotalExcel;
            scriptCalculatedSum += rowTotalCalc;
        });

        console.log(`\n=== AUDIT RESULTS ===`);
        console.log(`Total from Excel Row Totals: LKR ${excelFormulaSum.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        console.log(`Total from UnitPrice * Qty:  LKR ${scriptCalculatedSum.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        console.log(`Difference: LKR ${(excelFormulaSum - scriptCalculatedSum).toLocaleString('en-US', {minimumFractionDigits: 2})}`);

        if (rowDiffs.length > 0) {
            console.log(`\n⚠️ Found ${rowDiffs.length} rows where Excel Total Amount != (Unit Price * Quantity):`);
            rowDiffs.forEach(d => {
                console.log(`   Row ${d.rowNumber}: "${d.itemName}" | Price: ${d.unitPrice} | Qty: ${d.quantity} | Excel Total: ${d.rowTotalExcel} | Calc Total: ${d.rowTotalCalc} | Diff: ${d.diff}`);
            });
        }

        if (skippedRows.length > 0) {
            console.log(`\n⚠️ Found ${skippedRows.length} skipped rows with non-zero amounts:`);
            skippedRows.forEach(s => {
                console.log(`   Row ${s.rowNumber}: "${s.itemName}" | Price: ${s.unitPrice} | Qty: ${s.quantity} | Excel Total: ${s.rowTotalExcel}`);
            });
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

audit80kDifference();
