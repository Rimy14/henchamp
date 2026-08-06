import {
    query
}
from '../../config/database.js';


import {
    createDarajaPayment
}
from '../payment/daraja/daraja.service.js';



export async function createTicketPayment(data){


    const reference =
        `TICKET-${Date.now()}`;



    const darajaResponse =
    await createDarajaPayment({

        phone:data.phone,

        amount:data.amount,

        reference

    });



    await query(
    `
    INSERT INTO payments
    (
        provider,
        purpose,
        reference,
        amount,
        phone,
        checkout_request_id,
        status
    )

    VALUES
    (
        'DARAJA',
        'TICKET',
        ?,
        ?,
        ?,
        ?,
        'pending'
    )
    `,
    [

        reference,

        data.amount,

        data.phone,

        darajaResponse.checkoutRequestId

    ]
    );



    return darajaResponse;

}