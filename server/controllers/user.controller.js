import bcrypt from 'bcrypt';
import { query, transaction } from '../config/database.js';
import logger from '../utils/logger.js';
import { checkPermission, requireRole } from '../middleware/rbac.middleware.js';

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Private (Admin only)
 */
export const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const { search = '', role = '', status = '' } = req.query;

        let sql = 'SELECT id, username, email, role, status, created_at, last_login FROM users WHERE 1=1';
        const params = [];

        if (search) {
            sql += ' AND (username LIKE ? OR email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        if (role) {
            sql += ' AND role = ?';
            params.push(role);
        }

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }

        sql += ' ORDER BY created_at DESC';

        // Use raw SQL with template literals for LIMIT/OFFSET to avoid prepared statement issues
        const finalSql = `${sql} LIMIT ${limit} OFFSET ${offset}`;

        const users = await query(finalSql, params);

        // Get total count
        let countSql = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        const countParams = [];

        if (search) {
            countSql += ' AND (username LIKE ? OR email LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }

        if (role) {
            countSql += ' AND role = ?';
            countParams.push(role);
        }

        if (status) {
            countSql += ' AND status = ?';
            countParams.push(status);
        }

        const [{ total }] = await query(countSql, countParams);

        res.json({
            success: true,
            data: users,
            pagination: {
                totalItems: total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
};

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (Admin only)
 */
export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const users = await query(
            'SELECT id, username, email, role, status, created_at, last_login FROM users WHERE id = ?',
            [id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: users[0]
        });
    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user'
        });
    }
};

/**
 * @route   POST /api/users
 * @desc    Create new user
 * @access  Private (Admin only)
 */
export const createUser = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        // Check if user already exists
        const existing = await query(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Username or email already exists'
            });
        }

        // Hash password
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Insert user
        const result = await query(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, password_hash, role]
        );

        // Log action
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values) VALUES (?, ?, ?, ?, ?)',
            [req.user.userId, 'USER_CREATE', 'users', result.insertId, JSON.stringify({ username, email, role })]
        );

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                id: result.insertId,
                username,
                email,
                role
            }
        });
    } catch (error) {
        logger.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create user'
        });
    }
};

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private (Admin only)
 */
export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, role, status } = req.body;

        // Check if user exists
        const users = await query('SELECT * FROM users WHERE id = ?', [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if username or email is already taken by another user
        if (username || email) {
            const checkConditions = [];
            const checkParams = [];

            if (username) {
                checkConditions.push('username = ?');
                checkParams.push(username);
            }
            if (email) {
                checkConditions.push('email = ?');
                checkParams.push(email);
            }

            if (checkConditions.length > 0) {
                const existing = await query(
                    `SELECT id FROM users WHERE (${checkConditions.join(' OR ')}) AND id != ?`,
                    [...checkParams, id]
                );
                if (existing.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Username or email already exists'
                    });
                }
            }
        }

        const updateFields = [];
        const params = [];

        if (username) {
            updateFields.push('username = ?');
            params.push(username);
        }

        if (email !== undefined) {
            updateFields.push('email = ?');
            params.push(email || null);
        }

        if (role) {
            updateFields.push('role = ?');
            params.push(role);
        }

        if (status) {
            updateFields.push('status = ?');
            params.push(status);
        }

        if (req.body.password && req.body.password.trim() !== '') {
            const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
            const password_hash = await bcrypt.hash(req.body.password, saltRounds);
            updateFields.push('password_hash = ?');
            params.push(password_hash);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        params.push(id);

        await query(
            `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
            params
        );

        // Log action
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.userId, 'USER_UPDATE', 'users', id, JSON.stringify(users[0]), JSON.stringify(req.body)]
        );

        res.json({
            success: true,
            message: 'User updated successfully'
        });
    } catch (error) {
        logger.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user'
        });
    }
};

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Private (Admin only)
 */
export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (parseInt(id) === req.user.userId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot delete your own account'
            });
        }

        // Check if user exists
        const users = await query('SELECT * FROM users WHERE id = ?', [id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Delete user (or soft delete by setting status to inactive)
        await query('UPDATE users SET status = ? WHERE id = ?', ['inactive', id]);

        // Log action
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values) VALUES (?, ?, ?, ?, ?)',
            [req.user.userId, 'USER_DELETE', 'users', id, JSON.stringify(users[0])]
        );

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
};
