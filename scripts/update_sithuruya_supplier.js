import fs from 'fs';

function updateSupplier(filename) {
    if (!fs.existsSync(filename)) return;
    const content = fs.readFileSync(filename, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const headers = lines[0].split(',');
    
    // Find index of supplier_name
    const suppIdx = headers.indexOf('supplier_name');
    if (suppIdx === -1) return;

    const newRows = [lines[0]];

    for (let i = 1; i < lines.length; i++) {
        // Robust CSV row splitter that preserves quoted strings
        const row = lines[i];
        const parts = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',');
        
        // Simpler line update using regex replacement for the 2nd column (supplier_name)
        // Header: po_ref,supplier_name,order_date,...
        const updatedLine = lines[i].replace(/^([^,]+),([^,]*),/, '$1,DIRECT PURCHASING,');
        newRows.push(updatedLine);
    }

    fs.writeFileSync(filename, newRows.join('\n'));
    console.log(`✅ Updated ${filename} with supplier "DIRECT PURCHASING" (${newRows.length - 1} rows)`);
}

updateSupplier('po_bulk_upload_sithuruya.csv');
updateSupplier('items_bulk_upload_sithuruya.csv');
