/**
 * POS Webhook Test
 *
 * Simulates card terminal callback.
 */


import {
    processPOSWebhook
}
from '../server/services/payment/pos/webhook.service.js';



async function main(){


    console.log(
        'Starting POS webhook test...'
    );



    const reference =
    process.env.TEST_POS_REFERENCE;



    if(!reference){

        throw new Error(
            'TEST_POS_REFERENCE missing'
        );

    }



    const result =
    await processPOSWebhook({

        reference,

        status:'success'

    });



    console.log(
        'POS Webhook Result:'
    );


    console.log(result);



}



main()
.catch(error=>{


    console.error(
        'POS webhook test failed:',
        error
    );


    process.exit(1);


});