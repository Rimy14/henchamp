import { markInvoicePaid } from "../server/services/billing/invoice.service.js";


async function main(){

    await markInvoicePaid(
        17,
        "MPESA-TEST-001"
    );


    console.log("Payment completed");

    process.exit(0);

}


main();