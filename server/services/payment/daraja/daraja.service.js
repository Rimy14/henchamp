/**
 * Reusable Daraja Payment Service
 *
 * Shared by:
 *
 * ISP Billing
 * Ticketing
 * Other platforms
 *
 */


import {
    sendSTKPush
}
from './stk.service.js';



export async function createDarajaPayment({

    amount,

    phone,

    accountReference,

    transactionDesc,

    metadata = {}

}) {


    const result =
    await sendSTKPush({

        amount,

        phone,

        accountReference,

        transactionDesc

    });



    return {


        success:true,

        provider:'MPESA',


        checkoutRequestId:
            result.checkoutRequestId,


        merchantRequestId:
            result.merchantRequestId,


        metadata


    };


}