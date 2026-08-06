/**
 * POS Payment Creation Test
 *
 * Simulates a future physical POS terminal.
 *
 * Flow:
 *
 * POS Terminal
 *      |
 *      ↓
 * Create Payment
 *      |
 *      ↓
 * isp_payments pending
 *
 */


import {
    createPOSTransaction
}
from '../server/services/payment/pos/transaction.service.js';



async function main(){


    console.log(
        'Starting POS payment test...'
    );



    const result =
    await createPOSTransaction({

        subscriberId:1,

        saleId:17,

        amount:2500

    });



    console.log(
        'POS Payment Result:'
    );


    console.log(result);


}



main()
.catch(error=>{

    console.error(
        'POS payment test failed:',
        error
    );

    process.exit(1);

});