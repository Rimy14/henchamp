/**
 * Generic Daraja Payment Events
 *
 * Stores completed Daraja payments
 * for any integrated platform.
 */

import { query } from '../../../config/database.js';


export async function createPaymentEvent({

    provider='MPESA',

    reference,

    payload

}) {


    await query(
    `
    INSERT INTO payment_events
    (
        provider,
        reference,
        payload
    )

    VALUES
    (
        ?,
        ?,
        ?
    )
    `,
    [

        provider,

        reference,

        JSON.stringify(payload)

    ]
    );


}