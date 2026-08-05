/**
 * ISP Payment Gateway Tracking
 *
 * Used for:
 * - M-Pesa Daraja
 * - Future Paystack
 *
 */

CREATE TABLE IF NOT EXISTS isp_payments (

    id INT AUTO_INCREMENT PRIMARY KEY,

    subscriber_id INT NOT NULL,

    sale_id INT NOT NULL,

    payment_provider ENUM(
        'MPESA',
        'PAYSTACK'
    ) NOT NULL DEFAULT 'MPESA',

    checkout_request_id VARCHAR(100) NULL,

    merchant_request_id VARCHAR(100) NULL,

    mpesa_receipt VARCHAR(100) NULL,

    phone VARCHAR(20) NOT NULL,

    amount DECIMAL(15,2) NOT NULL,

    status ENUM(
        'pending',
        'success',
        'failed'
    ) NOT NULL DEFAULT 'pending',

    response_message TEXT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,


    INDEX idx_checkout_request (
        checkout_request_id
    ),

    INDEX idx_subscriber (
        subscriber_id
    ),

    INDEX idx_sale (
        sale_id
    )

);