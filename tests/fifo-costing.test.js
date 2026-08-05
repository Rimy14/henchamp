import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import jwtConfig from '../server/config/jwt.js';

// Manually mock the database
jest.unstable_mockModule('../server/config/database.js', () => {
    const mockConn = {
        execute: jest.fn()
    };
    return {
        query: jest.fn(),
        transaction: jest.fn(async (cb) => {
            return await cb(mockConn);
        }),
        mockConn // expose for testing
    };
});

// Import the mocked database and routes
const { query, transaction, mockConn } = await import('../server/config/database.js');
const saleRoutes = (await import('../server/routes/sale.routes.js')).default;

// Create a simple Express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock standard middleware that the route might expect (e.g. checkPermission)
// We'll replace the router to avoid middleware errors if possible, but route is exported.
// The route has `checkPermission('sales:create')` which requires `req.user`.
app.use((req, res, next) => {
    req.user = { userId: 99 }; // Dummy user
    next();
});

// We need to disable the `checkPermission` middleware which checks DB
jest.unstable_mockModule('../server/middleware/rbac.middleware.js', () => ({
    checkPermission: () => (req, res, next) => {
        req.user = { userId: 99 };
        next();
    }
}));

app.use('/api/sales', saleRoutes);

describe('FIFO Batch Costing Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should correctly calculate weighted average cost using FIFO', async () => {
        // Mock the sequence of database calls
        
        // 0. Mock global query for auth.middleware
        query.mockResolvedValueOnce([{ id: 99, username: 'testuser', email: 'test@t.com', role: 'Admin', status: 'active' }]);

        // 1. SELECT FOR UPDATE to get last invoice number
        mockConn.execute.mockResolvedValueOnce([[]]);
        
        // 2. INSERT into sales
        mockConn.execute.mockResolvedValueOnce([{ insertId: 100 }]); 
        
        // 3. INSERT into sale_payments
        mockConn.execute.mockResolvedValueOnce([{}]);

        // --- START PROCESSING ITEM ---
        
        // 4. SELECT batches for pricing (Costing Loop)
        mockConn.execute.mockResolvedValueOnce([[
            { id: 1, cost_per_unit: 200, current_quantity: 1, received_date: '2026-01-01' },
            { id: 2, cost_per_unit: 150, current_quantity: 3, received_date: '2026-01-02' }
        ]]);

        // 5. INSERT into sale_items (This is where cost_price is set, we need to inspect this!)
        mockConn.execute.mockResolvedValueOnce([{ insertId: 200 }]);

        // 6. SELECT Shop Location
        mockConn.execute.mockResolvedValueOnce([[{ id: 1 }]]);

        // 7. SELECT Item Name/Code
        mockConn.execute.mockResolvedValueOnce([[{ name: 'Test Item', code: 'IT-001' }]]);

        // 8. SELECT Shop stock avaiability
        mockConn.execute.mockResolvedValueOnce([[{ quantity: 10 }]]);

        // 9. SELECT current shop inv (for ledger)
        mockConn.execute.mockResolvedValueOnce([[{ quantity: 10 }]]);

        // 10. SELECT batches for depletion (Deduction Loop)
        mockConn.execute.mockResolvedValueOnce([[
            { id: 1, grn_id: 10, cost_per_unit: 200, current_quantity: 1, received_date: '2026-01-01' },
            { id: 2, grn_id: 11, cost_per_unit: 150, current_quantity: 3, received_date: '2026-01-02' }
        ]]);

        // 11-14. UPDATE batch qtys and INSERT ledgers and final SELECTs
        mockConn.execute.mockResolvedValue([[{ sale_id: 100, invoice_number: 'INV-0001', subtotal: 0, discount_amount: 0, tax_amount: 0, total: 0, payment_status: 'paid', product_name: 'TestItem' }]]); 

        const salePayload = {
            customer_id: 1,
            items: [
                {
                    item_id: 5,
                    quantity: 2,
                    unit_price: 300,
                    discount_amount: 0,
                    discount_percentage: 0
                }
            ],
            payments: [{ method: 'CASH', amount: 600, reference: '', notes: '' }]
        };

        const token = jwt.sign({ userId: 99, role: 'Admin' }, jwtConfig.secret);

        const res = await request(app)
            .post('/api/sales')
            .set('Cookie', [`token=${token}`])
            .send(salePayload);

        // Check if the request was successful
        if (res.status !== 201) {
            console.error('Test failed with status', res.status);
            console.error('Response body:', res.body);
        }
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);

        // Now, find the INSERT INTO sale_items call
        const saleItemsCall = mockConn.execute.mock.calls.find(call => 
            call[0].includes('INSERT INTO sale_items')
        );

        expect(saleItemsCall).toBeDefined();

        // The query is:
        // INSERT INTO sale_items (sale_id, item_id, quantity, unit_price, discount_amount, discount_percentage, total_price, cost_price)
        // VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        // We know quantity is 2. 
        // Cost should be: (1 * 200) + (1 * 150) = 350 / 2 = 175.
        
        const params = saleItemsCall[1];
        const costPriceParam = params[7]; // 8th parameter (0-indexed)

        expect(costPriceParam).toBe(175);
    });
});
