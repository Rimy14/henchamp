/**
 * Production Routes
 */

import express from 'express';
import * as productionController from '../controllers/production.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { validateProductionCreate, validateProductionStatus, validateId } from '../middleware/validation.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Get material requirements for production
router.get('/calculate-requirements', productionController.calculateRequirements);

// Get all production records
router.get('/', productionController.getAllProduction);

// Get single production record
router.get('/:id', validateId, productionController.getProductionById);

// Create new production
router.post('/', validateProductionCreate, productionController.createProduction);

// Update production status
router.patch('/:id/status', validateProductionStatus, productionController.updateProductionStatus);

// Delete production record
router.delete('/:id', validateId, productionController.deleteProduction);

export default router;

