import {
    processMpesaCallback
}
from '../../server/services/payment/daraja/callback.service.js';



async function testMpesaCallback(){


    const response =
    await processMpesaCallback({

        Body: {

            stkCallback: {

                CheckoutRequestID:
                "MOCK-CHECKOUT-1785997214672",


                ResultCode:0,


                CallbackMetadata: {

                    Item:[

                        {
                            Name:"MpesaReceiptNumber",
                            Value:"TEST12345"
                        }

                    ]

                }

            }

        }

    });



    console.log(response);

}



testMpesaCallback();