import pool from '../server/config/database.js';

async function checkAndResetGRN() {
    try {
        // Show all GRNs and their statuses
        const [rows] = await pool.query('SELECT id, grn_number, status, po_id, received_date FROM grn ORDER BY id DESC LIMIT 20');
        console.log('\n=== Recent GRNs ===');
        rows.forEach(g => console.log(`  ID: ${g.id} | GRN: ${g.grn_number} | Status: "${g.status}" | PO: ${g.po_id} | Date: ${g.received_date}`));

        // Find non-pending GRNs
        const stuck = rows.filter(g => g.status !== 'pending' && g.status !== 'approved' && g.status !== 'rejected');
        if (stuck.length > 0) {
            console.log('\n⚠️  Stuck GRNs (unexpected status):');
            stuck.forEach(g => console.log(`  ID: ${g.id} | Status: "${g.status}"`));
        }

        // Show GRNs that are NOT pending (i.e., already approved/rejected)
        const nonPending = rows.filter(g => g.status !== 'pending');
        if (nonPending.length > 0) {
            console.log('\nNon-pending GRNs:');
            nonPending.forEach(g => console.log(`  ID: ${g.id} | GRN: ${g.grn_number} | Status: "${g.status}"`));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkAndResetGRN();
