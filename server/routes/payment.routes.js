import express from 'express';


import {
    createMpesaPayment
}
from '../services/payment/payment.service.js';



import {
    processMpesaCallback
}
from '../services/payment/daraja/callback.service.js';



import {
    createPaystackPayment
}
from '../services/payment/paystack/transaction.service.js';



import {
    processPaystackWebhook
}
from '../services/payment/paystack/webhook.service.js';



const router =
express.Router();




// =======================
// DAR AJA
// =======================


router.post(
'/mpesa/stk',
async(req,res)=>{


    const result =
    await createMpesaPayment(
        req.body
    );


    res.json(result);


});




router.post(
'/mpesa/callback',
async(req,res)=>{


    await processMpesaCallback(
        req.body
    );


    res.json({

        ResultCode:0,

        ResultDesc:"Accepted"

    });


});




// =======================
// PAYSTACK
// =======================


router.post(
'/paystack/initiate',
async(req,res)=>{


    const result =
    await createPaystackPayment(
        req.body
    );


    res.json(result);


});





router.post(
'/paystack/webhook',
async(req,res)=>{


    const result =
    await processPaystackWebhook(
        req.body
    );


    res.json(result);


});




export default router;