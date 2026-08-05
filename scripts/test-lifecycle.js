/**
 * Manual ISP Billing Lifecycle Test
 *
 * Tests:
 * grace expiry -> suspension
 */

import {
    runBillingLifecycle
} from '../server/services/billing/lifecycle.job.js';



async function main(){

    try {

        const result =
            await runBillingLifecycle();


        console.log(
            "Lifecycle result:"
        );


        console.log(result);


        process.exit(0);

    }
    catch(error){

        console.error(
            "Lifecycle failed:",
            error
        );


        process.exit(1);

    }

}


main();