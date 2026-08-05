/**
 * M-Pesa Callback Service
 *
 * Handles Safaricom Daraja callback.
 *
 * Flow:
 *
 * Daraja Callback
 *        |
 *        v
 * isp_payments
 *        |
 *        v
 * sales invoice
 *        |
 *        v
 * ISP subscription
 *        |
 *        v
 * Subscriber restore
 */


import {
    query
}
from '../../../config/database.js';


import {
    markInvoicePaid
}
from '../../billing/invoice.service.js';


import {
    restoreSubscriber
}
from '../../isp/lifecycle.service.js';



export async function processMpesaCallback(data){


    const {

        CheckoutRequestID,

        ResultCode,

        MpesaReceiptNumber


    } = data;



    const payments =
    await query(
        `
        SELECT *
        FROM isp_payments
        WHERE checkout_request_id=?
        `,
        [
            CheckoutRequestID
        ]
    );



    if(!payments.length){

        throw new Error(
            "Payment record not found"
        );

    }



    const payment =
    payments[0];



    /**
     * Duplicate callback protection
     *
     * Safaricom can resend callbacks.
     */
    if(payment.status === 'success'){

        return {

            success:true,

            message:
            "Payment already processed"

        };

    }



    if(ResultCode === 0){



        await query(
            `
            UPDATE isp_payments
            SET
                status='success',
                mpesa_receipt=?
            WHERE id=?
            `,
            [

                MpesaReceiptNumber,

                payment.id

            ]
        );



        await markInvoicePaid(

            payment.sale_id,

            MpesaReceiptNumber

        );



        await restoreSubscriber(

            payment.subscriber_id

        );



    }
    else {



        await query(
            `
            UPDATE isp_payments
            SET
                status='failed',
                response_message=?
            WHERE id=?
            `,
            [

                "Payment failed",

                payment.id

            ]
        );


    }



    return {


        success:
        ResultCode === 0


    };


}