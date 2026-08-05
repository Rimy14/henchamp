/**
 * BOM (Bill of Materials) Routes
 */

import express from 'express';
import * as bomController from '../controllers/bom.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { validateBOMCreate, validateBOMUpdate, validateId } from '../middleware/validation.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Get all BOMs
router.get('/', bomController.getAllBOMs);

// Get finished goods (for BOM creation)
router.get('/finished-goods', bomController.getFinishedGoods);

// Get raw materials (for BOM creation)
router.get('/raw-materials', bomController.getRawMaterials);

// Get BOM by finished good ID
router.get('/finished-good/:itemId', bomController.getBOMByFinishedGood);

// Get single BOM by ID
router.get('/:id', validateId, bomController.getBOMById);

// Create new BOM
router.post('/', validateBOMCreate, bomController.createBOM);

// Update BOM
router.put('/:id', validateBOMUpdate, bomController.updateBOM);

// Update BOM Status
router.patch('/:id/status', validateId, bomController.updateBOMStatus);

// Delete BOM
router.delete('/:id', validateId, bomController.deleteBOM);

export default router;

