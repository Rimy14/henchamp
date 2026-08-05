import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Mock the database
jest.unstable_mockModule('../server/config/database.js', () => {
    const mockConn = {
        execute: jest.fn()
    };
    return {
        query: jest.fn(),
        transaction: jest.fn(async (cb) => {
            return await cb(mockConn);
        }),
        mockConn
    };
});

// Import the mocked database and routes
const { query, transaction, mockConn } = await import('../server/config/database.js');

// Mock auth middleware
jest.unstable_mockModule('../server/middleware/auth.middleware.js', () => ({
    verifyToken: (req, res, next) => {
        req.user = { userId: 99, role: 'Admin' };
        next();
    }
}));

// Mock permissions middleware
jest.unstable_mockModule('../server/middleware/rbac.middleware.js', () => ({
    checkPermission: () => (req, res, next) => {
        req.user = { userId: 99, role: 'Admin' };
        next();
    }
}));

const poRoutes = (await import('../server/routes/po.routes.js')).default;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
    req.user = { userId: 99, role: 'Admin' };
    next();
});
app.use('/api/purchase-orders', poRoutes);

describe('PO Payments API endpoints', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully record a payment on an Approved PO and update status to partial', async () => {
        // 1. Mock SELECT FOR UPDATE to return PO details
        mockConn.execute.mockResolvedValueOnce([[
            { id: 1, total_amount: 1000.00, paid_amount: 0.00, status: 'Approved', supplier_id: 5 }
        ]]);

        // 2. Mock INSERT into po_payments
        mockConn.execute.mockResolvedValueOnce([{ insertId: 44 }]);

        // 3. Mock SELECT COALESCE(SUM(amount)) from po_payments
        mockConn.execute.mockResolvedValueOnce([[
            { total_paid: 400.00 }
        ]]);

        // 4. Mock UPDATE purchase_orders
        mockConn.execute.mockResolvedValueOnce([{}]);

        // 5. Mock Audit log query
        query.mockResolvedValueOnce([{}]);

        const response = await request(app)
            .post('/api/purchase-orders/1/payments')
            .send({
                amount: 400.00,
                payment_method: 'Bank Transfer',
                reference_number: 'TX12345',
                notes: 'Partial payment'
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.payment_status).toBe('partial');
        expect(response.body.data.paid_amount).toBe(400.00);
        expect(response.body.data.outstanding).toBe(600.00);
    });

    it('should update status to paid when PO is fully paid', async () => {
        // 1. Mock SELECT FOR UPDATE to return PO details
        mockConn.execute.mockResolvedValueOnce([[
            { id: 1, total_amount: 1000.00, paid_amount: 400.00, status: 'Approved', supplier_id: 5 }
        ]]);

        // 2. Mock INSERT into po_payments
        mockConn.execute.mockResolvedValueOnce([{ insertId: 45 }]);

        // 3. Mock SELECT COALESCE(SUM(amount)) from po_payments
        mockConn.execute.mockResolvedValueOnce([[
            { total_paid: 1000.00 }
        ]]);

        // 4. Mock UPDATE purchase_orders
        mockConn.execute.mockResolvedValueOnce([{}]);

        // 5. Mock Audit log query
        query.mockResolvedValueOnce([{}]);

        const response = await request(app)
            .post('/api/purchase-orders/1/payments')
            .send({
                amount: 600.00,
                payment_method: 'Cash',
                notes: 'Final settlement'
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.payment_status).toBe('paid');
        expect(response.body.data.outstanding).toBe(0.00);
    });

    it('should reject payment recording if it exceeds outstanding balance', async () => {
        // 1. Mock SELECT FOR UPDATE to return PO details
        mockConn.execute.mockResolvedValueOnce([[
            { id: 1, total_amount: 1000.00, paid_amount: 400.00, status: 'Approved', supplier_id: 5 }
        ]]);

        const response = await request(app)
            .post('/api/purchase-orders/1/payments')
            .send({
                amount: 700.00,
                payment_method: 'Cash'
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('exceeds outstanding balance');
    });

    it('should reject payment recording if PO is in Draft state', async () => {
        // 1. Mock SELECT FOR UPDATE to return PO details
        mockConn.execute.mockResolvedValueOnce([[
            { id: 1, total_amount: 1000.00, paid_amount: 0.00, status: 'Draft', supplier_id: 5 }
        ]]);

        const response = await request(app)
            .post('/api/purchase-orders/1/payments')
            .send({
                amount: 100.00,
                payment_method: 'Cash'
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Approved or Received');
    });
});
