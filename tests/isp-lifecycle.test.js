/**
 * Tests for the subscriber lifecycle — the integration surface with Dev 2.
 *
 * Two properties are load-bearing and are pinned here:
 *
 *   IDEMPOTENCY   M-Pesa Daraja retries webhooks, so every one of these
 *                 functions will be called two or three times for a single
 *                 real payment. Calling restore() three times must equal
 *                 calling it once — otherwise each duplicate hands the
 *                 customer another free month.
 *
 *   TWO-LAYER     Suspending must BOTH change RADIUS policy (blocks the next
 *   SUSPENSION    login) AND kick the live session (ends the one happening
 *                 now). Doing only the first is the classic bug: a PPPoE
 *                 session never re-authenticates, so the "suspended"
 *                 customer stays online indefinitely.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

process.env.ISP_ENCRYPTION_KEY = 'b'.repeat(64);

const mockQuery = jest.fn();

jest.unstable_mockModule('../server/config/database.js', () => ({
    query: mockQuery,
    transaction: jest.fn(async (cb) => cb({ execute: jest.fn() })),
    pool: {},
    testConnection: jest.fn()
}));

const mockBlockUser = jest.fn();
const mockUnblockUser = jest.fn();

jest.unstable_mockModule('../server/services/isp/radius.service.js', () => ({
    blockUser: mockBlockUser,
    unblockUser: mockUnblockUser,
    setUserPassword: jest.fn(),
    setUserGroup: jest.fn(),
    deprovisionUser: jest.fn(),
    bindUserToMac: jest.fn(),
    unbindUserMac: jest.fn(),
    replaceGroupPolicy: jest.fn(),
    describeUser: jest.fn(),
    getGroupPolicy: jest.fn(),
    upsertNas: jest.fn(),
    removeNas: jest.fn(),
    getAccountingSince: jest.fn(),
    closeStaleAccountingSession: jest.fn(),
    getAuthHistory: jest.fn(),
    getUserGroup: jest.fn(),
    isUserBlocked: jest.fn()
}));

const mockProvisionSubscriber = jest.fn();
jest.unstable_mockModule('../server/services/isp/provisioning.service.js', () => ({
    provisionSubscriber: mockProvisionSubscriber,
    deprovisionSubscriber: jest.fn(),
    provisionPackage: jest.fn(),
    provisionAllPackages: jest.fn(),
    changeSubscriberPackage: jest.fn(),
    provisionVoucher: jest.fn(),
    provisionVoucherBatch: jest.fn(),
    deprovisionVoucher: jest.fn(),
    checkSubscriberSync: jest.fn(),
    repairSubscriber: jest.fn()
}));

const mockDisconnect = jest.fn();
jest.unstable_mockModule('../server/services/isp/nas.service.js', () => ({
    disconnectUserEverywhere: mockDisconnect,
    getActiveClients: jest.fn(),
    getAllLiveSessions: jest.fn(),
    buildClient: jest.fn(),
    getNasRow: jest.fn(),
    listNas: jest.fn(),
    upsertNas: jest.fn(),
    deleteNas: jest.fn(),
    testNasConnection: jest.fn(),
    sanitiseNas: (r) => r
}));

const lifecycle = await import('../server/services/isp/lifecycle.service.js');

/** A subscriber row in a given state. */
function subscriber(overrides = {}) {
    return {
        id: 1,
        subscriber_code: 'HC-ISP-00001',
        radius_username: 'john_kamau',
        package_id: 1,
        status: 'active',
        billing_cycle_start: '2026-08-01',
        billing_cycle_end: '2026-08-31',
        grace_until: null,
        ...overrides
    };
}

const PACKAGE = { id: 1, code: 'PPP-10M', validity_days: 30, radius_group: 'pkg_ppp_10m' };

function tomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}

function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

beforeEach(() => {
    mockQuery.mockReset();
    mockBlockUser.mockReset();
    mockUnblockUser.mockReset();
    mockProvisionSubscriber.mockReset();
    mockDisconnect.mockReset();
    mockDisconnect.mockResolvedValue({ disconnected: 1, errors: [] });
});

// =====================================================
// SUSPEND — two layers
// =====================================================

