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
        pool: {
            query: jest.fn()
        },
        mockConn // expose for testing
    };
});

// Import the mocked database and routes
const { query, transaction, mockConn, pool } = await import('../server/config/database.js');

// Mock auth middleware before importing routes
jest.unstable_mockModule('../server/middleware/rbac.middleware.js', () => ({
    checkPermission: () => (req, res, next) => {
        req.user = { userId: 99 };
        next();
    }
}));

jest.unstable_mockModule('../server/middleware/auth.middleware.js', () => ({
    verifyToken: (req, res, next) => {
        req.user = { userId: 99, role: 'Admin' };
        next();
    }
}));

const stockAdjustmentRoutes = (await import('../server/routes/stock-adjustment.routes.js')).default;
const saleRoutes = (await import('../server/routes/sale.routes.js')).default;

// Create a simple Express app for testing
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock auth checkPermission middleware
app.use((req, res, next) => {
    req.user = { userId: 99, role: 'Admin' }; // Dummy user
    next();
});

app.use('/api/stock-adjustments', stockAdjustmentRoutes);
app.use('/api/sales', saleRoutes);

describe('Stock Adjustment & POS Sales Negative Values Check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should prevent adjustment from resulting in negative total stock', async () => {
        // 1. Mock item details check
        mockConn.execute.mockResolvedValueOnce([[{ id: 1, name: 'Test Item', code: 'IT-001' }]]);
        
        // 2. Mock current inventory check (quantity = 5)
        mockConn.execute.mockResolvedValueOnce([[{ quantity: 5 }]]);

        const payload = {
            item_id: 1,
            location_id: 1,
            adjustment_type: 'subtraction',
            batches: [
                {
                    batch_id: 10,
                    quantity: -10, // Attempting to subtract 10 when only 5 exist
                    reason: 'Damage'
                }
            ],
            overall_reason: 'Testing negative stock prevention'
        };

        const token = jwt.sign({ userId: 99, role: 'Admin' }, jwtConfig.secret);

        const res = await request(app)
            .post('/api/stock-adjustments/batch')
            .set('Cookie', [`token=${token}`])
            .send(payload);

        // Check if the request was blocked with 500 error and appropriate message
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Insufficient total stock at this location');
    });

    it('should prevent adjustment from resulting in negative batch stock', async () => {
        // 1. Mock item details check
        mockConn.execute.mockResolvedValueOnce([[{ id: 1, name: 'Test Item', code: 'IT-001' }]]);
        
        // 2. Mock current inventory check (total quantity = 20)
        mockConn.execute.mockResolvedValueOnce([[{ quantity: 20 }]]);

        // 3. Mock last adjustment query
        mockConn.execute.mockResolvedValueOnce([[]]);

        // 4. Mock insert into stock_adjustments
        mockConn.execute.mockResolvedValueOnce([{ insertId: 50 }]);

        // 5. Mock batch quantity check before update (current_quantity = 3)
        mockConn.execute.mockResolvedValueOnce([[{ current_quantity: 3, initial_quantity: 10 }]]);

        const payload = {
            item_id: 1,
            location_id: 1,
            adjustment_type: 'subtraction',
            batches: [
                {
                    batch_id: 10,
                    quantity: -5, // Subtracting 5 from a batch that only has 3
                    reason: 'Damage'
                }
            ],
            overall_reason: 'Testing negative batch stock prevention'
        };

        const token = jwt.sign({ userId: 99, role: 'Admin' }, jwtConfig.secret);

        const res = await request(app)
            .post('/api/stock-adjustments/batch')
            .set('Cookie', [`token=${token}`])
            .send(payload);

        // Check if the request was blocked
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Insufficient stock in Batch #10');
    });

    it('should prevent POS sale when stock is insufficient', async () => {
        const token = jwt.sign({ userId: 99, role: 'Admin' }, jwtConfig.secret);

        // 1. SELECT FOR UPDATE to get last invoice number
        mockConn.execute.mockResolvedValueOnce([[]]);
        
        // 2. INSERT into sales (mocking saleResult insertId)
        mockConn.execute.mockResolvedValueOnce([{ insertId: 100 }]); 
        
        // 3. INSERT into sale_payments
        mockConn.execute.mockResolvedValueOnce([{}]);

        // --- Processing Item Costing ---
        // 4. SELECT batches for pricing/costing
        mockConn.execute.mockResolvedValueOnce([[
            { id: 1, cost_per_unit: 100, current_quantity: 10, received_date: '2026-01-01' }
        ]]);

        // 5. INSERT into sale_items
        mockConn.execute.mockResolvedValueOnce([{ insertId: 200 }]);

        // 6. SELECT Shop Location
        mockConn.execute.mockResolvedValueOnce([[{ id: 1 }]]);

        // 7. SELECT Item Name/Code
        mockConn.execute.mockResolvedValueOnce([[{ name: 'Test Item', code: 'IT-001' }]]);

        // 8. SELECT Shop stock availability (Only 1 item available in stock)
        mockConn.execute.mockResolvedValueOnce([[{ quantity: 1 }]]);

        const salePayload = {
            customer_id: 1,
            items: [
                {
                    item_id: 5,
                    quantity: 2, // Ordering 2 items
                    unit_price: 300,
                    discount_amount: 0,
                    discount_percentage: 0
                }
            ],
            payments: [{ method: 'CASH', amount: 600, reference: '', notes: '' }]
        };

        const res = await request(app)
            .post('/api/sales')
            .set('Cookie', [`token=${token}`])
            .send(salePayload);

        // Verify that transaction failed due to insufficient stock check
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Insufficient stock in Shop for Test Item');
    });
});
