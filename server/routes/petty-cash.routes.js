import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import {
    getCurrentFund,
    openFund,
    closeFund,
    addTransaction,
    voidTransaction,
    getFundTransactions,
    getAllFunds,
    getCategories,
    createCategory,
    toggleCategoryStatus
} from '../controllers/petty-cash.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Category routes
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.patch('/categories/toggle/:id', checkPermission('reports:read'), toggleCategoryStatus);

// Fund routes
router.get('/fund/current', getCurrentFund);
router.post('/fund/open', checkPermission('reports:read'), openFund); // Admins/Coordinators (can read reports)
router.patch('/fund/close/:id', checkPermission('reports:read'), closeFund);
router.get('/funds', checkPermission('reports:read'), getAllFunds);

// Transactions routes
router.get('/transactions', getFundTransactions);
router.post('/transactions', addTransaction); // Cashier can record too
router.patch('/transactions/void/:id', checkPermission('reports:read'), voidTransaction);

export default router;
