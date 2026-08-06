import express from 'express';

import { createMpesaPayment } from '../services/payment/payment.service.js';
import { processMpesaCallback } from '../services/payment/daraja/callback.service.js';
import { createDarajaPayment } from '../services/payment/daraja/daraja.service.js';
import { createPaystackPayment } from '../services/payment/paystack/transaction.service.js';
import { processPaystackWebhook } from '../services/payment/paystack/webhook.service.js';
import { createPOSTransaction } from '../services/payment/pos/transaction.service.js';
import { processPOSWebhook } from '../services/payment/pos/webhook.service.js';

const router = express.Router();

// =======================
// DARAJA M-PESA ISP
// =======================
router.post('/mpesa/stk', async (req, res) => {
    const result = await createMpesaPayment(req.body);
    res.json(result);
});

router.post('/mpesa/callback', async (req, res) => {
    await processMpesaCallback(req.body);
    res.json({
        ResultCode: 0,
        ResultDesc: 'Accepted'
    });
});

// =======================
// REUSABLE DARAJA API
// =======================
router.post('/daraja/stk', async (req, res) => {
    const result = await createDarajaPayment(req.body);
    res.json(result);
});

// =======================
// PAYSTACK CARD PAYMENT
// =======================
router.post('/paystack/initiate', async (req, res) => {
    const result = await createPaystackPayment(req.body);
    res.json(result);
});

router.post('/paystack/webhook', async (req, res) => {
    const result = await processPaystackWebhook(req.body);
    res.json(result);
});

// =======================
// FUTURE POS TERMINAL
// =======================
router.post('/pos/create', async (req, res) => {
    const result = await createPOSTransaction(req.body);
    res.json(result);
});

router.post('/pos/webhook', async (req, res) => {
    const result = await processPOSWebhook(req.body);
    res.json(result);
});

export default router;
