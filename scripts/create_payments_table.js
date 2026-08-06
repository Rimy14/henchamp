import { query } from "../server/config/database.js";


await query(`
CREATE TABLE IF NOT EXISTS payments (

    id INT AUTO_INCREMENT PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,

    purpose VARCHAR(50) NOT NULL,

    reference VARCHAR(100) NOT NULL,

    amount DECIMAL(10,2) NOT NULL,

    phone VARCHAR(20),

    checkout_request_id VARCHAR(100),

    transaction_reference VARCHAR(100),

    status ENUM(
        'pending',
        'success',
        'failed'
    )
    DEFAULT 'pending',

    callback_data JSON,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);
`);


console.log(
    "payments table created"
);