/**
 * M-Pesa Callback Service
 *
 * B6 Reusable Payment Flow:
 *
 * Daraja Callback
 *        |
 *        v
 * Normalize callback
 *        |
 *        v
 * Complete reusable payment
 *        |
 *        v
 * payments table
 *        |
 *        v
 * ISP completion (if ISP payment)
 *
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


import {
    completeReusablePayment
}
from '../payment-handler.service.js';



export async function processMpesaCallback(data){


    const callbackResult =
    await completeReusablePayment({

        payload:data,

        provider:'MPESA'

    });



    const normalized =
    callbackResult.normalized;



    if(!normalized){

        throw new Error(
            "Unable to normalize M-Pesa callback"
        );

    }



    /**
     * Check ISP mapping
     *
     * Existing ISP module support
     */

    const ispPayments =
    await query(
        `
        SELECT *
        FROM isp_payments
        WHERE checkout_request_id=?
        LIMIT 1
        `,
        [
            normalized.checkoutRequestId
        ]
    );



    /**
     * Generic B6 payment
     *
     * No ISP mapping required
     */

    if(!ispPayments.length){

        return {

            success:
            callbackResult.status === 'success',

            payment:
            callbackResult

        };

    }



    const ispPayment =
    ispPayments[0];



    /**
     * Duplicate protection
     */

    if(
        ispPayment.status === 'success'
    ){

        return {

            success:true,

            message:
            "ISP payment already processed"

        };

    }




    if(normalized.resultCode === 0){



        await query(
            `
            UPDATE isp_payments
            SET
                status='success',
                mpesa_receipt=?
            WHERE id=?
            `,
            [

                normalized.receipt,

                ispPayment.id

            ]
        );



        await markInvoicePaid(

            ispPayment.sale_id,

            normalized.receipt

        );



        await restoreSubscriber(

            ispPayment.subscriber_id

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

                normalized.resultDescription ||
                'Payment failed',

                ispPayment.id

            ]
        );


    }



    return {


        success:
        normalized.resultCode === 0,


        payment:
        callbackResult


    };


}