/**
 * M-Pesa Daraja Authentication
 *
 * Currently supports:
 * - MOCK mode
 * - Real Daraja OAuth later
 */


export async function getDarajaToken(){


    if(process.env.MPESA_ENABLED !== 'true'){

        return {

            access_token:
            "MOCK_ACCESS_TOKEN",

            expires_in:
            3600

        };

    }



    /*
        Real implementation:

        GET
        https://sandbox.safaricom.co.ke/oauth/v1/generate

        Authorization:
        Basic base64(key:secret)

    */



    throw new Error(
        "Real Daraja authentication not implemented"
    );

}