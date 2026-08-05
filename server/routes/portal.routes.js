import express from 'express';
import {
    customerLogin,
    getCustomerProfile,
    getCustomerInvoices,
    placeCustomerOrder
} from '../controllers/portal.controller.js';

const router = express.Router();

// Public route for customer login
router.post('/login', customerLogin);

// Protected routes (require customerToken cookie)
router.get('/profile', getCustomerProfile);
router.get('/invoices', getCustomerInvoices);
router.post('/orders', placeCustomerOrder);

export default router;
