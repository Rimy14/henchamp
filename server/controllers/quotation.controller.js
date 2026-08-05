/**
 * Quotation Controller
 * Handles all quotation operations including creation, approval, and management
 */

import { query, transaction } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Get all quotations with details
 */
export async function getAllQuotations(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status || '';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status) {
            whereClause += ' AND q.status = ?';
            params.push(status);
        }

        if (startDate && endDate) {
            whereClause += ' AND q.quote_date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM quotations q ${whereClause}`;
        const countResult = await query(countSql, params);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Get paginated quotations with details
        const sql = `
            SELECT 
                q.*,
                u.username as created_by_name,
                a.username as approved_by_name,
                (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count
            FROM quotations q
            LEFT JOIN users u ON q.created_by = u.id
            LEFT JOIN users a ON q.approved_by = a.id
            ${whereClause}
            ORDER BY q.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const quotations = await query(sql, params);

        res.json({
            success: true,
            data: quotations,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        });
    } catch (error) {
        logger.error('Error fetching quotations:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Get single quotation with items
 */
export async function getQuotationById(req, res) {
    try {
        const { id } = req.params;

        // Get quotation details
        const quotationSql = `
            SELECT 
                q.*,
                u.username as created_by_name,
                a.username as approved_by_name
            FROM quotations q
            LEFT JOIN users u ON q.created_by = u.id
            LEFT JOIN users a ON q.approved_by = a.id
            WHERE q.id = ?
        `;
        const quotations = await query(quotationSql, [id]);

        if (quotations.length === 0) {
            return res.status(404).json({ success: false, message: 'Quotation not found' });
        }

        const quotation = quotations[0];

        // Get quotation items
        const itemsSql = `
            SELECT 
                qi.*,
                i.name as item_name,
                i.code as item_code,
                i.unit_of_measure
            FROM quotation_items qi
            LEFT JOIN items i ON qi.item_id = i.id
            WHERE qi.quotation_id = ?
            ORDER BY qi.id
        `;
        const items = await query(itemsSql, [id]);

        quotation.items = items;

        res.json({ success: true, data: quotation });
    } catch (error) {
        logger.error('Error fetching quotation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Create new quotation
 */
export async function createQuotation(req, res) {
    try {
        const {
            customer_id,
            customer_name,
            customer_contact,
            customer_address,
            quote_date,
            validity_days,
            payment_terms,
            tax_percentage,
            discount_percentage,
            notes,
            items
        } = req.body;

        // Validation
        if (!customer_name) {
            return res.status(400).json({ success: false, message: 'Customer name is required' });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one item is required' });
        }

        if (!quote_date) {
            return res.status(400).json({ success: false, message: 'Quote date is required' });
        }

        const userId = req.user.userId;

        // Calculate totals
        let subtotal = 0;
        items.forEach(item => {
            subtotal += parseFloat(item.total_price);
        });

        const taxAmount = (subtotal * (parseFloat(tax_percentage) || 0)) / 100;
        const discountAmount = (subtotal * (parseFloat(discount_percentage) || 0)) / 100;
        const totalAmount = subtotal + taxAmount - discountAmount;

        // Generate unique quote number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const quote_number = `QT-${dateStr}-${randomSuffix}`;

        await transaction(async (conn) => {
            // Insert quotation
            const quotationSql = `
                INSERT INTO quotations (
                    customer_id, customer_name, customer_contact, customer_address,
                    quote_date, validity_days, payment_terms,
                    subtotal, tax_percentage, tax_amount, 
                    discount_percentage, discount_amount,
                    total_amount,
                    status, notes, created_by, quote_number
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const quotationParams = [
                customer_id || null,
                customer_name,
                customer_contact || null,
                customer_address || null,
                quote_date,
                validity_days || 7,
                payment_terms || null,
                subtotal.toFixed(2),
                tax_percentage || 0,
                taxAmount.toFixed(2),
                discount_percentage || 0,
                discountAmount.toFixed(2),
                totalAmount.toFixed(2),
                'Draft',
                notes || null,
                userId,
                quote_number
            ];

            const [result] = await conn.query(quotationSql, quotationParams);
            const quotationId = result.insertId;

            // Insert quotation items
            for (const item of items) {
                const itemSql = `
                    INSERT INTO quotation_items (
                        quotation_id, item_id, description, quantity, unit_price, total_price
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `;

                await conn.query(itemSql, [
                    quotationId,
                    item.item_id || null,
                    item.description,
                    item.quantity,
                    item.unit_price,
                    item.total_price
                ]);
            }

            res.status(201).json({
                success: true,
                message: 'Quotation created successfully',
                data: { id: quotationId }
            });
        });
    } catch (error) {
        logger.error('Error creating quotation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Update quotation details
 */
export async function updateQuotation(req, res) {
    try {
        const { id } = req.params;
        const {
            customer_id,
            customer_name,
            customer_contact,
            customer_address,
            quote_date,
            validity_days,
            payment_terms,
            tax_percentage,
            discount_percentage,
            notes,
            items
        } = req.body;

        // Validation
        if (!customer_name) {
            return res.status(400).json({ success: false, message: 'Customer name is required' });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one item is required' });
        }

        if (!quote_date) {
            return res.status(400).json({ success: false, message: 'Quote date is required' });
        }

        // Check if quotation exists
        const quotations = await query('SELECT * FROM quotations WHERE id = ?', [id]);
        if (quotations.length === 0) {
            return res.status(404).json({ success: false, message: 'Quotation not found' });
        }

        const userId = req.user.userId;

        // Calculate totals
        let subtotal = 0;
        items.forEach(item => {
            subtotal += parseFloat(item.total_price);
        });

        const taxAmount = (subtotal * (parseFloat(tax_percentage) || 0)) / 100;
        const discountAmount = (subtotal * (parseFloat(discount_percentage) || 0)) / 100;
        const totalAmount = subtotal + taxAmount - discountAmount;

        await transaction(async (conn) => {
            // Update quotation
            const updateSql = `
                UPDATE quotations SET
                    customer_id = ?, customer_name = ?, customer_contact = ?, customer_address = ?,
                    quote_date = ?, validity_days = ?, payment_terms = ?,
                    subtotal = ?, tax_percentage = ?, tax_amount = ?, 
                    discount_percentage = ?, discount_amount = ?,
                    total_amount = ?,
                    notes = ?, updated_at = NOW()
                WHERE id = ?
            `;

            const updateParams = [
                customer_id || null,
                customer_name,
                customer_contact || null,
                customer_address || null,
                quote_date,
                validity_days || 7,
                payment_terms || null,
                subtotal.toFixed(2),
                tax_percentage || 0,
                taxAmount.toFixed(2),
                discount_percentage || 0,
                discountAmount.toFixed(2),
                totalAmount.toFixed(2),
                notes || null,
                id
            ];

            await conn.query(updateSql, updateParams);

            // Delete existing items
            await conn.query('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);

            // Insert new items
            for (const item of items) {
                const itemSql = `
                    INSERT INTO quotation_items (
                        quotation_id, item_id, description, quantity, unit_price, total_price
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `;

                await conn.query(itemSql, [
                    id,
                    item.item_id || null,
                    item.description,
                    item.quantity,
                    item.unit_price,
                    item.total_price
                ]);
            }

            res.json({
                success: true,
                message: 'Quotation updated successfully',
                data: { id }
            });
        });
    } catch (error) {
        logger.error('Error updating quotation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Update quotation status
 */
export async function updateQuotationStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const userId = req.user.userId;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required' });
        }

        // Validate status
        const validStatuses = ['Draft', 'Pending', 'Approved', 'Rejected', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Get current quotation
        const quotations = await query('SELECT * FROM quotations WHERE id = ?', [id]);
        if (quotations.length === 0) {
            return res.status(404).json({ success: false, message: 'Quotation not found' });
        }

        const quotation = quotations[0];

        // Build update query
        let updateSql = 'UPDATE quotations SET status = ?, updated_at = NOW()';
        const params = [status];

        if (notes) {
            updateSql += ', notes = ?';
            params.push(notes);
        }

        // If approving, set approved_by and approved_at
        if (status === 'Approved') {
            updateSql += ', approved_by = ?, approved_at = NOW()';
            params.push(userId);
        }

        updateSql += ' WHERE id = ?';
        params.push(id);

        await query(updateSql, params);

        res.json({ success: true, message: `Quotation ${status.toLowerCase()} successfully` });
    } catch (error) {
        logger.error('Error updating quotation status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Delete quotation (only if Draft)
 */
export async function deleteQuotation(req, res) {
    try {
        const { id } = req.params;

        // Check if quotation exists and is in Draft status
        const quotations = await query('SELECT * FROM quotations WHERE id = ?', [id]);
        if (quotations.length === 0) {
            return res.status(404).json({ success: false, message: 'Quotation not found' });
        }

        const quotation = quotations[0];
        if (quotation.status !== 'Draft') {
            return res.status(400).json({
                success: false,
                message: 'Only draft quotations can be deleted'
            });
        }

        // Delete quotation (items will be deleted by CASCADE)
        await query('DELETE FROM quotations WHERE id = ?', [id]);

        res.json({ success: true, message: 'Quotation deleted successfully' });
    } catch (error) {
        logger.error('Error deleting quotation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}
