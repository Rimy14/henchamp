import pool from '../server/config/database.js';

async function searchDB() {
    try {
        const [items] = await pool.query('SELECT code, name FROM items');
        console.log(`Total items in DB: ${items.length}`);
        
        const targetNames = ['4JG2 Populer shaft', 'Diesal Hand pump'];
        
        for (const t of targetNames) {
            console.log(`\nSearching for target: "${t}"`);
            const words = t.split(' ');
            const matches = items.filter(i => words.some(w => i.name.toLowerCase().includes(w.toLowerCase())));
            matches.forEach(m => console.log(`   Found match -> Code: ${m.code} | Name: "${m.name}"`));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

searchDB();
