import {
    query
}
from '../../config/database.js';


import {
    sendSTKPush
}
from './daraja/stk.service.js';



export async function createMpesaPayment({

    subscriberId,

    saleId,

    phone,

    amount,

    invoiceNumber

}){


    /**
     * Common payment reference
     *
     * Used across:
     *
     * ISP
     * Ticketing
     * Store
     */

    const reference =
        invoiceNumber ||
        `ISP-${Date.now()}`;




    /**
     * Create Daraja STK Push
     */

    const response =
    await sendSTKPush({

        phone,

        amount,

        invoiceNumber:reference

    });





    /**
     * COMMON PAYMENT LEDGER
     *
     * Every system uses this table:
     *
     * ISP
     * TICKETS
     * STORE
     */

    await query(
        `
        INSERT INTO payments
        (
            provider,
            purpose,
            reference,
            amount,
            phone,
            status,
            checkout_request_id
        )

        VALUES
        (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
        )
        `,
        [

            'DARAJA',

            'ISP',

            reference,

            amount,

            phone,

            'pending',

            response.checkoutRequestId

        ]
    );





    /**
     * ISP SPECIFIC PAYMENT
     *
     * Keeps subscriber billing relation
     */

    await query(
        `
        INSERT INTO isp_payments
        (
            subscriber_id,
            sale_id,
            checkout_request_id,
            merchant_request_id,
            phone,
            amount,
            status
        )

        VALUES
        (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
        )
        `,
        [

            subscriberId,

            saleId,

            response.checkoutRequestId,

            response.merchantRequestId,

            phone,

            amount,

            'pending'

        ]
    );





    return {

        success:true,

        reference,

        checkoutRequestId:
        response.checkoutRequestId

    };


}