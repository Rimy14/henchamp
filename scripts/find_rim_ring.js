import pool from '../server/config/database.js';

async function findRimRing() {
    try {
        const [items] = await pool.query('SELECT code, name FROM items');
        console.log(`Total items in DB: ${items.length}`);

        const matches = items.filter(i => i.name.toLowerCase().includes('rim') || i.name.toLowerCase().includes('ring'));
        console.log(`Found ${matches.length} matching items:`);
        matches.forEach(m => console.log(`   Code: ${m.code} | Name: "${m.name}"`));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

findRimRing();
