/**
 * Tests for accounting ingest — A6 usage tracking.
 *
 * The headline case is a REGRESSION TEST for a bug found by
 * scripts/isp/simulate_radius_session.js during development:
 *
 *   FreeRADIUS UPDATES the existing radacct row for every Interim-Update and
 *   for Accounting-Stop — it does not insert a new row. An ingest cursor
 *   over radacctid alone therefore sees each session exactly once, at Start,
 *   and every subsequent byte is invisible. Usage appeared to freeze at zero
 *   the moment a session was first seen.
 *
 *   The fix reads two sources: new rows by watermark, plus a re-read of every
 *   session we still believe is open.
 *
 * This is the kind of bug that passes a casual demo (the session shows up!)
 * and silently under-bills every customer forever.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

process.env.ISP_ENCRYPTION_KEY = 'c'.repeat(64);

const mockQuery = jest.fn();
jest.unstable_mockModule('../server/config/database.js', () => ({
    query: mockQuery,
    transaction: jest.fn(async (cb) => cb({ execute: jest.fn() })),
    pool: {},
    testConnection: jest.fn()
}));

const mockGetAccountingSince = jest.fn();
const mockGetAccountingByUniqueIds = jest.fn();
const mockCloseStale = jest.fn();

jest.unstable_mockModule('../server/services/isp/radius.service.js', () => ({
    getAccountingSince: mockGetAccountingSince,
    getAccountingByUniqueIds: mockGetAccountingByUniqueIds,
    closeStaleAccountingSession: mockCloseStale,
    setUserPassword: jest.fn(),
    setUserGroup: jest.fn(),
    bindUserToMac: jest.fn(),
    unbindUserMac: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    deprovisionUser: jest.fn(),
    replaceGroupPolicy: jest.fn(),
    describeUser: jest.fn(),
    getGroupPolicy: jest.fn(),
    upsertNas: jest.fn(),
    removeNas: jest.fn(),
    getOpenAccountingSessions: jest.fn(),
    getAuthHistory: jest.fn(),
    getUserGroup: jest.fn(),
    isUserBlocked: jest.fn()
}));

const mockBindVoucher = jest.fn();
jest.unstable_mockModule('../server/services/isp/voucher.service.js', () => ({
    bindVoucherToDevice: mockBindVoucher,
    getVoucherById: jest.fn(),
    getVoucherByCode: jest.fn(),
    generateBatch: jest.fn(),
    resetBinding: jest.fn(),
    revokeVoucher: jest.fn(),
    expireDueVouchers: jest.fn(),
    evaluateDeviceAccess: jest.fn(),
    getBatchSummary: jest.fn(),
    normaliseMac: jest.fn()
}));

const accounting = await import('../server/services/isp/accounting.service.js');

/** A radacct row as FreeRADIUS would write it. */
function radacctRow(overrides = {}) {
    return {
        radacctid: 1,
        acctuniqueid: 'abc123',
        acctsessionid: 'sess-1',
        username: '254712345001',
        nasipaddress: '192.168.88.1',
        nasporttype: 'Ethernet',
        framedipaddress: '10.5.50.100',
        callingstationid: 'A4:83:E7:11:22:33',
        calledstationid: 'HenChamp',
        acctstarttime: '2026-08-05 10:00:00',
        acctupdatetime: '2026-08-05 10:30:00',
        acctstoptime: null,
        acctsessiontime: 1800,
        acctinputoctets: 0,
        acctoutputoctets: 0,
        acctterminatecause: '',
        servicetype: 'Framed-User',
        framedprotocol: 'PPP',
        ...overrides
    };
}

beforeEach(() => {
    mockQuery.mockReset();
    mockGetAccountingSince.mockReset();
    mockGetAccountingByUniqueIds.mockReset();
    mockBindVoucher.mockReset();
    mockCloseStale.mockReset();

    mockGetAccountingSince.mockResolvedValue([]);
    mockGetAccountingByUniqueIds.mockResolvedValue([]);
    mockBindVoucher.mockResolvedValue({ bound: false });
});

