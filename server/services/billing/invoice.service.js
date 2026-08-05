/**
 * ISP Invoice Service
 *
 * Reuses existing POS invoice tables:
 *
 * sales
 * sale_payments
 *
 */


import { query, transaction } from '../../config/database.js';
import {
    restoreSubscriber
}
from '../isp/lifecycle.service.js';


export async function createISPInvoice({
    customerId,
    subscriberId,
    amount,
    packageName,
    cashierId = Number(process.env.ISP_SYSTEM_USER_ID || 1)
}) {


    const invoiceNumber =
        `ISP-${Date.now()}`;



    const result = await query(
        `
        INSERT INTO sales
        (
            invoice_number,
            customer_id,
            cashier_id,
            subtotal,
            total_amount,
            payment_method,
            payment_status,
            status,
            notes
        )
        VALUES
        (
            ?,
            ?,
            ?,
            ?,
            ?,
            NULL,
            'pending',
            'pending',
            ?
        )
        `,
        [
            invoiceNumber,
            customerId,
            cashierId,
            amount,
            amount,
            `ISP Subscription - ${packageName} - Subscriber ${subscriberId}`
        ]
    );


    return {

        saleId: result.insertId,

        invoiceNumber,

        amount

    };

}



export async function getInvoice(invoiceNumber){


    const rows = await query(
        `
        SELECT *
        FROM sales
        WHERE invoice_number=?
        `,
        [
            invoiceNumber
        ]
    );


    return rows[0] || null;

}




export async function markInvoicePaid(
    saleId,
    paymentReference
){

    await transaction(async(conn)=>{


        // 1. Complete POS invoice

        await conn.execute(
        `
        UPDATE sales
        SET
            payment_status='Paid',
            status='completed'
        WHERE id=?
        `,
        [
            saleId
        ]
        );



        // 2. Create payment record

        await conn.execute(
        `
        INSERT INTO sale_payments
        (
            sale_id,
            payment_method,
            amount,
            reference_number,
            notes
        )
        SELECT
            id,
            'Mobile Money',
            total_amount,
            ?,
            'ISP payment'
        FROM sales
        WHERE id=?
        `,
        [
            paymentReference,
            saleId
        ]
        );



    });



    /*
        B2 restore flow

        Payment received
              |
              ↓
        restoreSubscriber()
              |
              ↓
        RADIUS unblock
              |
              ↓
        subscriber active
    */


    const subscriptions =
        await query(
        `
        SELECT subscriber_id
        FROM isp_subscriptions
        WHERE invoice_ref =
        (
            SELECT invoice_number
            FROM sales
            WHERE id=?
        )
        `,
        [
            saleId
        ]
        );



    for(const subscription of subscriptions){


        await restoreSubscriber(
            subscription.subscriber_id,
            {
                reason:'payment received'
            }
        );


    }


}