import db from '../config/database.js';
import logger from '../utils/logger.js';

// Get current open fund or last closed fund
export const getCurrentFund = async (req, res) => {
    try {
        const [openFunds] = await db.query(
            'SELECT f.*, u.username as opened_by_name FROM petty_cash_funds f JOIN users u ON f.opened_by = u.id WHERE f.status = "open" LIMIT 1'
        );

        if (openFunds.length > 0) {
            return res.json({ success: true, status: 'open', fund: openFunds[0] });
        }

        const [lastFunds] = await db.query(
            'SELECT f.*, u.username as opened_by_name FROM petty_cash_funds f JOIN users u ON f.opened_by = u.id ORDER BY f.opened_at DESC LIMIT 1'
        );

        return res.json({ 
            success: true, 
            status: 'closed', 
            fund: lastFunds.length > 0 ? lastFunds[0] : null 
        });
    } catch (error) {
        logger.error('Error fetching current petty cash fund:', error);
        res.status(500).json({ success: false, message: 'Error fetching petty cash status' });
    }
};

// Open a new fund period
export const openFund = async (req, res) => {
    const { opening_balance } = req.body;
    const opened_by = req.user.userId;

    if (opening_balance === undefined || opening_balance < 0) {
        return res.status(400).json({ success: false, message: 'Valid opening balance is required' });
    }

    try {
        // Check if there is already an open fund
        const [openFunds] = await db.query('SELECT id FROM petty_cash_funds WHERE status = "open" LIMIT 1');
        if (openFunds.length > 0) {
            return res.status(400).json({ success: false, message: 'A petty cash fund is already active' });
        }

        // Generate simple reference number (PCF-YYYYMMDD-HHMMSS)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
        const reference_no = `PCF-${dateStr}-${timeStr}`;

        const [result] = await db.execute(
            'INSERT INTO petty_cash_funds (reference_no, opened_by, opening_balance, current_balance, status) VALUES (?, ?, ?, ?, "open")',
            [reference_no, opened_by, opening_balance, opening_balance]
        );

        // Record a transaction for opening
        await db.execute(
            'INSERT INTO petty_cash_transactions (fund_id, type, category, description, amount, balance_after, transaction_date, recorded_by) VALUES (?, "replenishment", "Opening Balance", "Initial float setup", ?, ?, CURDATE(), ?)',
            [result.insertId, opening_balance, opening_balance, opened_by]
        );

        res.status(201).json({ success: true, message: 'Fund opened successfully', id: result.insertId, reference_no });
    } catch (error) {
        logger.error('Error opening petty cash fund:', error);
        res.status(500).json({ success: false, message: 'Error opening petty cash fund' });
    }
};

// Close/Reconcile an active fund
export const closeFund = async (req, res) => {
    const { id } = req.params;
    const { closing_note } = req.body;
    const closed_by = req.user.userId;

    try {
        const [funds] = await db.query('SELECT * FROM petty_cash_funds WHERE id = ? AND status = "open"', [id]);
        if (funds.length === 0) {
            return res.status(404).json({ success: false, message: 'Active petty cash fund not found' });
        }

        await db.execute(
            'UPDATE petty_cash_funds SET status = "closed", closed_by = ?, closed_at = NOW(), closing_note = ? WHERE id = ?',
            [closed_by, closing_note || null, id]
        );

        res.json({ success: true, message: 'Fund closed/reconciled successfully' });
    } catch (error) {
        logger.error('Error closing petty cash fund:', error);
        res.status(500).json({ success: false, message: 'Error closing petty cash fund' });
    }
};

