import express from 'express';
import * as monthlyCostsController from '../controllers/monthly_costs.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';

const router = express.Router();

router.use(verifyToken);

// Category Management Routes
router.get('/categories', monthlyCostsController.getCategories);
router.post('/categories', monthlyCostsController.createCategory);
router.patch('/categories/toggle/:id', checkPermission('reports:read'), monthlyCostsController.toggleCategoryStatus);

// Monthly Cost Entries Routes
router.get('/', monthlyCostsController.getAllMonthlyCosts);
router.post('/', monthlyCostsController.addMonthlyCost);
router.patch('/void/:id', checkPermission('reports:read'), monthlyCostsController.voidMonthlyCost);

export default router;