describe('ingestAccounting — the interim-update regression', () => {
    test('REGRESSION: re-reads still-open sessions, not just new rows', async () => {
        // Cursor read -> '5'
        mockQuery.mockResolvedValueOnce([{ cursor_value: '5' }]);
        // Open-session ids
        mockQuery.mockResolvedValueOnce([{ acct_unique_id: 'open-1' }, { acct_unique_id: 'open-2' }]);
        mockQuery.mockResolvedValue([]);   // everything after

        await accounting.ingestAccounting();

        // New rows come from the watermark...
        expect(mockGetAccountingSince).toHaveBeenCalledWith('5', expect.any(Number));

        // ...and changes to open sessions are fetched by unique id. Without
        // this second call, interim updates are never observed and usage
        // silently freezes.
        expect(mockGetAccountingByUniqueIds).toHaveBeenCalledWith(['open-1', 'open-2']);
    });

    test('a re-read open session does NOT advance the watermark', async () => {
        // A long-running low-id session must not push the cursor past
        // higher-id rows that have not been ingested yet.
        mockQuery.mockResolvedValueOnce([{ cursor_value: '100' }]);      // cursor
        mockQuery.mockResolvedValueOnce([{ acct_unique_id: 'open-1' }]); // open ids
        mockQuery.mockResolvedValue([]);

        mockGetAccountingSince.mockResolvedValue([]);                    // no new rows
        mockGetAccountingByUniqueIds.mockResolvedValue([
            radacctRow({ radacctid: 7, acctuniqueid: 'open-1' })         // low id
        ]);

        const result = await accounting.ingestAccounting();

        expect(result.watermark).toBe('100');
        expect(Number(result.watermark)).not.toBe(7);
    });

    test('deduplicates a session appearing in both sources', async () => {
        mockQuery.mockResolvedValueOnce([{ cursor_value: '0' }]);
        mockQuery.mockResolvedValueOnce([{ acct_unique_id: 'abc123' }]);
        mockQuery.mockResolvedValue([]);

        const row = radacctRow({ radacctid: 10, acctuniqueid: 'abc123' });
        mockGetAccountingSince.mockResolvedValue([row]);
        mockGetAccountingByUniqueIds.mockResolvedValue([row]);

        const result = await accounting.ingestAccounting();

        // Counted once, not twice.
        expect(result.processed).toBe(1);
    });

    test('advances the watermark to the highest NEW row id', async () => {
        mockQuery.mockResolvedValueOnce([{ cursor_value: '0' }]);
        mockQuery.mockResolvedValueOnce([]);
        mockQuery.mockResolvedValue([]);

        mockGetAccountingSince.mockResolvedValue([
            radacctRow({ radacctid: 11, acctuniqueid: 'a' }),
            radacctRow({ radacctid: 12, acctuniqueid: 'b' }),
            radacctRow({ radacctid: 13, acctuniqueid: 'c' })
        ]);

        const result = await accounting.ingestAccounting();
        expect(String(result.watermark)).toBe('13');
    });

    test('reports idle when there is nothing to do', async () => {
        mockQuery.mockResolvedValueOnce([{ cursor_value: '42' }]);
        mockQuery.mockResolvedValueOnce([]);
        mockQuery.mockResolvedValue([]);

        const result = await accounting.ingestAccounting();

        expect(result.processed).toBe(0);
        expect(result.sessionsCreated).toBe(0);
        expect(result.watermark).toBe('42');
    });

    test('one malformed row does not stall the pipeline', async () => {
        // The watermark must still advance, or the job wedges on a single
        // bad record and never ingests anything again.
        mockQuery.mockResolvedValueOnce([{ cursor_value: '0' }]);   // cursor read
        mockQuery.mockResolvedValueOnce([]);                        // open ids
        mockQuery.mockRejectedValueOnce(new Error('boom'));         // row processing blows up
        mockQuery.mockResolvedValue([]);                            // cursor write still succeeds

        mockGetAccountingSince.mockResolvedValue([radacctRow({ radacctid: 1 })]);

        const result = await accounting.ingestAccounting();

        expect(String(result.watermark)).toBe('1');
    });
});

describe('ingestAccounting — voucher binding', () => {
    test('binds a voucher session to its MAC on first use', async () => {
        mockQuery.mockResolvedValueOnce([{ cursor_value: '0' }]);   // cursor
        mockQuery.mockResolvedValueOnce([]);                        // open ids
        mockQuery.mockResolvedValueOnce([]);                        // subscriber lookup: none
        mockQuery.mockResolvedValueOnce([{ id: 55 }]);              // voucher lookup: hit
        mockQuery.mockResolvedValue([]);                            // rest

        mockGetAccountingSince.mockResolvedValue([
            radacctRow({ username: 'HC7K2M', callingstationid: 'A4:83:E7:AA:AA:AA' })
        ]);
        mockBindVoucher.mockResolvedValue({ bound: true, mac: 'A4:83:E7:AA:AA:AA' });

        const result = await accounting.ingestAccounting();

        expect(mockBindVoucher).toHaveBeenCalledWith(55, 'A4:83:E7:AA:AA:AA');
        expect(result.bound).toBe(1);
    });

    test('does not attempt to bind a subscriber session', async () => {
        mockQuery.mockResolvedValueOnce([{ cursor_value: '0' }]);
        mockQuery.mockResolvedValueOnce([]);
        mockQuery.mockResolvedValueOnce([{ id: 3 }]);   // subscriber lookup: hit
        mockQuery.mockResolvedValue([]);

        mockGetAccountingSince.mockResolvedValue([radacctRow()]);

        await accounting.ingestAccounting();

        // MAC binding is a voucher control (A5). Applying it to a PPPoE
        // subscriber would lock a household to one device.
        expect(mockBindVoucher).not.toHaveBeenCalled();
    });
});

describe('reapStaleSessions', () => {
    test('closes sessions with no recent interim update', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, acct_unique_id: 'stale-1', username: 'u1' },
            { id: 2, acct_unique_id: 'stale-2', username: 'u2' }
        ]);
        mockQuery.mockResolvedValue([]);

        const result = await accounting.reapStaleSessions({ staleSeconds: 1800 });

        expect(result.reaped).toBe(2);
        // Must close the row in radacct too — leaving it open there means
        // Simultaneous-Use still counts it and the subscriber stays locked
        // out of their own account.
        expect(mockCloseStale).toHaveBeenCalledWith('stale-1', 'Session-Timeout');
        expect(mockCloseStale).toHaveBeenCalledWith('stale-2', 'Session-Timeout');
    });

    test('does nothing when no sessions are stale', async () => {
        mockQuery.mockResolvedValueOnce([]);
        const result = await accounting.reapStaleSessions({});

        expect(result.reaped).toBe(0);
        expect(mockCloseStale).not.toHaveBeenCalled();
    });

    test('one failure does not prevent the rest being reaped', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, acct_unique_id: 'stale-1' },
            { id: 2, acct_unique_id: 'stale-2' }
        ]);
        mockQuery.mockResolvedValue([]);
        mockCloseStale.mockRejectedValueOnce(new Error('radius down'));

        const result = await accounting.reapStaleSessions({});
        expect(result.reaped).toBe(1);
    });
});
