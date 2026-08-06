export const DARAJA_CONFIG = {

    environment:
        process.env.MPESA_ENV || 'sandbox',


    shortcode:
        process.env.MPESA_SHORTCODE,


    passkey:
        process.env.MPESA_PASSKEY,


    callbackUrl:
        process.env.MPESA_CALLBACK_URL

};