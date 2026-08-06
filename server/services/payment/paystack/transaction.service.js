/**
 * Paystack Transaction Service
 *
 * Handles card payment initialization.
 *
 * Flow:
 *
 * ISP Invoice
 *      |
 *      ↓
 * Paystack Initialize
 *      |
 *      ↓
 * Authorization URL
 *      |
 *      ↓
 * Customer pays
 */


import { query } from '../../../config/database.js';

import {
    getPaystackHeaders
}
from './auth.service.js';





export async function createPaystackPayment({

    subscriberId,

    saleId,

    email,

    amount

}){


    const reference =
    `ISP-PAY-${Date.now()}`;



    /*
        Mock mode

        Used during development.

        Later replace with:
        POST https://api.paystack.co/transaction/initialize
    */


    if(
        process.env.PAYSTACK_ENABLED !== 'true'
    ){


        await query(
        `
        INSERT INTO isp_payments
        (
            subscriber_id,
            sale_id,
            payment_provider,
            transaction_reference,
            phone,
            amount,
            status,
            response_message
        )

        VALUES
        (?,?,?,?,?,?,?,?)
        `,
        [

            subscriberId,

            saleId,

            'PAYSTACK',

            reference,

            email,

            amount,

            'pending',

            'Mock Paystack transaction'

        ]
        );



        return {


            status:true,


            reference,


            authorization_url:
            `http://localhost:3000/mock-paystack/${reference}`


        };


    }





    /*
        Real Paystack API

        Future implementation:

        POST:
        https://api.paystack.co/transaction/initialize

        Headers:
        Authorization: Bearer SECRET_KEY

    */


    return {


        status:false,


        message:
        "Paystack API not enabled"


    };


}