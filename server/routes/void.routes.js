import express from 'express';
import { validateVoidPassword, getVoidPassword, updateVoidPassword } from '../controllers/void.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/void/validate-password
 * @desc    Validate void admin password
 * @access  Private (requires authentication)
 */
router.post('/validate-password', verifyToken, validateVoidPassword);

/**
 * @route   GET /api/void/password
 * @desc    Get void admin password
 * @access  Private (Admin only)
 */
router.get('/password', verifyToken, requireRole('Admin'), getVoidPassword);

/**
 * @route   PUT /api/void/password
 * @desc    Update void admin password
 * @access  Private (Admin only)
 */
router.put('/password', verifyToken, requireRole('Admin'), updateVoidPassword);

export default router;
