import pool from '../server/config/database.js';

async function migrate() {
    try {
        console.log('🔄 Running migration: Adding code_prefix column to categories table...');

        // Check if code_prefix column already exists
        const [columns] = await pool.query(`
            SHOW COLUMNS FROM categories LIKE 'code_prefix'
        `);

        if (columns.length === 0) {
            console.log('Adding code_prefix column to categories table...');
            await pool.query(`
                ALTER TABLE categories 
                ADD COLUMN code_prefix VARCHAR(10) NULL AFTER name
            `);
            console.log('✅ Column code_prefix added successfully.');
        } else {
            console.log('ℹ️ Column code_prefix already exists.');
        }

        // Fetch all categories to populate missing code_prefix
        const [categories] = await pool.query('SELECT id, name, code_prefix FROM categories');
        
        const usedPrefixes = new Set();
        categories.forEach(c => {
            if (c.code_prefix) usedPrefixes.add(c.code_prefix.toUpperCase());
        });

        console.log(`Processing ${categories.length} categories for code_prefix population...`);

        for (const category of categories) {
            if (!category.code_prefix) {
                // Generate base prefix from name (first 6 alphanumeric characters)
                let basePrefix = category.name
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .substring(0, 6);

                if (!basePrefix) {
                    basePrefix = 'CAT';
                }

                let finalPrefix = basePrefix;
                let counter = 1;

                while (usedPrefixes.has(finalPrefix)) {
                    counter++;
                    const suffix = String(counter);
                    finalPrefix = basePrefix.substring(0, 6 - suffix.length) + suffix;
                }

                usedPrefixes.add(finalPrefix);

                await pool.query(
                    'UPDATE categories SET code_prefix = ? WHERE id = ?',
                    [finalPrefix, category.id]
                );

                console.log(`  -> Category "${category.name}" (ID: ${category.id}) prefix set to: ${finalPrefix}`);
            }
        }

        console.log('🎉 Migration finished successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