describe('suspendSubscriber', () => {
    test('BOTH LAYERS: blocks RADIUS auth and kicks the live session', async () => {
        mockQuery
            .mockResolvedValueOnce([subscriber({ status: 'active' })])
            .mockResolvedValueOnce({ affectedRows: 1 })   // UPDATE status
            .mockResolvedValueOnce({ affectedRows: 1 })   // audit
            .mockResolvedValueOnce([subscriber({ status: 'suspended' })]);

        const result = await lifecycle.suspendSubscriber(1, { reason: 'non-payment' });

        // Layer 1 — future logins refused
        expect(mockBlockUser).toHaveBeenCalledWith('john_kamau');
        // Layer 2 — the session that is up right now is terminated
        expect(mockDisconnect).toHaveBeenCalledWith('john_kamau');

        expect(result.changed).toBe(true);
        expect(result.disconnected).toBe(1);
    });

    test('IDEMPOTENT: suspending an already-suspended subscriber is a no-op', async () => {
        mockQuery.mockResolvedValueOnce([subscriber({ status: 'suspended' })]);

        const result = await lifecycle.suspendSubscriber(1, { reason: 'non-payment' });

        expect(result.changed).toBe(false);
        expect(mockBlockUser).not.toHaveBeenCalled();
        expect(mockDisconnect).not.toHaveBeenCalled();
    });

    test('can skip the disconnect when asked', async () => {
        mockQuery
            .mockResolvedValueOnce([subscriber({ status: 'active' })])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([subscriber({ status: 'suspended' })]);

        await lifecycle.suspendSubscriber(1, { disconnectNow: false });

        expect(mockBlockUser).toHaveBeenCalled();
        expect(mockDisconnect).not.toHaveBeenCalled();
    });

    test('an unreachable router does NOT fail the suspension', async () => {
        // The policy change has already landed, so the subscriber cannot
        // re-authenticate. Throwing here would leave the database saying
        // "active" while RADIUS says "blocked" — strictly worse.
        mockDisconnect.mockResolvedValue({
            disconnected: 0,
            errors: [{ nas: 'main-router', error: 'ECONNREFUSED' }]
        });

        mockQuery
            .mockResolvedValueOnce([subscriber({ status: 'active' })])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([subscriber({ status: 'suspended' })]);

        const result = await lifecycle.suspendSubscriber(1, {});

        expect(result.changed).toBe(true);
        expect(result.errors).toHaveLength(1);
        expect(mockBlockUser).toHaveBeenCalled();
    });

    test('reports a missing subscriber clearly', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await expect(lifecycle.suspendSubscriber(999, {})).rejects.toThrow(/not found/);
    });
});

// =====================================================
// RESTORE — the duplicate-webhook path
// =====================================================

describe('restoreSubscriber', () => {
    test('restores a suspended subscriber and extends the lapsed cycle', async () => {
        mockQuery
            .mockResolvedValueOnce([subscriber({ status: 'suspended', billing_cycle_end: yesterday() })])
            .mockResolvedValueOnce([PACKAGE])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([subscriber({ status: 'active' })]);

        const result = await lifecycle.restoreSubscriber(1, { reason: 'M-Pesa payment' });

        expect(mockUnblockUser).toHaveBeenCalledWith('john_kamau');
        // Re-provision defensively: after a long suspension or a RADIUS
        // restore, the policy rows may be gone entirely.
        expect(mockProvisionSubscriber).toHaveBeenCalled();
        expect(result.changed).toBe(true);
        expect(result.cycleExtended).toBe(true);
    });

    test('THE DUPLICATE-WEBHOOK CASE: no-op when already active with a valid cycle', async () => {
        // Daraja delivers the same confirmation more than once. The second
        // and third deliveries must change nothing at all.
        mockQuery.mockResolvedValueOnce([
            subscriber({ status: 'active', billing_cycle_end: tomorrow() })
        ]);

        const result = await lifecycle.restoreSubscriber(1, { reason: 'M-Pesa payment' });

        expect(result.changed).toBe(false);
        expect(result.cycleExtended).toBe(false);
        expect(mockUnblockUser).not.toHaveBeenCalled();
        expect(mockProvisionSubscriber).not.toHaveBeenCalled();
    });

    test('THE FREE-MONTH BUG: three duplicate calls extend the cycle at most once', async () => {
        // First call: cycle has lapsed, so it is extended.
        mockQuery
            .mockResolvedValueOnce([subscriber({ status: 'suspended', billing_cycle_end: yesterday() })])
            .mockResolvedValueOnce([PACKAGE])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([subscriber({ status: 'active', billing_cycle_end: tomorrow() })]);

        const first = await lifecycle.restoreSubscriber(1, {});
        expect(first.cycleExtended).toBe(true);

        // Retries: now active with a valid cycle, so nothing must move.
        for (let i = 0; i < 2; i++) {
            mockQuery.mockResolvedValueOnce([
                subscriber({ status: 'active', billing_cycle_end: tomorrow() })
            ]);
            const retry = await lifecycle.restoreSubscriber(1, {});
            expect(retry.changed).toBe(false);
            expect(retry.cycleExtended).toBe(false);
        }
    });

    test('unblocks without extending when the cycle is still valid', async () => {
        // Restoring a subscriber suspended in error: they get their service
        // back, but they do not get a free extra period for it.
        mockQuery
            .mockResolvedValueOnce([subscriber({ status: 'suspended', billing_cycle_end: tomorrow() })])
            .mockResolvedValueOnce([PACKAGE])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([subscriber({ status: 'active' })]);

        const result = await lifecycle.restoreSubscriber(1, {});

        expect(result.changed).toBe(true);
        expect(result.cycleExtended).toBe(false);
        expect(mockUnblockUser).toHaveBeenCalled();
    });

    test('refuses to restore a terminated subscriber', async () => {
        mockQuery.mockResolvedValueOnce([subscriber({ status: 'terminated' })]);
        await expect(lifecycle.restoreSubscriber(1, {})).rejects.toThrow(/terminated/);
    });
});

