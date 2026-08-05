import { runBillingCycle } 
from '../server/services/billing/billing.service.js';

async function main() {
    try {
        console.log("Starting ISP billing cycle...");

        const result = await runBillingCycle();

        console.log("Billing result:");
        console.log(result);

    } catch (error) {
        console.error("Billing failed:");
        console.error(error);
    }

    process.exit(0);
}

main();