// Add replenishment or disbursement transaction
export const addTransaction = async (req, res) => {
    const { fund_id, type, category, description, amount, reference_no, transaction_date } = req.body;
    const recorded_by = req.user.userId;

    if (!fund_id || !type || !description || !amount || amount <= 0 || !transaction_date) {
        return res.status(400).json({ success: false, message: 'Required fields missing or invalid' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Lock fund row for update to prevent race conditions
        const [funds] = await connection.query(
            'SELECT * FROM petty_cash_funds WHERE id = ? AND status = "open" FOR UPDATE',
            [fund_id]
        );

        if (funds.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Active petty cash fund period not found' });
        }

        const fund = funds[0];
        let balance_after = parseFloat(fund.current_balance);

        if (type === 'replenishment') {
            balance_after += parseFloat(amount);
        } else if (type === 'disbursement') {
            if (balance_after < parseFloat(amount)) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Insufficient petty cash balance' });
            }
            balance_after -= parseFloat(amount);
        } else {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Invalid transaction type' });
        }

        // Insert transaction
        const [txResult] = await connection.execute(
            'INSERT INTO petty_cash_transactions (fund_id, type, category, description, amount, balance_after, reference_no, transaction_date, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [fund_id, type, category || null, description, amount, balance_after, reference_no || null, transaction_date, recorded_by]
        );

        // Update fund current balance
        await connection.execute(
            'UPDATE petty_cash_funds SET current_balance = ? WHERE id = ?',
            [balance_after, fund_id]
        );

        await connection.commit();
        res.status(201).json({ success: true, message: 'Transaction recorded successfully', id: txResult.insertId, balance_after });
    } catch (error) {
        await connection.rollback();
        logger.error('Error adding petty cash transaction:', error);
        res.status(500).json({ success: false, message: 'Error recording transaction' });
    } finally {
        connection.release();
    }
};

// Void transaction
export const voidTransaction = async (req, res) => {
    const { id } = req.params;
    const { void_reason } = req.body;

    if (!void_reason) {
        return res.status(400).json({ success: false, message: 'Void reason is required' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Lock transaction row
        const [txs] = await connection.query(
            'SELECT * FROM petty_cash_transactions WHERE id = ? FOR UPDATE',
            [id]
        );

        if (txs.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        const tx = txs[0];
        if (tx.is_voided) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Transaction is already voided' });
        }

        // Lock fund row
        const [funds] = await connection.query(
            'SELECT * FROM petty_cash_funds WHERE id = ? AND status = "open" FOR UPDATE',
            [tx.fund_id]
        );

        if (funds.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Fund period is closed; transaction cannot be voided' });
        }

        const fund = funds[0];
        let new_balance = parseFloat(fund.current_balance);

        // Reverse the transaction impact
        if (tx.type === 'replenishment') {
            if (new_balance < parseFloat(tx.amount)) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Cannot void replenishment: Insufficient balance' });
            }
            new_balance -= parseFloat(tx.amount);
        } else if (tx.type === 'disbursement') {
            new_balance += parseFloat(tx.amount);
        }

        // Mark transaction as voided
        await connection.execute(
            'UPDATE petty_cash_transactions SET is_voided = TRUE, void_reason = ? WHERE id = ?',
            [void_reason, id]
        );

        // Update fund current balance
        await connection.execute(
            'UPDATE petty_cash_funds SET current_balance = ? WHERE id = ?',
            [new_balance, tx.fund_id]
        );

        await connection.commit();
        res.json({ success: true, message: 'Transaction voided successfully', new_balance });
    } catch (error) {
        await connection.rollback();
        logger.error('Error voiding petty cash transaction:', error);
        res.status(500).json({ success: false, message: 'Error voiding transaction' });
    } finally {
        connection.release();
    }
};

// Get all transactions for active/specific fund
export const getFundTransactions = async (req, res) => {
    const { fundId } = req.query;

    try {
        let queryStr = 'SELECT t.*, u.username as recorded_by_name FROM petty_cash_transactions t JOIN users u ON t.recorded_by = u.id';
        const params = [];

        if (fundId) {
            queryStr += ' WHERE t.fund_id = ?';
            params.push(fundId);
        } else {
            // Default: current open fund
            queryStr += ' WHERE t.fund_id = (SELECT id FROM petty_cash_funds WHERE status = "open" LIMIT 1)';
        }

        queryStr += ' ORDER BY t.created_at DESC';

        const [rows] = await db.query(queryStr, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        logger.error('Error fetching transactions:', error);
        res.status(500).json({ success: false, message: 'Error fetching transactions' });
    }
};

// List all funds history
export const getAllFunds = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT f.*, u1.username as opened_by_name, u2.username as closed_by_name FROM petty_cash_funds f JOIN users u1 ON f.opened_by = u1.id LEFT JOIN users u2 ON f.closed_by = u2.id ORDER BY f.opened_at DESC'
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        logger.error('Error fetching funds list:', error);
        res.status(500).json({ success: false, message: 'Error fetching funds list' });
    }
};

// Get petty cash categories (optionally include inactive)
export const getCategories = async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
        const sql = includeInactive
            ? 'SELECT * FROM petty_cash_categories ORDER BY is_active DESC, name ASC'
            : 'SELECT * FROM petty_cash_categories WHERE is_active = TRUE ORDER BY name ASC';

        const [rows] = await db.query(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        logger.error('Error fetching petty cash categories:', error);
        res.status(500).json({ success: false, message: 'Error fetching petty cash categories' });
    }
};

// Create a new petty cash category
export const createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        const trimmedName = (name || '').trim();

        if (!trimmedName) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        // Check if category name already exists (case-insensitive)
        const [existing] = await db.query(
            'SELECT id, is_active FROM petty_cash_categories WHERE LOWER(name) = LOWER(?)',
            [trimmedName]
        );

        if (existing.length > 0) {
            if (!existing[0].is_active) {
                // Reactivate category if previously deactivated
                await db.query(
                    'UPDATE petty_cash_categories SET is_active = TRUE, description = ? WHERE id = ?',
                    [description || null, existing[0].id]
                );
                return res.json({
                    success: true,
                    message: 'Category reactivated successfully',
                    data: { id: existing[0].id, name: trimmedName, description }
                });
            }
            return res.status(400).json({ success: false, message: 'A category with this name already exists' });
        }

        const [result] = await db.query(
            'INSERT INTO petty_cash_categories (name, description) VALUES (?, ?)',
            [trimmedName, description || null]
        );

        res.status(201).json({
            success: true,
            message: 'Petty cash category created successfully',
            data: { id: result.insertId, name: trimmedName, description }
        });
    } catch (error) {
        logger.error('Error creating petty cash category:', error);
        res.status(500).json({ success: false, message: 'Error creating petty cash category' });
    }
};

// Toggle active/inactive status of a petty cash category (No hard deletion)
export const toggleCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await db.query('SELECT id, is_active, name FROM petty_cash_categories WHERE id = ?', [id]);

        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        const newStatus = existing[0].is_active ? 0 : 1;
        await db.query('UPDATE petty_cash_categories SET is_active = ? WHERE id = ?', [newStatus, id]);

        const statusLabel = newStatus ? 'activated' : 'deactivated';
        res.json({
            success: true,
            message: `Category "${existing[0].name}" ${statusLabel} successfully`,
            is_active: !!newStatus
        });
    } catch (error) {
        logger.error('Error toggling petty cash category status:', error);
        res.status(500).json({ success: false, message: 'Error updating category status' });
    }
};

