import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { validateGRNCreate, validateGRNApprove, validateGRNReject } from '../middleware/validation.middleware.js';
import {
    getAllGRNs,
    getGRNById,
    createGRN,
    approveGRN,
    rejectGRN,
    deleteGRN
} from '../controllers/grn.controller.js';

const router = express.Router();

router.use(verifyToken);

// Get all GRNs
router.get('/', checkPermission('grn:read'), getAllGRNs);

// Get single GRN by ID
router.get('/:id', checkPermission('grn:read'), getGRNById);

// Create new GRN from PO
router.post('/', checkPermission('grn:create'), validateGRNCreate, createGRN);

// Approve GRN (updates inventory)
router.patch('/:id/approve', checkPermission('grn:approve'), validateGRNApprove, approveGRN);

// Reject GRN
router.patch('/:id/reject', checkPermission('grn:approve'), validateGRNReject, rejectGRN);

// Delete GRN (only if pending)
router.delete('/:id', checkPermission('grn:delete'), deleteGRN);

export default router;
