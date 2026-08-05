import { query } from '../config/database.js';

export const getCart = async (req, res) => {
    try {
        const userId = req.user.userId; // Fixed: req.user.id -> req.user.userId
        const carts = await query('SELECT * FROM carts WHERE user_id = ?', [userId]);

        if (carts.length === 0) {
            return res.json({ success: true, cart: null });
        }

        const cart = carts[0];
        // Parse JSON fields if they are strings (mysql2/promise might already parse JSON columns)
        // But to be safe if they are returned as strings:
        if (typeof cart.items === 'string') cart.items = JSON.parse(cart.items);
        if (typeof cart.payments === 'string') cart.payments = JSON.parse(cart.payments);

        res.json({ success: true, cart });
    } catch (error) {
        console.error('Error getting cart:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve cart' });
    }
};

export const saveCart = async (req, res) => {
    try {
        const userId = req.user.userId; // Fixed: req.user.id -> req.user.userId
        const { items, payments, customer_id, discount_percent } = req.body;

        // Ensure valid JSON for storage
        const itemsJson = JSON.stringify(items || []);
        const paymentsJson = JSON.stringify(payments || []);

        // UPSERT query (Insert or Update on Duplicate Key)
        await query(
            `INSERT INTO carts (user_id, items, payments, customer_id, discount_percent) 
             VALUES (?, ?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
             items = VALUES(items), 
             payments = VALUES(payments), 
             customer_id = VALUES(customer_id),
             discount_percent = VALUES(discount_percent)`,
            [userId, itemsJson, paymentsJson, customer_id || null, discount_percent || 0]
        );

        res.json({ success: true, message: 'Cart saved successfully' });
    } catch (error) {
        console.error('Error saving cart:', error);
        res.status(500).json({ success: false, message: 'Failed to save cart' });
    }
};

export const clearCart = async (req, res) => {
    try {
        const userId = req.user.userId; // Fixed: req.user.id -> req.user.userId
        await query('DELETE FROM carts WHERE user_id = ?', [userId]);
        res.json({ success: true, message: 'Cart cleared successfully' });
    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({ success: false, message: 'Failed to clear cart' });
    }
};
