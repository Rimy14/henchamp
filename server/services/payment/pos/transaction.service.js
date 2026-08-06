/**
 * POS Card Transaction Service
 *
 * Future physical terminal integration.
 *
 * Current mode:
 * Mock terminal response.
 *
 * Future:
 * Replace with terminal SDK/API call.
 */

import { query } from '../../../config/database.js';



export async function createPOSTransaction({

    subscriberId,

    saleId,

    amount

}) {


    const reference =
        `POS-${Date.now()}`;



    await query(
    `
    INSERT INTO isp_payments
    (
        subscriber_id,
        sale_id,
        payment_provider,
        transaction_reference,
        amount,
        phone,
        status,
        response_message
    )

    VALUES
    (
        ?,
        ?,
        'POS',
        ?,
        ?,
        'POS_TERMINAL',
        'pending',
        'Waiting for card terminal payment'
    )
    `,
    [

        subscriberId,

        saleId,

        reference,

        amount

    ]
    );



    return {

        success:true,

        reference,

        message:
        'Send transaction to POS terminal'

    };

}