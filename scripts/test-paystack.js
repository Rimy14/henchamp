/**
 * Test Paystack Payment Initialization
 *
 * B4
 *
 * Tests:
 * - payment creation
 * - isp_payments record creation
 * - reference generation
 */


import {
    createPaystackPayment
}
from '../server/services/payment/paystack/transaction.service.js';



async function main(){


    console.log(
        "Starting Paystack payment test..."
    );


    try {


        const result =
        await createPaystackPayment({

            subscriberId:1,

            saleId:17,

            email:
            "customer@test.com",

            amount:
            2500

        });



        console.log(
            "Paystack Result:"
        );


        console.log(result);



    }
    catch(error){


        console.error(
            "Paystack test failed:",
            error
        );


    }


}



main();