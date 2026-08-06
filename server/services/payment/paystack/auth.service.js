/**
 * Paystack Authentication Service
 *
 * Paystack uses Bearer token authentication.
 */

export function getPaystackHeaders(){

    return {

        Authorization:
        `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

        "Content-Type":
        "application/json"

    };

}