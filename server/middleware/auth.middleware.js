import jwt from 'jsonwebtoken';
import jwtConfig from '../config/jwt.js';
import { query } from '../config/database.js';

/**
 * Middleware to verify JWT token from HTTP-only cookie
 */
export const verifyToken = async (req, res, next) => {
    try {
        // Get token from cookie
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, jwtConfig.secret);

        // Check if user still exists and is active
        const users = await query(
            'SELECT id, username, email, role, status FROM users WHERE id = ? AND status = ?',
            [decoded.userId, 'active']
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token. User not found or inactive.'
            });
        }

        // Attach user info to request
        req.user = {
            userId: decoded.userId,
            username: users[0].username,
            email: users[0].email,
            role: users[0].role
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired. Please login again.'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Invalid token.'
        });
    }
};

/**
 * Generate JWT token
 */
export const generateToken = (userId, role) => {
    return jwt.sign(
        { userId, role },
        jwtConfig.secret,
        { expiresIn: jwtConfig.expiresIn }
    );
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId },
        jwtConfig.secret,
        { expiresIn: jwtConfig.refreshExpiresIn }
    );
};
