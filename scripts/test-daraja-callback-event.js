/**
 * B6 Daraja Reusable Callback Event Test
 *
 * Simulates:
 *
 * Safaricom Daraja Callback
 *          |
 *          ↓
 * Generic Payment Event Storage
 *
 * Can be used by:
 * - ISP Billing
 * - Ticketing
 * - Other platforms
 */


import {
    createPaymentEvent
}
from '../server/services/payment/daraja/event.service.js';



async function main(){


    console.log(
        'Starting Daraja callback event test...'
    );



    const mockCallback = {


        provider:'MPESA',


        reference:
            'MOCK-CHECKOUT-1785980850191',



        payload:{

            ResultCode:0,

            ResultDesc:
                'The service request is processed successfully',


            CallbackMetadata:{

                MpesaReceiptNumber:
                    'TEST-MPESA-001',


                Amount:
                    500,


                Phone:
                    '254712345678'

            },


            metadata:{

                platform:'ticketing',

                transactionId:'TICKET-001'

            }

        }


    };




    await createPaymentEvent({

        provider:
            mockCallback.provider,


        reference:
            mockCallback.reference,


        payload:
            mockCallback.payload

    });




    console.log(
        'Daraja Callback Event Stored'
    );



    console.log({

        provider:
            mockCallback.provider,


        reference:
            mockCallback.reference,


        platform:
            mockCallback.payload.metadata.platform

    });


}



main()
.catch(error=>{


    console.error(
        'Daraja callback event test failed:',
        error
    );


    process.exit(1);


});