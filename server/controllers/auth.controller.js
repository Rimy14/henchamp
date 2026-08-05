import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { generateToken, generateRefreshToken } from '../middleware/auth.middleware.js';
import jwtConfig from '../config/jwt.js';
import logger from '../utils/logger.js';

// Helper to fetch permissions for a role
const getUserPermissions = async (roleName) => {
    try {
        const roles = await query('SELECT id FROM roles WHERE name = ?', [roleName]);
        if (roles.length === 0) return [];
        const perms = await query('SELECT permission FROM role_permissions WHERE role_id = ?', [roles[0].id]);
        return perms.map(p => p.permission);
    } catch (e) {
        return [];
    }
};

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
export const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('🔐 Login attempt for username:', username);
        console.log('Request headers:', req.headers);
        console.log('Cookies received:', req.cookies);

        // Find user
        const users = await query(
            'SELECT id, username, email, password_hash, role, status FROM users WHERE username = ?',
            [username]
        );

        console.log('Database query result:', users.length > 0 ? `Found user: ${users[0].username}` : 'No user found');

        if (users.length === 0) {
            // Log failed login attempt (user not found)
            await query(
                'INSERT INTO audit_logs (action, ip_address, user_agent, new_values) VALUES (?, ?, ?, ?)',
                ['USER_LOGIN_FAILED', req.ip, req.get('user-agent'), JSON.stringify({ username, reason: 'User not found' })]
            );

            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        const user = users[0];

        // Check if user is active
        if (user.status !== 'active') {
            // Log failed login attempt (inactive account)
            await query(
                'INSERT INTO audit_logs (user_id, action, ip_address, user_agent, new_values) VALUES (?, ?, ?, ?, ?)',
                [user.id, 'USER_LOGIN_FAILED', req.ip, req.get('user-agent'), JSON.stringify({ username, reason: 'Account inactive' })]
            );

            return res.status(403).json({
                success: false,
                message: 'Account is inactive. Please contact administrator.'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            // Log failed login attempt (invalid password)
            await query(
                'INSERT INTO audit_logs (user_id, action, ip_address, user_agent, new_values) VALUES (?, ?, ?, ?, ?)',
                [user.id, 'USER_LOGIN_FAILED', req.ip, req.get('user-agent'), JSON.stringify({ username, reason: 'Invalid password' })]
            );

            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Generate tokens
        const token = generateToken(user.id, user.role);
        const refreshToken = generateRefreshToken(user.id);

        // Update last login
        await query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );

        // Log authentication
        await query(
            'INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [user.id, 'USER_LOGIN', req.ip, req.get('user-agent')]
        );

        // Set HTTP-only cookies
        res.cookie('token', token, jwtConfig.cookieOptions);
        res.cookie('refreshToken', refreshToken, jwtConfig.refreshCookieOptions);

        logger.info(`User logged in: ${username}`);

        const permissions = await getUserPermissions(user.role);

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                permissions
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and clear cookies
 * @access  Private
 */
export const logout = async (req, res) => {
    try {
        // Log logout
        if (req.user) {
            await query(
                'INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [req.user.userId, 'USER_LOGOUT', req.ip, req.get('user-agent')]
            );
        }

        // Clear cookies
        res.clearCookie('token');
        res.clearCookie('refreshToken');

        res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
export const getMe = async (req, res) => {
    try {
        const users = await query(
            'SELECT id, username, email, role, status, created_at, last_login FROM users WHERE id = ?',
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];
        const permissions = await getUserPermissions(user.role);

        res.json({
            success: true,
            user: {
                ...user,
                permissions
            }
        });
    } catch (error) {
        logger.error('Get me error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user info'
        });
    }
};

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get user
        const users = await query(
            'SELECT id, password_hash FROM users WHERE id = ?',
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await query(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newPasswordHash, req.user.userId]
        );

        // Log password change
        await query(
            'INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [req.user.userId, 'PASSWORD_CHANGE', req.ip, req.get('user-agent')]
        );

        logger.info(`Password changed for user ID: ${req.user.userId}`);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password'
        });
    }
};

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Private
 */
export const refreshAccessToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token not found'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, jwtConfig.secret);

        // Get user
        const users = await query(
            'SELECT id, role, status FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (users.length === 0 || users[0].status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new access token
        const newToken = generateToken(users[0].id, users[0].role);

        // Set new token cookie
        res.cookie('token', newToken, jwtConfig.cookieOptions);

        res.json({
            success: true,
            message: 'Token refreshed successfully'
        });
    } catch (error) {
        logger.error('Refresh token error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid or expired refresh token'
        });
    }
};
