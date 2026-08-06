/**
 * Add Paystack transaction reference support
 *
 * B4 - Paystack Card Payment Integration
 *
 * Extends existing isp_payments table
 * used by Daraja and future payment providers.
 */


ALTER TABLE isp_payments

ADD COLUMN transaction_reference VARCHAR(100)

AFTER checkout_request_id;