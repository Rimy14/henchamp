import ExcelJS from 'exceljs';

async function readExcel() {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile('Autora_Sithuruya_Purchase_Report_.xlsx');
        console.log('Worksheets in file:', workbook.worksheets.map(w => w.name));
        
        workbook.worksheets.forEach(sheet => {
            console.log(`\n=== Sheet: "${sheet.name}" (Total rows: ${sheet.rowCount}) ===`);
            const firstRow = sheet.getRow(1);
            console.log('Headers:', firstRow.values);
            for (let i = 2; i <= Math.min(6, sheet.rowCount); i++) {
                console.log(`Row ${i}:`, sheet.getRow(i).values);
            }
        });

        process.exit(0);
    } catch (err) {
        console.error('Error reading Excel file:', err);
        process.exit(1);
    }
}

readExcel();
