import {
    processMpesaCallback
}
from '../../server/services/payment/daraja/callback.service.js';



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