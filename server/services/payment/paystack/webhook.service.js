/**
 * Paystack Webhook Service
 *
 * Handles successful Paystack payments.
 */


import {
    query
}
from '../../../config/database.js';


import {
    markInvoicePaid
}
from '../../billing/invoice.service.js';



export async function processPaystackWebhook(payload){


    const event =
    payload.event;



    if(event !== 'charge.success'){

        return {
            ignored:true
        };

    }



    const data =
    payload.data;



    const reference =
    data.reference;



    const payments =
    await query(
    `
    SELECT *
    FROM isp_payments
    WHERE transaction_reference=?
    AND payment_provider='PAYSTACK'
    `,
    [
        reference
    ]
    );



    if(!payments.length){

        throw new Error(
            "Paystack payment not found"
        );

    }



    const payment =
    payments[0];



    if(payment.status === 'success'){

        return {

            success:true,

            message:
            "Payment already processed"

        };

    }



    await query(
    `
    UPDATE isp_payments
    SET
        status='success',
        response_message=?

    WHERE id=?
    `,
    [
        'Paystack payment successful',
        payment.id
    ]
    );



    await markInvoicePaid(
        payment.sale_id,
        reference
    );



    return {

        success:true

    };


}