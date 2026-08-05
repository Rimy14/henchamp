import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import * as batchAdjustmentController from '../controllers/batch-adjustment.controller.js';

const router = express.Router();

router.use(verifyToken);

// Get all adjustments
router.get('/', batchAdjustmentController.getAllAdjustments);

// Batch-wise stock adjustments
router.post('/batch', batchAdjustmentController.createBatchAdjustment);
router.get('/batches', batchAdjustmentController.getBatchesForItem);
router.get('/:id', batchAdjustmentController.getAdjustmentWithBatches);

export default router;
