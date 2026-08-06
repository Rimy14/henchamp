import {
    query
}
from '../../../config/database.js';



export async function createReusableDarajaPayment({

    purpose,

    reference,

    phone,

    amount,

    checkoutRequestId

}){


    await query(
        `
        INSERT INTO payments
        (
            provider,
            purpose,
            reference,
            amount,
            phone,
            status,
            checkout_request_id
        )

        VALUES
        (
            'DARAJA',
            ?,
            ?,
            ?,
            ?,
            'pending',
            ?
        )
        `,
        [

            purpose,

            reference,

            amount,

            phone,

            checkoutRequestId

        ]
    );


    return {

        success:true,

        reference

    };


}