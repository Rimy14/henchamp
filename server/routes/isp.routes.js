/**
 * ISP Module Routes — Section A
 *
 * Mounted at /api/isp. Follows the house pattern: verifyToken for the whole
 * router, then checkPermission per route.
 *
 * Permission scheme (see database/migrations/isp/005_isp_permissions.sql):
 *   isp:read        view everything
 *   isp:packages    create / edit tariffs
 *   isp:subscribers create / edit subscriber accounts
 *   isp:suspend     suspend, restore, disconnect — CUTS SERVICE
 *   isp:vouchers    generate, revoke, reset device binding
 *   isp:nas         manage routers — holds admin credentials
 */

import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';

import {
    getAllPackages, getPackageById, createPackage, updatePackage,
    deletePackage, reprovisionAllPackages
} from '../controllers/isp-package.controller.js';

import {
    getAllSubscribers, getSubscriberById, createSubscriber, updateSubscriber,
    activateSubscriber, suspendSubscriber, restoreSubscriber, graceSubscriber,
    terminateSubscriber, disconnectSubscriber, checkSubscriberSync,
    repairSubscriber, getSubscriberUsage, getBillableSubscribers
} from '../controllers/isp-subscriber.controller.js';

import {
    generateVouchers, getAllVouchers, getVoucherById, resetVoucherBinding,
    revokeVoucher, checkVoucherAccess, getAllBatches, getBatchById, expireVouchers
} from '../controllers/isp-voucher.controller.js';

import {
    getLiveSessions, getOpenSessions, getSessionHistory, killSession,
    getTopTalkers, getDashboard, runAccountingIngest, runSessionReaper
} from '../controllers/isp-session.controller.js';

import {
    getAllNas, getNasById, createNas, updateNas, deleteNas, testNas
} from '../controllers/isp-nas.controller.js';

const router = express.Router();

// Every ISP route requires authentication.
router.use(verifyToken);

// =====================================================
// DASHBOARD (A7)
// =====================================================

router.get('/dashboard', checkPermission('isp:read'), getDashboard);

// =====================================================
// PACKAGES
// =====================================================

router.get('/packages', checkPermission('isp:read'), getAllPackages);
router.get('/packages/:id', checkPermission('isp:read'), getPackageById);
router.post('/packages', checkPermission('isp:packages'), createPackage);
router.put('/packages/:id', checkPermission('isp:packages'), updatePackage);
router.delete('/packages/:id', checkPermission('isp:packages'), deletePackage);

// Force every package's RADIUS group to match its definition.
router.post('/packages/reprovision-all', checkPermission('isp:packages'), reprovisionAllPackages);

// =====================================================
// SUBSCRIBERS (A1, A3)
// =====================================================

// Static paths before /:id so "billable" is not parsed as an id.
router.get('/subscribers/billable', checkPermission('isp:read'), getBillableSubscribers);

router.get('/subscribers', checkPermission('isp:read'), getAllSubscribers);
router.get('/subscribers/:id', checkPermission('isp:read'), getSubscriberById);
router.post('/subscribers', checkPermission('isp:subscribers'), createSubscriber);
router.put('/subscribers/:id', checkPermission('isp:subscribers'), updateSubscriber);

router.get('/subscribers/:id/usage', checkPermission('isp:read'), getSubscriberUsage);
router.get('/subscribers/:id/sync', checkPermission('isp:read'), checkSubscriberSync);
router.post('/subscribers/:id/repair', checkPermission('isp:subscribers'), repairSubscriber);

// --- Lifecycle. These cut service on and off, so they sit behind their own
// --- permission rather than isp:subscribers.
router.post('/subscribers/:id/activate', checkPermission('isp:suspend'), activateSubscriber);
router.post('/subscribers/:id/suspend', checkPermission('isp:suspend'), suspendSubscriber);
router.post('/subscribers/:id/restore', checkPermission('isp:suspend'), restoreSubscriber);
router.post('/subscribers/:id/grace', checkPermission('isp:suspend'), graceSubscriber);
router.post('/subscribers/:id/terminate', checkPermission('isp:suspend'), terminateSubscriber);
router.post('/subscribers/:id/disconnect', checkPermission('isp:suspend'), disconnectSubscriber);

// =====================================================
// VOUCHERS (A2, A5)
// =====================================================

router.get('/vouchers/batches', checkPermission('isp:read'), getAllBatches);
router.get('/vouchers/batches/:id', checkPermission('isp:read'), getBatchById);

// Device-access check: does this MAC get in with this code?
router.get('/vouchers/check/:code', checkPermission('isp:read'), checkVoucherAccess);

router.get('/vouchers', checkPermission('isp:read'), getAllVouchers);
router.get('/vouchers/:id', checkPermission('isp:read'), getVoucherById);

router.post('/vouchers/generate', checkPermission('isp:vouchers'), generateVouchers);
router.post('/vouchers/expire-due', checkPermission('isp:vouchers'), expireVouchers);
router.post('/vouchers/:id/revoke', checkPermission('isp:vouchers'), revokeVoucher);

// A5 — the counter-staff fix for a device that changed its MAC.
router.post('/vouchers/:id/reset-binding', checkPermission('isp:vouchers'), resetVoucherBinding);

// =====================================================
// SESSIONS & USAGE (A6)
// =====================================================

router.get('/sessions/live', checkPermission('isp:read'), getLiveSessions);
router.get('/sessions/open', checkPermission('isp:read'), getOpenSessions);
router.get('/sessions/history', checkPermission('isp:read'), getSessionHistory);
router.get('/usage/top-talkers', checkPermission('isp:read'), getTopTalkers);

router.delete('/sessions/:nasId/:sessionId', checkPermission('isp:suspend'), killSession);

// Manual job triggers — used for catch-up and during testing.
router.post('/jobs/accounting-ingest', checkPermission('isp:subscribers'), runAccountingIngest);
router.post('/jobs/session-reaper', checkPermission('isp:subscribers'), runSessionReaper);

// =====================================================
// NAS / ROUTERS (A4)
// =====================================================

router.get('/nas', checkPermission('isp:nas'), getAllNas);
router.get('/nas/:id', checkPermission('isp:nas'), getNasById);
router.post('/nas', checkPermission('isp:nas'), createNas);
router.put('/nas/:id', checkPermission('isp:nas'), updateNas);
router.delete('/nas/:id', checkPermission('isp:nas'), deleteNas);
router.post('/nas/:id/test', checkPermission('isp:nas'), testNas);

export default router;
