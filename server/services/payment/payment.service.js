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


    const response =
    await sendSTKPush({

        phone,

        amount,

        invoiceNumber

    });



    await query(
        `
        INSERT INTO isp_payments
        (
            subscriber_id,
            sale_id,
            payment_provider,
            checkout_request_id,
            merchant_request_id,
            phone,
            amount
        )

        VALUES
        (?,?,?,?,?,?,?)
        `,
        [

            subscriberId,

            saleId,

            'MPESA',

            response.checkoutRequestId,

            response.merchantRequestId,

            phone,

            amount

        ]
    );



    return response;


}