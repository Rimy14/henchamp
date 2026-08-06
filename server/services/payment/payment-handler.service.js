import {
    completeISPPayment
}
from '../isp/payment-completion.service.js';


import {
    completeTicketPayment
}
from '../ticketing/ticket-payment.service.js';



import {
    query
}
from '../../config/database.js';



export async function handleSuccessfulPayment(payment){


    console.log(
        "Processing payment:",
        payment.purpose
    );



    switch(payment.purpose){


        // ==================================
        // ISP PAYMENT
        // ==================================

        case "ISP":


            const ispPayments =
            await query(
                `
                SELECT *
                FROM isp_payments
                WHERE checkout_request_id=?
                LIMIT 1
                `,
                [
                    payment.checkout_request_id
                ]
            );



            if(!ispPayments.length){

                throw new Error(
                    "ISP payment mapping not found"
                );

            }



            await completeISPPayment(
                ispPayments[0]
            );


            break;



        // ==================================
        // TICKET PAYMENT
        // ==================================

        case "TICKET":


            await completeTicketPayment(
                payment
            );


            break;



        // ==================================
        // STORE PAYMENT
        // ==================================

        case "STORE":


            console.log(
                "Store payment completed"
            );


            break;



        default:


            console.log(
                "Unknown payment purpose:",
                payment.purpose
            );

    }


}