/**
 * B6 Daraja Reusable Integration Test
 *
 * Simulates another system using Daraja.
 *
 * Example:
 *
 * Ticketing System
 *        |
 *        ↓
 * HenChamp Daraja Service
 *        |
 *        ↓
 * M-Pesa
 */


import {
    createDarajaPayment
}
from '../server/services/payment/daraja/daraja.service.js';



async function main(){


    console.log(
        'Starting reusable Daraja payment test...'
    );



    const result =
    await createDarajaPayment({

        amount:500,

        phone:'254712345678',

        accountReference:'TICKET-001',

        transactionDesc:'Concert Ticket Payment',


        metadata:{

            platform:'ticketing',

            customerId:'CUSTOMER-001'

        }

    });



    console.log(
        'Daraja Result:'
    );


    console.log(result);


}



main()
.catch(error=>{

    console.error(
        'Daraja reusable test failed:',
        error
    );


    process.exit(1);

});