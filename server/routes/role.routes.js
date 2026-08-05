import express from 'express';
import { getAllRoles, createRole, updateRole, deleteRole } from '../controllers/role.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = express.Router();

// Require authentication for all role endpoints
router.use(verifyToken);

// All role management operations require Admin access
router.use(requireRole('Admin'));

// Get all roles
router.get('/', getAllRoles);

// Create a new role
router.post('/', createRole);

// Update a role
router.put('/:id', updateRole);

// Delete a role
router.delete('/:id', deleteRole);

export default router;
