ALTER TABLE isp_payments
MODIFY payment_provider
ENUM(
'MPESA',
'PAYSTACK',
'POS'
);