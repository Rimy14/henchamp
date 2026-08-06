import express from 'express';


import {
    createMpesaPayment
} from '../services/payment/payment.service.js';


import {
    processMpesaCallback
} from '../services/payment/daraja/callback.service.js';


import {
    createDarajaPayment
} from '../services/payment/daraja/daraja.service.js';


import {
    createPaystackPayment
} from '../services/payment/paystack/transaction.service.js';


import {
    processPaystackWebhook
} from '../services/payment/paystack/webhook.service.js';


import {
    createPOSTransaction
} from '../services/payment/pos/transaction.service.js';


import {
    processPOSWebhook
} from '../services/payment/pos/webhook.service.js';


import {
    query
} from '../config/database.js';



const router = express.Router();



// =====================================================
// M-PESA ISP STK PUSH
// =====================================================

router.post(
    '/mpesa/stk',
    async (req, res) => {

        try {

            const result =
                await createMpesaPayment(
                    req.body
                );


            res.json(result);


        } catch(error) {

            console.error(
                'M-Pesa STK error:',
                error
            );


            res.status(500).json({
                success:false,
                message:error.message
            });

        }

    }
);




// =====================================================
// M-PESA CALLBACK
// =====================================================

router.post(
    '/mpesa/callback',
    async(req,res)=>{

        try {


            await processMpesaCallback(
                req.body
            );


            res.json({

                ResultCode:0,

                ResultDesc:"Accepted"

            });


        } catch(error){


            console.error(
                'M-Pesa callback error:',
                error
            );


            res.status(500).json({
                success:false,
                message:error.message
            });

        }

    }
);





// =====================================================
// GENERIC DARAJA STK
// =====================================================

router.post(
    '/daraja/stk',
    async(req,res)=>{

        try {

            const result =
                await createDarajaPayment(
                    req.body
                );


            res.json(result);


        } catch(error){

            res.status(500).json({
                success:false,
                message:error.message
            });

        }

    }
);





// =====================================================
// PAYSTACK
// =====================================================

router.post(
    '/paystack/initiate',
    async(req,res)=>{

        try {


            const result =
                await createPaystackPayment(
                    req.body
                );


            res.json(result);


        } catch(error){


            res.status(500).json({
                success:false,
                message:error.message
            });

        }

    }
);





router.post(
    '/paystack/webhook',
    async(req,res)=>{

        try {


            const result =
                await processPaystackWebhook(
                    req.body
                );


            res.json(result);


        } catch(error){


            res.status(500).json({
                success:false,
                message:error.message
            });

        }

    }
);







// =====================================================
// POS TERMINAL
// =====================================================

router.post(
    '/pos/create',
    async(req,res)=>{

        try {


            const result =
                await createPOSTransaction(
                    req.body
                );


            res.json(result);


        } catch(error){


            res.status(500).json({
                success:false,
                message:error.message
            });

        }

    }
);






router.post(
    '/pos/webhook',
    async(req,res)=>{

        try {


            const result =
                await processPOSWebhook(
                    req.body
                );


            res.json(result);


        } catch(error){


            res.status(500).json({
                success:false,
                message:error.message
            });

        }

    }
);







// =====================================================
// PAYMENT HISTORY
// =====================================================

router.get(
    '/isp',
    async(req,res)=>{

        try {


            const rows =
                await query(
                `
                SELECT
                    id,
                    payment_provider,
                    transaction_reference,
                    checkout_request_id,
                    amount,
                    status,
                    created_at
                FROM isp_payments
                ORDER BY id DESC
                LIMIT 50
                `
                );


            res.json({

                success:true,

                data:rows

            });


        } catch(error){


            console.error(
                'Payment history error:',
                error
            );


            res.status(500).json({

                success:false,

                message:error.message

            });

        }

    }
);






export default router;