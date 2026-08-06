/**
 * Create Reusable Payments Table (B6)
 *
 * Required by payment-handler.service.js to track generic callbacks
 * across all business modules (ISP, Ticketing, etc.).
 */

CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    purpose VARCHAR(50) NULL,
    reference VARCHAR(100) NOT NULL,
    amount DECIMAL(15,2) NULL,
    phone VARCHAR(20) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    checkout_request_id VARCHAR(100) NULL,
    mpesa_receipt VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_checkout (checkout_request_id),
    INDEX idx_reference (reference)
);
