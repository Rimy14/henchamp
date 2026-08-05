import { query } from '../config/database.js';
import { refreshPermissionsCache } from '../middleware/rbac.middleware.js';

// Get all roles with their permissions
export const getAllRoles = async (req, res) => {
    try {
        const roles = await query('SELECT * FROM roles ORDER BY id');
        
        // Fetch permissions for each role
        const permissions = await query('SELECT role_id, permission FROM role_permissions');
        
        // Group permissions by role
        const rolesWithPermissions = roles.map(role => {
            return {
                ...role,
                permissions: permissions
                    .filter(p => p.role_id === role.id)
                    .map(p => p.permission)
            };
        });

        res.status(200).json({
            success: true,
            data: rolesWithPermissions
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ success: false, message: 'Server error fetching roles' });
    }
};

// Create a new role
export const createRole = async (req, res) => {
    try {
        const { name, description, permissions } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Role name is required' });
        }

        // Check if role already exists
        const existing = await query('SELECT id FROM roles WHERE name = ?', [name]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Role name already exists' });
        }

        // Insert role
        const result = await query(
            'INSERT INTO roles (name, description, is_system) VALUES (?, ?, ?)',
            [name, description || '', false]
        );

        const roleId = result.insertId;

        // Insert permissions
        if (permissions && Array.isArray(permissions) && permissions.length > 0) {
            const placeholders = permissions.map(() => '(?, ?)').join(', ');
            const params = permissions.flatMap(p => [roleId, p]);
            await query(`INSERT INTO role_permissions (role_id, permission) VALUES ${placeholders}`, params);
        }

        await refreshPermissionsCache();

        res.status(201).json({
            success: true,
            message: 'Role created successfully',
            data: { id: roleId, name, description }
        });
    } catch (error) {
        console.error('Error creating role:', error);
        res.status(500).json({ success: false, message: 'Server error creating role' });
    }
};

// Update an existing role
export const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, permissions } = req.body;

        // Check if role exists
        const roles = await query('SELECT * FROM roles WHERE id = ?', [id]);
        if (roles.length === 0) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }
        
        const role = roles[0];

        // Do not allow changing name of system roles to prevent breaking code relying on them
        if (role.is_system && name && name !== role.name) {
            return res.status(400).json({ success: false, message: 'Cannot rename system roles (e.g. Admin, Cashier)' });
        }

        // Check name uniqueness if changed
        if (name && name !== role.name) {
            const existing = await query('SELECT id FROM roles WHERE name = ? AND id != ?', [name, id]);
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'Role name already exists' });
            }
        }

        // Update role table
        const newName = name || role.name;
        await query(
            'UPDATE roles SET name = ?, description = ? WHERE id = ?',
            [newName, description !== undefined ? description : role.description, id]
        );

        // Update permissions
        if (permissions && Array.isArray(permissions)) {
            // Delete old permissions
            await query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
            
            // Insert new ones
            if (permissions.length > 0) {
                const placeholders = permissions.map(() => '(?, ?)').join(', ');
                const params = permissions.flatMap(p => [id, p]);
                await query(`INSERT INTO role_permissions (role_id, permission) VALUES ${placeholders}`, params);
            }
        }
        
        // If we rename a role, we should also rename it in the users table so they don't lose access
        if (name && name !== role.name) {
            await query('UPDATE users SET role = ? WHERE role = ?', [newName, role.name]);
        }

        await refreshPermissionsCache();

        res.status(200).json({
            success: true,
            message: 'Role updated successfully'
        });
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ success: false, message: 'Server error updating role' });
    }
};

// Delete a role
export const deleteRole = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if role exists
        const roles = await query('SELECT * FROM roles WHERE id = ?', [id]);
        if (roles.length === 0) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }
        
        const role = roles[0];

        // Do not allow deleting system roles
        if (role.is_system) {
            return res.status(400).json({ success: false, message: 'Cannot delete system roles' });
        }

        // Check if role is assigned to any users
        const users = await query('SELECT id FROM users WHERE role = ?', [role.name]);
        if (users.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete role because it is assigned to ${users.length} user(s). Reassign them first.` 
            });
        }

        await query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
        await query('DELETE FROM roles WHERE id = ?', [id]);

        await refreshPermissionsCache();

        res.status(200).json({
            success: true,
            message: 'Role deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({ success: false, message: 'Server error deleting role' });
    }
};
