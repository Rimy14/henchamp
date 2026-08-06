/**
 * M-Pesa Callback Service
 *
 * Handles Safaricom Daraja callback.
 *
 * Flow:
 *
 * Daraja Callback
 *        |
 *        v
 * payments table
 *        |
 *        v
 * payment-handler.service.js
 *        |
 *        +----------------+
 *        |                |
 *        v                v
 *      ISP Billing     Ticketing
 *
 */


import {
    query
}
from '../../../config/database.js';



import {
    handleSuccessfulPayment
}
from '../payment-handler.service.js';




export async function processMpesaCallback(data){


    try{


        console.log(
            "M-Pesa callback received",
            JSON.stringify(data)
        );



        const callback =
            data?.Body?.stkCallback;



        if(!callback){

            throw new Error(
                "Invalid M-Pesa callback"
            );

        }



        const {

            CheckoutRequestID,

            ResultCode

        } = callback;




        let MpesaReceiptNumber = null;



        if(callback.CallbackMetadata?.Item){


            const receipt =
            callback.CallbackMetadata.Item.find(
                item =>
                item.Name === "MpesaReceiptNumber"
            );


            MpesaReceiptNumber =
                receipt?.Value || null;


        }




        const payments =
        await query(
            `
            SELECT *
            FROM payments
            WHERE checkout_request_id=?
            LIMIT 1
            `,
            [
                CheckoutRequestID
            ]
        );



        if(!payments.length){


            throw new Error(
                "Payment record not found"
            );

        }



        const payment =
            payments[0];




        /**
         * Prevent duplicate callbacks
         */

        if(payment.status === 'success'){


            return {

                success:true,

                message:
                "Payment already processed"

            };

        }





        /**
         * Successful payment
         */

        if(ResultCode === 0){



            await query(
                `
                UPDATE payments
                SET
                    status='success',
                    mpesa_receipt=?
                WHERE id=?
                `,
                [

                    MpesaReceiptNumber,

                    payment.id

                ]
            );


            console.log(
                "Sending payment to handler:",
                 payment
                );

            /**
             * Send to business module
             *
             * ISP:
             *   invoice paid
             *   subscriber restored
             *
             * Ticket:
             *   ticket activated
             */

            await handleSuccessfulPayment(

                {
                    id: payment.id,

                    ...payment,

                    status:'success',

                    mpesa_receipt:
                    MpesaReceiptNumber

                }

            );




            console.log(
                "M-Pesa payment completed:",
                payment.id
            );



        }

        else {



            await query(
                `
                UPDATE payments
                SET
                    status='failed'
                WHERE id=?
                `,
                [

                    payment.id

                ]
            );



            console.log(
                "M-Pesa payment failed:",
                payment.id
            );


        }




        return {

            success:
            ResultCode === 0

        };



    }
    catch(error){


        console.error(
            "M-Pesa callback error:",
            error
        );


        throw error;

    }


}