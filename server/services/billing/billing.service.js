/**
 * Billing Engine
 *
 * Implements:
 * B1 Recurring subscriptions
 * B2 Auto suspend / restore preparation
 *
 */


import * as lifecycle from '../isp/lifecycle.service.js';

import {
    createSubscriptionPeriod
}
from './subscription.service.js';


import {
    createISPInvoice
}
from './invoice.service.js';


import {
    query
}
from '../../config/database.js';



export async function runBillingCycle(){

    console.log(
        "Starting ISP billing cycle..."
    );


    const subscribers =
        await lifecycle.getBillableSubscribers();



    let processed = 0;


    for(const subscriber of subscribers){

        try {

            const result =
                await processSubscriberBilling(
                    subscriber
                );


            if(result){
                processed++;
            }


        }
        catch(error){

            console.error(
                "Billing failed:",
                subscriber.id,
                error.message
            );

        }

    }



    return {

        processed

    };

}





export async function processSubscriberBilling(
    subscriber
){


    /*
       Prevent duplicate billing
    */

    const existingSubscription =
        await query(
            `
            SELECT id
            FROM isp_subscriptions
            WHERE subscriber_id=?
            AND period_start=?
            `,
            [
                subscriber.id,
                subscriber.billing_cycle_end
            ]
        );


    if(existingSubscription.length){

        console.log(
            `Skipping ${subscriber.subscriber_code}, already billed`
        );

        return null;

    }



    const invoice =
        await createISPInvoice({

            customerId:
            subscriber.customer_id,

            subscriberId:
            subscriber.id,

            amount:
            subscriber.package_price,

            packageName:
            subscriber.package_name

        });



    const subscription =
        await createSubscriptionPeriod({

            subscriberId:
            subscriber.id,

            packageId:
            subscriber.package_id,


            periodStart:
            subscriber.billing_cycle_end,


            periodEnd:
            calculateNextPeriod(
                subscriber.billing_cycle_end,
                subscriber.validity_days
            ),


            amount:
            subscriber.package_price,


            invoiceRef:
            invoice.invoiceNumber

        });



    return {

        invoice,

        subscription

    };

}





function calculateNextPeriod(
    currentDate,
    days=30
){

    const date =
    new Date(currentDate);



    date.setDate(
        date.getDate()+days
    );


    return date
    .toISOString()
    .slice(0,10);

}