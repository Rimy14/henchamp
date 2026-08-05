import express from 'express';

import {
    createMpesaPayment
}
from '../services/payment/payment.service.js';


import {
    processMpesaCallback
}
from '../services/payment/daraja/callback.service.js';



const router =
express.Router();



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



export default router;