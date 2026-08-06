/**
 * ISP Payment Completion
 *
 * Common workflow after successful payment.
 *
 * payments
 *      |
 *      v
 * invoice paid
 *      |
 *      v
 * subscriber restored
 */


import {
    markInvoicePaid
}
from "../billing/invoice.service.js";


import {
    restoreSubscriber
}
from "./lifecycle.service.js";



export async function completeISPPayment(payment){


    console.log(
        "Completing ISP payment",
        payment.id
    );


    await markInvoicePaid(

        payment.sale_id,

        payment.mpesa_receipt ||
        payment.transaction_reference

    );



    await restoreSubscriber(

        payment.subscriber_id

    );



    return {

        success:true

    };

}