import {
    query
}
from '../../config/database.js';


// =====================================================
// CREATE REUSABLE PAYMENT
// Compatible with existing HenChamp payments table
// =====================================================

export async function createReusablePayment({

    provider = 'MPESA',

    module = 'generic',

    moduleReference = null,

    paymentType = 'stk',

    reference = null,

    providerReference = null,

    checkoutRequestId = null,

    merchantRequestId = null,

    amount = null,

    phone = null,

    accountReference = null,

    transactionDesc = null,

    metadata = {}

}) {


    const paymentReference =
        reference ||
        `${module}-${Date.now()}`;



    const result =
    await query(
        `
        INSERT INTO payments
        (
            provider,
            purpose,
            reference,
            amount,
            phone,
            status,
            checkout_request_id
        )

        VALUES
        (?,?,?,?,?,?,?)
        `,
        [

            provider,

            module.toUpperCase(),

            paymentReference,

            amount,

            phone,

            'pending',

            checkoutRequestId

        ]
    );



    return {

        id: result.insertId,

        reference: paymentReference,

        provider,

        status:'pending'

    };

}






// =====================================================
// COMPLETE REUSABLE PAYMENT
// =====================================================

// =====================================================
// COMPLETE REUSABLE PAYMENT
// =====================================================

export async function completeReusablePayment({

    payload,

    checkoutRequestId,

    receipt,

    resultCode,

    amount,

    phone

}) {


    const normalized =
    normalizeDarajaCallback(payload);



    const finalCheckoutId =
        checkoutRequestId ||
        normalized.checkoutRequestId;



    const finalReceipt =
        receipt ||
        normalized.receipt;



    const finalResultCode =
        resultCode ??
        normalized.resultCode;



    const finalAmount =
        amount ??
        normalized.amount;



    const finalPhone =
        phone ||
        normalized.phone;



    const payments =
    await query(
        `
        SELECT *
        FROM payments
        WHERE checkout_request_id=?
        LIMIT 1
        `,
        [
            finalCheckoutId
        ]
    );



    if(!payments.length){

        throw new Error(
            "Payment record not found"
        );

    }



    const payment =
    payments[0];



    // Duplicate callback protection

    if(payment.status === 'success'){

        return {

            success:true,

            paymentId:
            payment.id,

            status:
            'success',

            normalized

        };

    }




    const status =
        finalResultCode === 0
        ? 'success'
        : 'failed';



    await query(
        `
        UPDATE payments
        SET
            status=?,
            mpesa_receipt=?,
            amount=COALESCE(?,amount),
            phone=COALESCE(?,phone)
        WHERE id=?
        `,
        [

            status,

            finalReceipt,

            finalAmount,

            finalPhone,

            payment.id

        ]
    );



    return {

        success:
        status === 'success',


        paymentId:
        payment.id,


        status,


        normalized

    };

}

// =====================================================
// DARJA CALLBACK NORMALIZER
// =====================================================

export function normalizeDarajaCallback(payload){


    const callback =
        payload?.Body?.stkCallback ||
        payload;



    const items =
        callback?.CallbackMetadata?.Item ||
        [];



    function getValue(name){

        const item =
        items.find(
            i=>i.Name===name
        );

        return item?.Value ?? null;

    }




    return {


        checkoutRequestId:
            callback.CheckoutRequestID ||
            null,



        resultCode:
            callback.ResultCode ??
            null,



        resultDescription:
            callback.ResultDesc ||
            null,



        receipt:
            callback.MpesaReceiptNumber ||
            getValue('MpesaReceiptNumber'),



        amount:
            callback.Amount ||
            getValue('Amount'),



        phone:
            callback.PhoneNumber ||
            getValue('PhoneNumber')

    };

}