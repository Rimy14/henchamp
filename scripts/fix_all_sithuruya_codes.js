import pool from '../server/config/database.js';
import fs from 'fs';

function cleanName(name) {
    if (!name) return '';
    return name
        .replace(/^"|"$/g, '')      // Remove leading/trailing quotes
        .replace(/[\"']/g, '')       // Remove internal quotes/apostrophes
        .replace(/\s+/g, ' ')        // Normalize multiple spaces to single space
        .trim()
        .toLowerCase();
}

async function fixAllSithuruyaCodes() {
    try {
        const [dbItems] = await pool.query('SELECT code, name FROM items');
        console.log(`Loaded ${dbItems.length} items from database.`);

        // Build normalized item map
        const dbMap = new Map();
        dbItems.forEach(item => {
            if (item.name) {
                const cleaned = cleanName(item.name);
                dbMap.set(cleaned, item);
            }
        });

        const csvContent = fs.readFileSync('po_bulk_upload_sithuruya.csv', 'utf8');
        const lines = csvContent.split('\n').filter(Boolean);
        const headers = lines[0];
        const newRows = [headers];

        let matched = 0;
        let unmapped = [];

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            // po_ref,supplier_name,order_date,expected_delivery,notes,item_name,item_code,quantity,unit_price_excl_tax,tax_rate
            
            // Reconstruct item_name if it was split by comma
            let itemName = parts[5];
            let itemCodeIndex = 6;
            
            // Handle if CSV line had quotes around item_name containing commas
            const cleanedName = cleanName(itemName);
            const dbMatch = dbMap.get(cleanedName);

            if (dbMatch) {
                matched++;
                parts[6] = dbMatch.code;
            } else {
                // Try fuzzy searching across dbItems
                let bestMatch = null;
                for (const dbItem of dbItems) {
                    const dbClean = cleanName(dbItem.name);
                    if (cleanedName.replace(/[^a-z0-9]/g, '') === dbClean.replace(/[^a-z0-9]/g, '')) {
                        bestMatch = dbItem;
                        break;
                    }
                }

                if (bestMatch) {
                    matched++;
                    parts[6] = bestMatch.code;
                    console.log(`  -> Fuzzy Matched line ${i + 1}: "${itemName}" -> ${bestMatch.code} ("${bestMatch.name}")`);
                } else {
                    unmapped.push({ line: i + 1, name: itemName, code: parts[6] });
                }
            }

            newRows.push(parts.join(','));
        }

        fs.writeFileSync('po_bulk_upload_sithuruya.csv', newRows.join('\n'));
        console.log(`\n🎉 Updated po_bulk_upload_sithuruya.csv!`);
        console.log(`✅ Total rows matched with DB item codes: ${matched} / ${lines.length - 1}`);

        if (unmapped.length > 0) {
            console.log(`\n⚠️ ${unmapped.length} unmapped rows (checking details):`);
            unmapped.forEach(u => console.log(`   Line ${u.line}: "${u.name}" (Code: ${u.code})`));
        }

        process.exit(0);
    } catch (e) {
        console.error('Error fixing CSV:', e);
        process.exit(1);
    }
}

fixAllSithuruyaCodes();
