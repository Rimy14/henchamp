/**
 * Reusable Daraja Payment Service
 *
 * Shared by:
 *
 * ISP Billing
 * Ticketing
 * Other platforms
 *
 */

import { sendSTKPush } from './stk.service.js';
import { createReusablePayment } from '../payment-handler.service.js';

export async function createDarajaPayment({
    amount,
    phone,
    accountReference,
    transactionDesc,
    metadata = {},
    module = 'generic',
    moduleReference = null,
    paymentType = 'stk',
    reference = null
}) {
    const result = await sendSTKPush({
        amount,
        phone,
        accountReference,
        transactionDesc
    });

    const payment = await createReusablePayment({
        provider: 'MPESA',
        module,
        moduleReference,
        paymentType,
        reference,
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        amount,
        phone,
        accountReference,
        transactionDesc,
        metadata
    });

    return {
        success: true,
        provider: 'MPESA',
        paymentId: payment.id,
        reference: payment.reference,
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        metadata
    };
}
