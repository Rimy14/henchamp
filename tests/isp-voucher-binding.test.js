/**
 * Tests for A5 — voucher single-device locking.
 *
 * The client's most explicit requirement: "each voucher/code must lock to
 * one device and not be reshareable."
 *
 * Two halves are tested here:
 *   evaluateDeviceAccess()  the rule, as a pure function
 *   bindVoucherToDevice()   the first-use capture, including the race
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

process.env.ISP_ENCRYPTION_KEY = 'a'.repeat(64);

// --- Mock the data and RADIUS layers -----------------------------------
const mockQuery = jest.fn();

jest.unstable_mockModule('../server/config/database.js', () => ({
    query: mockQuery,
    transaction: jest.fn(async (cb) => cb({ execute: jest.fn() })),
    pool: {},
    testConnection: jest.fn()
}));

const mockBindUserToMac = jest.fn();
const mockUnbindUserMac = jest.fn();

jest.unstable_mockModule('../server/services/isp/radius.service.js', () => ({
    bindUserToMac: mockBindUserToMac,
    unbindUserMac: mockUnbindUserMac,
    setUserPassword: jest.fn(),
    setUserGroup: jest.fn(),
    deprovisionUser: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
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

const voucherService = await import('../server/services/isp/voucher.service.js');

beforeEach(() => {
    mockQuery.mockReset();
    mockBindUserToMac.mockReset();
    mockUnbindUserMac.mockReset();
});

// =====================================================
// THE RULE
// =====================================================

describe('evaluateDeviceAccess', () => {
    const unbound = { status: 'unused', bound_mac: null, expires_at: null };
    const bound = { status: 'active', bound_mac: 'A4:83:E7:11:22:33', expires_at: null };

    test('an unbound voucher admits the first device', () => {
        const result = voucherService.evaluateDeviceAccess(unbound, 'A4:83:E7:11:22:33');
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('unbound_first_use');
    });

    test('a bound voucher admits its own device', () => {
        const result = voucherService.evaluateDeviceAccess(bound, 'A4:83:E7:11:22:33');
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('bound_device');
    });

    test('THE CORE REQUIREMENT: a bound voucher refuses a second device', () => {
        // This is the sharing case the client is paying to prevent — one
        // customer buys a code and passes it to a friend.
        const result = voucherService.evaluateDeviceAccess(bound, 'B8:27:EB:99:88:77');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('different_device');
    });

    test('matches the bound device regardless of MAC formatting', () => {
        // The router may report a different separator or case than the one
        // stored. A raw string compare would lock out the correct device.
        expect(voucherService.evaluateDeviceAccess(bound, 'a4-83-e7-11-22-33').allowed).toBe(true);
        expect(voucherService.evaluateDeviceAccess(bound, 'a483.e711.2233').allowed).toBe(true);
        expect(voucherService.evaluateDeviceAccess(bound, 'a483e7112233').allowed).toBe(true);
    });

    test('refuses revoked, expired and used vouchers regardless of device', () => {
        for (const status of ['revoked', 'expired', 'used']) {
            const result = voucherService.evaluateDeviceAccess(
                { ...bound, status },
                'A4:83:E7:11:22:33'
            );
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe(`voucher_${status}`);
        }
    });

    test('refuses a voucher past its expiry timestamp', () => {
        const result = voucherService.evaluateDeviceAccess(
            { status: 'active', bound_mac: null, expires_at: new Date(Date.now() - 60_000) },
            'A4:83:E7:11:22:33'
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('voucher_expired');
    });

    test('admits a voucher still inside its window', () => {
        const result = voucherService.evaluateDeviceAccess(
            { status: 'active', bound_mac: null, expires_at: new Date(Date.now() + 3_600_000) },
            'A4:83:E7:11:22:33'
        );
        expect(result.allowed).toBe(true);
    });

    test('refuses an unusable MAC against a bound voucher', () => {
        expect(voucherService.evaluateDeviceAccess(bound, 'garbage').reason).toBe('invalid_mac');
        expect(voucherService.evaluateDeviceAccess(bound, '').reason).toBe('invalid_mac');
    });
});

// =====================================================
// FIRST-USE CAPTURE
// =====================================================

describe('bindVoucherToDevice', () => {
    test('binds on first use and writes the RADIUS check rule', async () => {
        mockQuery
            .mockResolvedValueOnce({ affectedRows: 1 })                       // UPDATE ... WHERE bound_mac IS NULL
            .mockResolvedValueOnce([{ id: 7, code: 'HC7K2M', package_id: 1 }]) // getVoucherById
            .mockResolvedValueOnce([{ id: 1, validity_minutes: 60 }])          // package for expiry
            .mockResolvedValueOnce({ affectedRows: 1 })                        // set expires_at
            .mockResolvedValueOnce({ affectedRows: 1 });                       // audit insert

        const result = await voucherService.bindVoucherToDevice(7, 'a4-83-e7-11-22-33');

        expect(result.bound).toBe(true);
        expect(result.mac).toBe('A4:83:E7:11:22:33');

        // The MAC must reach RADIUS normalised, or FreeRADIUS compares
        // mismatched strings and rejects the legitimate device.
        expect(mockBindUserToMac).toHaveBeenCalledWith('HC7K2M', 'A4:83:E7:11:22:33');
    });

    test('RACE SAFETY: a second concurrent bind does not overwrite the first', async () => {
        // Two accounting rows for the same voucher can be ingested at once.
        // The UPDATE is guarded by "WHERE bound_mac IS NULL", so the loser
        // affects zero rows and must leave the winner's binding alone.
        mockQuery.mockResolvedValueOnce({ affectedRows: 0 });

        const result = await voucherService.bindVoucherToDevice(7, 'B8:27:EB:99:88:77');

        expect(result.bound).toBe(false);
        expect(result.reason).toBe('already_bound');
        expect(mockBindUserToMac).not.toHaveBeenCalled();
    });

    test('skips binding when the router sent no usable MAC', async () => {
        // Some firmware omits Calling-Station-Id on PPPoE. That is not an
        // error and must not write a null binding.
        for (const mac of [null, '', 'not-a-mac', undefined]) {
            const result = await voucherService.bindVoucherToDevice(7, mac);
            expect(result.bound).toBe(false);
            expect(result.reason).toBe('no_mac');
        }
        expect(mockQuery).not.toHaveBeenCalled();
        expect(mockBindUserToMac).not.toHaveBeenCalled();
    });
});

// =====================================================
// SUPPORT RESET
// =====================================================

describe('resetBinding', () => {
    test('clears the binding, increments the counter, and clears it in RADIUS', async () => {
        // The counter-staff fix for phone MAC randomisation: a customer
        // whose device rotated its MAC is locked out of a voucher they paid
        // for, and this frees it.
        mockQuery
            .mockResolvedValueOnce([{
                id: 7, code: 'HC7K2M', status: 'active',
                bound_mac: 'A4:83:E7:11:22:33', binding_resets: 2
            }])
            .mockResolvedValueOnce({ affectedRows: 1 })   // UPDATE
            .mockResolvedValueOnce({ affectedRows: 1 });  // audit

        const result = await voucherService.resetBinding(7, 42, 'phone changed MAC');

        expect(result.previousMac).toBe('A4:83:E7:11:22:33');
        expect(result.resetCount).toBe(3);
        expect(mockUnbindUserMac).toHaveBeenCalledWith('HC7K2M');
    });

    test('refuses to reset a revoked voucher', async () => {
        mockQuery.mockResolvedValueOnce([{
            id: 7, code: 'HC7K2M', status: 'revoked', bound_mac: null, binding_resets: 0
        }]);

        await expect(voucherService.resetBinding(7, 42)).rejects.toThrow(/Cannot reset binding/);
        expect(mockUnbindUserMac).not.toHaveBeenCalled();
    });

    test('reports a missing voucher clearly', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await expect(voucherService.resetBinding(999, 42)).rejects.toThrow(/not found/);
    });
});
