/**
 * Daraja STK Push Service
 *
 * MOCK first.
 * Real API can replace this later.
 */


export async function sendSTKPush({

    phone,
    amount,
    invoiceNumber

}){


    if(process.env.MPESA_ENABLED !== 'true'){


        return {


            merchantRequestId:
            `MOCK-MERCHANT-${Date.now()}`,


            checkoutRequestId:
            `MOCK-CHECKOUT-${Date.now()}`,


            responseCode:
            "0",


            customerMessage:
            "STK Push simulated successfully"


        };


    }



    /*
        Real Daraja:

        POST
        /mpesa/stkpush/v1/processrequest

    */


    throw new Error(
        "Real Daraja STK Push not implemented"
    );

}