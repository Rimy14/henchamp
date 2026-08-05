/**
 * Batch Routes
 */

import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import {
    getAllBatches,
    getBatchesByItem,
    getBatchDetails,
    getItemBatchSummary
} from '../controllers/batch.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Get all batches (with filters)
router.get('/', checkPermission('items:read'), getAllBatches);

// Get batches for a specific item
router.get('/item/:itemId', checkPermission('items:read'), getBatchesByItem);

// Get item batch summary
router.get('/item/:itemId/summary', checkPermission('items:read'), getItemBatchSummary);

// Get batch details with consumption history
router.get('/:id', checkPermission('items:read'), getBatchDetails);

export default router;
