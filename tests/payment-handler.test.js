import { describe, expect, test } from '@jest/globals';

import { normalizeDarajaCallback } from '../server/services/payment/payment-handler.service.js';

describe('payment handler', () => {
    test('normalizes nested Daraja callback payloads', () => {
        const payload = {
            Body: {
                stkCallback: {
                    CheckoutRequestID: 'checkout-123',
                    ResultCode: 0,
                    ResultDesc: 'The service request is processed successfully.',
                    CallbackMetadata: {
                        Item: [
                            { Name: 'Amount', Value: 125.5 },
                            { Name: 'MpesaReceiptNumber', Value: 'RECEIPT-001' },
                            { Name: 'PhoneNumber', Value: '254700000000' }
                        ]
                    }
                }
            }
        };

        const result = normalizeDarajaCallback(payload);

        expect(result.checkoutRequestId).toBe('checkout-123');
        expect(result.resultCode).toBe(0);
        expect(result.resultDescription).toContain('processed successfully');
        expect(result.receipt).toBe('RECEIPT-001');
        expect(result.amount).toBe(125.5);
        expect(result.phone).toBe('254700000000');
    });
});
