/**
 * ISP Background Jobs
 *
 * Periodic tasks:
 *
 *   accounting-ingest  radacct -> isp_sessions -> isp_usage_daily   (A6)
 *   session-reaper     close sessions that stopped reporting
 *   voucher-expiry     expire vouchers past validity window
 *   billing-cycle      generate recurring ISP subscription invoices (B1)
 *   billing-lifecycle  overdue/grace/suspension handling (B2)
 *
 * Deliberately uses setInterval instead of cron.
 *
 * ⚠️ SINGLE-PROCESS ASSUMPTION.
 * If the app runs under PM2 cluster mode or multiple hosts,
 * move these jobs behind a lock/queue system.
 */


import logger from '../utils/logger.js';

import * as accounting from '../services/isp/accounting.service.js';
import * as voucherService from '../services/isp/voucher.service.js';


import {
    runBillingCycle
}
from '../services/billing/billing.service.js';


import {
    runBillingLifecycle
}
from '../services/billing/lifecycle.job.js';



const timers = [];

let running = false;



function guard(name, fn){

    return async()=>{

        const started = Date.now();


        try{

            const result =
                await fn();


            const ms =
                Date.now()-started;



            if(result && hasWork(result)){


                logger.info(
                    `ISP job "${name}" completed`,
                    {
                        ...result,
                        ms
                    }
                );


            }
            else{


                logger.debug(
                    `ISP job "${name}" idle`,
                    {
                        ms
                    }
                );

            }


        }
        catch(error){


            logger.error(
                `ISP job "${name}" failed`,
                {
                    error:error.message,
                    stack:error.stack
                }
            );

        }


    };


}





function hasWork(result){

    return Object.entries(result)
        .some(
            ([key,value])=>

                key !== 'watermark'
                &&
                typeof value === 'number'
                &&
                value > 0

        );

}





function schedule(
    name,
    intervalMs,
    fn
){


    const job =
        guard(name,fn);



    const kickoff =
        setTimeout(
            job,
            5000
        );



    const timer =
        setInterval(
            job,
            intervalMs
        );



    if(typeof timer.unref==='function')
        timer.unref();


    if(typeof kickoff.unref==='function')
        kickoff.unref();



    timers.push(
        timer,
        kickoff
    );



    logger.info(
        `ISP job "${name}" scheduled`,
        {
            everyMs:intervalMs
        }
    );

}





export function startIspJobs(){


    if(process.env.ISP_JOBS_ENABLED !== 'true'){


        logger.info(
            'ISP background jobs disabled (set ISP_JOBS_ENABLED=true to enable)'
        );


        return false;

    }



    if(running){

        logger.warn(
            'ISP background jobs already running'
        );


        return false;

    }



    const accountingInterval =
        parseInt(
            process.env.ISP_ACCOUNTING_INTERVAL_MS || '60000',
            10
        );



    const reaperInterval =
        parseInt(
            process.env.ISP_REAPER_INTERVAL_MS || '300000',
            10
        );



    const billingInterval =
        parseInt(
            process.env.ISP_BILLING_INTERVAL_MS || '86400000',
            10
        );



    const lifecycleInterval =
        parseInt(
            process.env.ISP_LIFECYCLE_INTERVAL_MS || '3600000',
            10
        );




    schedule(
        'accounting-ingest',
        accountingInterval,
        () =>
            accounting.ingestAccounting()
    );



    schedule(
        'session-reaper',
        reaperInterval,
        () =>
            accounting.reapStaleSessions()
    );



    schedule(
        'voucher-expiry',
        reaperInterval,
        () =>
            voucherService.expireDueVouchers()
    );



    // B1
    schedule(
        'billing-cycle',
        billingInterval,
        () =>
            runBillingCycle()
    );



    // B2
    schedule(
        'billing-lifecycle',
        lifecycleInterval,
        () =>
            runBillingLifecycle()
    );



    running=true;


    return true;

}





export function stopIspJobs(){


    for(const timer of timers){

        clearInterval(timer);
        clearTimeout(timer);

    }


    timers.length=0;


    running=false;


    logger.info(
        'ISP background jobs stopped'
    );

}




export function isRunning(){

    return running;

}