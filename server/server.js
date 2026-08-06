import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { testConnection } from './config/database.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import logger from './utils/logger.js';

// Import routes (will be created next)
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import categoryRoutes from './routes/category.routes.js';
import supplierRoutes from './routes/supplier.routes.js';
import customerRoutes from './routes/customer.routes.js';
import itemRoutes from './routes/item.routes.js';
import poRoutes from './routes/po.routes.js';
import grnRoutes from './routes/grn.routes.js';
import stockTransferRoutes from './routes/stock-transfer.routes.js';
import stockAdjustmentRoutes from './routes/stock-adjustment.routes.js';
import returnRoutes from './routes/return.routes.js';
import saleRoutes from './routes/sale.routes.js';
import reportRoutes from './routes/report.routes.js';
import bomRoutes from './routes/bom.routes.js';
import productionRoutes from './routes/production.routes.js';
import quotationRoutes from './routes/quotation.routes.js';
import portalRoutes from './routes/portal.routes.js';
import monthlyCostsRoutes from './routes/monthly_costs.routes.js';
import uomRoutes from './routes/uom.routes.js';
import pettyCashRoutes from './routes/petty-cash.routes.js';

import cartRoutes from './routes/cart.routes.js';
import batchRoutes from './routes/batch.routes.js';
import voidRoutes from './routes/void.routes.js';
import operatorRoutes from './routes/operator.routes.js';
import salesTargetsRoutes from './routes/sales-targets.routes.js';
import salesPersonsRoutes from './routes/sales-persons.routes.js';
import qzRoutes from './routes/qz.routes.js';
import configRoutes from './routes/config.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import roleRoutes from './routes/role.routes.js';
import ispRoutes from './routes/isp.routes.js';
import paymentRoutes from './routes/payment.routes.js';

// Load environment variables
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 7001;

// =====================================================
// MIDDLEWARE SETUP
// =====================================================

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false
}));

// CORS configuration
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:7000',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10000, // Very high limit for debugging
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.log('⚠️ Rate limit exceeded for:', req.ip);
        res.status(429).json({
            success: false,
            message: 'Too many requests from this IP, please try again later.'
        });
    }
});

// Apply rate limiting to auth routes
app.use('/api/auth', limiter);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Compression
app.use(compression());

// Ignore Cloudflare cdn-cgi script requests in local development
app.use('/cdn-cgi', (req, res) => res.status(204).end());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
    logger.logRequest(req);
    next();
});

// =====================================================
// API ROUTES
// =====================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// User management routes
app.use('/api/users', userRoutes);

// Master data routes
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/operators', operatorRoutes);
app.use('/api/uom', uomRoutes);

// Inventory routes
app.use('/api/items', itemRoutes);

// Purchase management routes
app.use('/api/purchase-orders', poRoutes);
app.use('/api/grn', grnRoutes);

// Quotation routes
app.use('/api/quotations', quotationRoutes);

// Customer Portal routes
app.use('/api/portal', portalRoutes);

// Stock movement routes
app.use('/api/stock-transfers', stockTransferRoutes);
app.use('/api/stock-adjustments', stockAdjustmentRoutes);
app.use('/api/returns', returnRoutes);

// BOM and Production routes
app.use('/api/bom', bomRoutes);
app.use('/api/production', productionRoutes);

// Cart routes
app.use('/api/cart', cartRoutes);

// Batch/Inventory routes
app.use('/api/batches', batchRoutes);

// Sales routes
app.use('/api/sales', saleRoutes);

// Reports routes
app.use('/api/reports', reportRoutes);

// Sales targets routes
app.use('/api/sales-targets', salesTargetsRoutes);

// Sales persons routes
app.use('/api/sales-persons', salesPersonsRoutes);

// Void password routes
app.use('/api/void', voidRoutes);

app.use('/api/petty-cash', pettyCashRoutes);
app.use('/api/monthly-costs', monthlyCostsRoutes);
app.use('/api/roles', roleRoutes);

// ISP module routes (Section A: hotspot, PPPoE, RADIUS, vouchers, usage)
app.use('/api/isp', ispRoutes);

// Payment routes
app.use('/api/payment', paymentRoutes);

// QZ Tray routes - mount at both /qz (for certificate) and /api/qz (for signing)
app.use('/qz', qzRoutes);  // For certificate: /qz/digital-certificate.txt
app.use('/api/qz', qzRoutes);  // For signing: /api/qz/sign

// Config routes (public - no auth required)
app.use('/api/config', configRoutes);

// Notification routes
app.use('/api/notifications', notificationRoutes);

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve Customer Portal
app.get(['/portal', '/portal/', '/store', '/store.html'], (req, res) => {
    res.sendFile(path.join(__dirname, '../public/portal/index.html'));
});



// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// =====================================================
// SERVER STARTUP
// =====================================================

import { migrateMonthlyCostCategories } from '../scripts/create_monthly_cost_categories_table.js';
import { migrateItemTax } from '../scripts/migrate_item_tax.js';
import { testRadiusConnection } from './config/radius-db.js';
import { startIspJobs } from './jobs/isp-jobs.js';

const startServer = async () => {
    try {
        // Test database connection
        const dbConnected = await testConnection();
        if (!dbConnected) {
            logger.error('Failed to connect to database. Please check your database configuration.');
            process.exit(1);
        }

        // Run migrations
        await migrateMonthlyCostCategories();
        await migrateItemTax();

        // ISP module: the RADIUS database is a separate schema shared with
        // FreeRADIUS. A failure here is NOT fatal — the POS and store must
        // keep working even when the ISP side is misconfigured. ISP endpoints
        // will report the error themselves.
        const radiusConnected = await testRadiusConnection();
        if (radiusConnected) {
            startIspJobs();
        } else {
            logger.warn(
                'ISP module degraded: RADIUS database unavailable. ' +
                'Run "node scripts/isp/run_isp_migrations.js" to set it up.'
            );
        }

        // Start server
        app.listen(PORT, () => {
            logger.info(`🚀 Server running on port ${PORT}`);
            logger.info(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`🌐 URL: http://localhost:${PORT}`);
            logger.info(`📊 API: http://localhost:${PORT}/api`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Promise Rejection:', err);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

// Start the server
startServer();

export default app;