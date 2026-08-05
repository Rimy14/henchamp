/**
 * Test M-Pesa Callback
 *
 * Automatically uses latest pending payment.
 */


import dotenv from 'dotenv';

dotenv.config();


import {
    query
}
from '../server/config/database.js';


import {
    processMpesaCallback
}
from '../server/services/payment/daraja/callback.service.js';



async function main(){


    console.log(
        "Starting M-Pesa callback test..."
    );



    const payments =
    await query(
        `
        SELECT
            checkout_request_id
        FROM isp_payments
        ORDER BY id DESC
        LIMIT 1
        `
    );



    if(!payments.length){

        throw new Error(
            "No payment found"
        );

    }



    const checkoutId =
    payments[0].checkout_request_id;



    console.log(
        "Using checkout:",
        checkoutId
    );



    const result =
    await processMpesaCallback({

        CheckoutRequestID:
        checkoutId,


        ResultCode:
        0,


        MpesaReceiptNumber:
        "TEST-MPESA-001"

    });



    console.log(
        "Callback Result:"
    );


    console.log(result);


}



main()
.catch(error=>{

    console.error(
        "Callback test failed:",
        error.message
    );


    process.exit(1);

});