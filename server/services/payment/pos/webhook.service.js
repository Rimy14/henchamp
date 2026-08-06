import { query } from '../../../config/database.js';

import {
    markInvoicePaid
}
from '../../billing/invoice.service.js';



export async function processPOSWebhook(payload){


    const {

        reference,

        status

    } = payload;



    const payments =
    await query(
    `
    SELECT *
    FROM isp_payments
    WHERE transaction_reference=?
    AND payment_provider='POS'
    `,
    [
        reference
    ]
    );



    if(!payments.length){

        throw new Error(
            'POS payment not found'
        );

    }



    const payment =
    payments[0];



    if(status !== 'success'){

        await query(
        `
        UPDATE isp_payments
        SET status='failed'
        WHERE id=?
        `,
        [
            payment.id
        ]
        );


        return {
            success:false
        };

    }



    await query(
    `
    UPDATE isp_payments
    SET
        status='success',
        response_message='POS payment completed'
    WHERE id=?
    `,
    [
        payment.id
    ]
    );



    await markInvoicePaid(
        payment.sale_id,
        reference,
        'Card'
    );



    return {

        success:true

    };

}