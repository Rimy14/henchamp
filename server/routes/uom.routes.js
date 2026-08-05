import express from 'express';
import { getAllUOMs, createUOM, updateUOM, deleteUOM } from '../controllers/uom.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

const router = express.Router();

// Apply authentication to all UOM routes
router.use(verifyToken);

/**
 * @route   GET /api/uom
 * @desc    Get all units of measure
 * @access  Private
 */
router.get('/', getAllUOMs);

/**
 * @route   POST /api/uom
 * @desc    Create a new unit of measure
 * @access  Private (Admin only)
 */
router.post('/', requireRole('Admin'), createUOM);

/**
 * @route   PUT /api/uom/:id
 * @desc    Update a unit of measure
 * @access  Private (Admin only)
 */
router.put('/:id', requireRole('Admin'), updateUOM);

/**
 * @route   DELETE /api/uom/:id
 * @desc    Delete a unit of measure
 * @access  Private (Admin only)
 */
router.delete('/:id', requireRole('Admin'), deleteUOM);

export default router;
