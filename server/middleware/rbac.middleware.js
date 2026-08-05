import { query } from '../config/database.js';

/**
 * Role-Based Access Control (RBAC) Middleware
 * Defines permissions for each role dynamically from the database.
 */

// In-memory cache for role permissions
let permissionsCache = {};
let lastFetchTime = 0;
const CACHE_TTL = 60000; // 1 minute cache TTL to avoid hitting DB constantly

/**
 * Fetch permissions from DB and populate cache
 */
export const refreshPermissionsCache = async () => {
    try {
        const roles = await query('SELECT * FROM roles');
        const rolePermissions = await query('SELECT role_id, permission FROM role_permissions');
        
        const newCache = {};
        
        for (const role of roles) {
            newCache[role.name] = rolePermissions
                .filter(rp => rp.role_id === role.id)
                .map(rp => rp.permission);
        }
        
        permissionsCache = newCache;
        lastFetchTime = Date.now();
    } catch (error) {
        console.error('Failed to refresh permissions cache:', error);
    }
};

/**
 * Ensure cache is up to date
 */
const ensureCache = async () => {
    if (Date.now() - lastFetchTime > CACHE_TTL) {
        await refreshPermissionsCache();
    }
};

/**
 * Check if user has permission
 */
const hasPermission = async (userRole, requiredPermission) => {
    await ensureCache();
    const userPermissions = permissionsCache[userRole] || [];

    // Check for exact permission or wildcard
    return userPermissions.some(permission => {
        // Check for exact match
        if (permission === requiredPermission) return true;

        // Check for wildcard permissions (e.g., 'items:*')
        const [resource, action] = permission.split(':');
        const [reqResource, reqAction] = requiredPermission.split(':');

        if (resource === reqResource && action === '*') return true;

        // Check for full wildcard
        if (permission === '*') return true;

        return false;
    });
};

/**
 * Middleware to check if user has required permission
 */
export const checkPermission = (requiredPermission) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        try {
            const isAllowed = await hasPermission(req.user.role, requiredPermission);
            if (!isAllowed) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Requires '${requiredPermission}' permission`
                });
            }
            next();
        } catch (error) {
            console.error('Error checking permission:', error);
            res.status(500).json({ success: false, message: 'Server error checking permissions' });
        }
    };
};

/**
 * Middleware to restrict access to specific roles
 * Mostly used as a fallback or for strict role-only checks
 */
export const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access restricted to: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
};
