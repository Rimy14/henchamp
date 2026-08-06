/**
 * Test Paystack Webhook Callback
 *
 * B4
 *
 * Simulates:
 *
 * Paystack
 *    |
 *    ↓
 * webhook
 *    |
 *    ↓
 * payment success
 *    |
 *    ↓
 * invoice paid
 *    |
 *    ↓
 * subscriber restored
 */


import {
    processPaystackWebhook
}
from '../server/services/payment/paystack/webhook.service.js';



async function main(){


    console.log(
        "Starting Paystack webhook test..."
    );



    try {


        const payload = {


            event:
            "charge.success",



            data:{

                reference:
                process.env.TEST_PAYSTACK_REFERENCE ||
                "ISP-PAY-TEST-001"

            }


        };



        const result =
        await processPaystackWebhook(
            payload
        );



        console.log(
            "Webhook Result:"
        );


        console.log(result);



    }
    catch(error){


        console.error(
            "Webhook test failed:",
            error
        );


    }


}



main();