// =====================================================
// ACTIVATE
// =====================================================

describe('activateSubscriber', () => {
    test('provisions, unblocks and sets the billing cycle', async () => {
        mockQuery
            .mockResolvedValueOnce([subscriber({ status: 'pending', billing_cycle_end: null })])
            .mockResolvedValueOnce([PACKAGE])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([subscriber({ status: 'active' })]);

        const result = await lifecycle.activateSubscriber(1, {});

        expect(mockProvisionSubscriber).toHaveBeenCalled();
        expect(mockUnblockUser).toHaveBeenCalledWith('john_kamau');
        expect(result.changed).toBe(true);
    });

    test('IDEMPOTENT: no-op when already active and already covered', async () => {
        const farFuture = new Date();
        farFuture.setFullYear(farFuture.getFullYear() + 1);

        mockQuery
            .mockResolvedValueOnce([subscriber({
                status: 'active',
                billing_cycle_end: farFuture.toISOString().slice(0, 10)
            })])
            .mockResolvedValueOnce([PACKAGE]);

        const result = await lifecycle.activateSubscriber(1, {});

        expect(result.changed).toBe(false);
        expect(mockProvisionSubscriber).not.toHaveBeenCalled();
    });

    test('refuses to activate a terminated subscriber', async () => {
        mockQuery.mockResolvedValueOnce([subscriber({ status: 'terminated' })]);
        await expect(lifecycle.activateSubscriber(1, {})).rejects.toThrow(/terminated/);
    });
});

// =====================================================
// GRACE
// =====================================================

describe('setGrace', () => {
    test('keeps the subscriber online while flagging them overdue', async () => {
        mockQuery
            .mockResolvedValueOnce([subscriber({ status: 'active' })])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([subscriber({ status: 'grace' })]);

        const result = await lifecycle.setGrace(1, { until: '2026-09-05' });

        // Grace means still online — anything blocking them must be cleared,
        // since they may be arriving here from a suspended state.
        expect(mockUnblockUser).toHaveBeenCalledWith('john_kamau');
        expect(result.changed).toBe(true);
    });

    test('IDEMPOTENT: re-applying the same grace date is a no-op', async () => {
        mockQuery.mockResolvedValueOnce([
            subscriber({ status: 'grace', grace_until: '2026-09-05' })
        ]);

        const result = await lifecycle.setGrace(1, { until: '2026-09-05' });

        expect(result.changed).toBe(false);
        expect(mockUnblockUser).not.toHaveBeenCalled();
    });

    test('requires an until date', async () => {
        mockQuery.mockResolvedValueOnce([subscriber()]);
        await expect(lifecycle.setGrace(1, {})).rejects.toThrow(/until/);
    });
});

// =====================================================
// SHARED VOCABULARY
// =====================================================

describe('status contract with Dev 2', () => {
    test('exposes exactly the five agreed statuses', () => {
        expect(Object.values(lifecycle.SUBSCRIBER_STATUS).sort()).toEqual(
            ['active', 'grace', 'pending', 'suspended', 'terminated']
        );
    });

    test('only active and grace subscribers may be online', () => {
        expect(lifecycle.shouldBeOnline({ status: 'active' })).toBe(true);
        expect(lifecycle.shouldBeOnline({ status: 'grace' })).toBe(true);

        expect(lifecycle.shouldBeOnline({ status: 'pending' })).toBe(false);
        expect(lifecycle.shouldBeOnline({ status: 'suspended' })).toBe(false);
        expect(lifecycle.shouldBeOnline({ status: 'terminated' })).toBe(false);
    });

    test('toSqlDate formats in LOCAL time, not UTC', () => {
        // toISOString() would convert to UTC first. In Kenya (UTC+3) any
        // time before 03:00 local would then record the previous day and
        // shift every billing boundary.
        const midnightLocal = new Date(2026, 7, 5, 0, 30, 0);
        expect(lifecycle.toSqlDate(midnightLocal)).toBe('2026-08-05');
    });
});
