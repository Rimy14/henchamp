import logger from '../utils/logger.js';
import { query } from '../config/database.js';

/**
 * Validate void admin password
 */
export const validateVoidPassword = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required'
            });
        }

        // Try to get void admin password from database first
        let voidAdminPassword = null;
        try {
            const settings = await query(
                'SELECT setting_value FROM system_settings WHERE setting_key = ?',
                ['void_admin_password']
            );

            if (settings && settings.length > 0) {
                voidAdminPassword = settings[0].setting_value;
            }
        } catch (dbError) {
            logger.warn('Could not fetch void password from database, falling back to .env:', dbError.message);
        }

        // Fallback to environment variable if not in database
        if (!voidAdminPassword) {
            voidAdminPassword = process.env.VOID_ADMIN_PASSWORD;
        }

        if (!voidAdminPassword) {
            logger.error('VOID_ADMIN_PASSWORD not configured in database or .env');
            return res.status(500).json({
                success: false,
                message: 'Void password not configured. Please contact administrator.'
            });
        }

        // Simple password check (not hashed for simplicity)
        if (password === voidAdminPassword) {
            logger.info(`Void password validated successfully by user ${req.user.username}`);
            return res.status(200).json({
                success: true,
                message: 'Password validated'
            });
        } else {
            logger.warn(`Invalid void password attempt by user ${req.user.username}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid password'
            });
        }
    } catch (error) {
        logger.error('Error validating void password:', error);
        res.status(500).json({
            success: false,
            message: 'Server error validating password'
        });
    }
};

/**
 * Get void admin password (for admin UI)
 */
export const getVoidPassword = async (req, res) => {
    try {
        const settings = await query(
            'SELECT setting_value FROM system_settings WHERE setting_key = ?',
            ['void_admin_password']
        );

        if (settings && settings.length > 0) {
            return res.json({
                success: true,
                password: settings[0].setting_value
            });
        }

        // Fallback to .env if not in database
        const envPassword = process.env.VOID_ADMIN_PASSWORD || 'Admin123';
        return res.json({
            success: true,
            password: envPassword,
            source: 'env'
        });
    } catch (error) {
        logger.error('Error fetching void password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch void password'
        });
    }
};

/**
 * Update void admin password
 */
export const updateVoidPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 4 characters'
            });
        }

        // Update or insert the setting
        await query(
            `INSERT INTO system_settings (setting_key, setting_value, description) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             setting_value = VALUES(setting_value),
             updated_at = CURRENT_TIMESTAMP`,
            ['void_admin_password', newPassword, 'Password required for voiding transactions']
        );

        logger.info(`Void password updated by user ${req.user.username}`);

        res.json({
            success: true,
            message: 'Void password updated successfully'
        });
    } catch (error) {
        logger.error('Error updating void password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update void password'
        });
    }
};
