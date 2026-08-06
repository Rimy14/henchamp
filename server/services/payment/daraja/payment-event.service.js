import {
    query
}
from '../../../config/database.js';



import {
    completeISPPayment
}
from '../../isp/payment-completion.service.js';



import {
    completeTicketPayment
}
from '../../ticketing/ticket-payment.service.js';



export async function processDarajaPayment(paymentId){


    const rows =
    await query(
        `
        SELECT *
        FROM payments
        WHERE id=?
        `,
        [
            paymentId
        ]
    );


    const payment =
    rows[0];



    if(!payment){

        throw new Error(
            "Payment not found"
        );

    }



    switch(payment.purpose){


        case "ISP":


            await completeISPPayment(
                payment.reference
            );

            break;



        case "TICKET":


            await completeTicketPayment(
                payment.reference
            );

            break;



        default:


            console.log(
                "Unknown payment purpose",
                payment.purpose
            );

    }



}