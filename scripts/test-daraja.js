/**
 * Test M-Pesa Daraja STK Push
 *
 * Mock flow:
 *
 * Subscriber
 *      |
 *      v
 * Create Payment Request
 *      |
 *      v
 * Mock Daraja STK Response
 *      |
 *      v
 * Save isp_payments
 */


import dotenv from 'dotenv';

dotenv.config();


import {
    createMpesaPayment
}
from '../server/services/payment/payment.service.js';



async function main(){


    console.log(
        "Starting Daraja STK Push test..."
    );



    const result =
    await createMpesaPayment({

        subscriberId: 1,

        saleId: 17,

        phone:
        "254712345001",

        amount:
        2500,

        invoiceNumber:
        "ISP-1785935542006"

    });



    console.log(
        "STK Push Result:"
    );


    console.log(result);


}



main()
.catch(error=>{

    console.error(
        "Daraja test failed:",
        error
    );

    process.exit(1);

});