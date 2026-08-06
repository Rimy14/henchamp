import {
    processMpesaCallback
}
from '../../server/services/payment/daraja/callback.service.js';
import { query } from '../../server/config/database.js';

const checkoutRequestId =
    "MOCK-CHECKOUT-1786003541369";



const payload = {

    Body: {

        stkCallback: {

            CheckoutRequestID:
                checkoutRequestId,


            ResultCode:0,


            ResultDesc:
                "The service request is processed successfully",


            CallbackMetadata: {

                Item: [

                    {
                        Name:"Amount",
                        Value:1500
                    },

                    {
                        Name:"MpesaReceiptNumber",
                        Value:"TEST12345"
                    },

                    {
                        Name:"PhoneNumber",
                        Value:254712345001
                    }

                ]

            }

        }

    }

};




async function testMpesaCallback(){
    try {
        // Insert mock payment record
        await query(
            `INSERT INTO payments (provider, purpose, reference, amount, phone, status, checkout_request_id)
             VALUES ('MPESA', 'GENERIC', 'test-ref', 1500, '254712345001', 'pending', ?)`,
            [checkoutRequestId]
        );

        console.log(
            "Sending callback:",
            payload.Body.stkCallback.CheckoutRequestID
        );

        const result =
        await processMpesaCallback(
            payload
        );

        console.log(
            "Callback result:",
            result
        );

        // Cleanup mock payment record
        await query(`DELETE FROM payments WHERE checkout_request_id = ?`, [checkoutRequestId]);
        process.exit(0);
    }
    catch(error){


        console.error(
            "Callback failed:",
            error
        );


        process.exit(1);

    }


}



testMpesaCallback();