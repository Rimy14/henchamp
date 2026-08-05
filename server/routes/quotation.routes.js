import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import {
    getAllQuotations,
    getQuotationById,
    createQuotation,
    updateQuotation,
    updateQuotationStatus,
    deleteQuotation
} from '../controllers/quotation.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

/**
 * Get all quotations
 */
router.get('/', getAllQuotations);

/**
 * Get single quotation by ID
 */
router.get('/:id', getQuotationById);

/**
 * Create new quotation (Coordinator and Admin)
 */
router.post('/', checkPermission('quotations:create'), createQuotation);

/**
 * Update quotation details (Admin only, reusing create permission for now or specific if available)
 * Typically edits are restricted to creators or admins.
 */
router.put('/:id', checkPermission('quotations:create'), updateQuotation);

/**
 * Update quotation status (Admin only for approval)
 */
router.put('/:id/status', checkPermission('quotations:approve'), updateQuotationStatus);

/**
 * Delete quotation (only if Draft)
 */
router.delete('/:id', checkPermission('quotations:delete'), deleteQuotation);

export default router;
