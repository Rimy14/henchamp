/**
 * ISP Billing Lifecycle Job
 *
 * B2:
 * - move expired subscriptions to grace
 * - suspend expired grace subscribers
 */


import * as lifecycle 
from '../isp/lifecycle.service.js';



export async function runBillingLifecycle(){


    console.log(
        "Starting ISP billing lifecycle..."
    );


    let graceProcessed = 0;
    let suspended = 0;



    /*
        Find subscribers whose billing cycle ended
    */

    const expired =
        await lifecycle.getBillableSubscribers({
            statuses:[
                'active'
            ]
        });



    for(const subscriber of expired){


        await lifecycle.setGrace(
            subscriber.id,
            {
                until:
                    addGraceDays(7),

                reason:
                    'payment overdue'
            }
        );


        graceProcessed++;

    }



    /*
        Suspend subscribers whose grace expired
    */


    const graceExpired =
        await lifecycle.getExpiredGraceSubscribers();



    for(const subscriber of graceExpired){


        await lifecycle.suspendSubscriber(
            subscriber.id,
            {
                reason:
                    'grace period expired'
            }
        );


        suspended++;

    }



    return {

        graceProcessed,

        suspended

    };

}




function addGraceDays(days){

    const date =
        new Date();


    date.setDate(
        date.getDate()+days
    );


    return date;

}