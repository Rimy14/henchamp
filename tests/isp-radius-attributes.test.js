/**
 * Tests for the RADIUS attribute translation layer.
 *
 * These cover the three bugs most likely to reach production unnoticed:
 *   1. the 4 GiB counter wrap (usage silently stops counting)
 *   2. inverted rate-limit direction (every customer gets the wrong plan)
 *   3. unnormalised MAC comparison (device locking silently does nothing)
 *
 * All three are invisible in casual testing, which is exactly why they are
 * pinned here.
 */

import { describe, test, expect } from '@jest/globals';
import {
    foldGigawords,
    splitGigawords,
    needsGigawords,
    formatRate,
    buildRateLimit,
    normaliseMac,
    tryNormaliseMac,
    macEquals,
    buildGroupReplyAttributes,
    buildGroupCheckAttributes,
    GIGAWORD,
    UINT32_MAX
} from '../server/services/isp/radius-attributes.js';

// =====================================================
// GIGAWORDS — the 4 GiB bug
// =====================================================

describe('gigawords folding', () => {
    test('returns plain octets when no gigawords are present', () => {
        expect(foldGigawords(1024, 0)).toBe(1024);
        expect(foldGigawords(0, 0)).toBe(0);
    });

    test('folds a single gigaword into the true byte count', () => {
        // 1 gigaword == 2^32 bytes exactly
        expect(foldGigawords(0, 1)).toBe(4294967296);
    });

    test('THE 4 GiB BUG: a 6 GB session must report 6 GB, not 1.7 GB', () => {
        // A subscriber who moved 6,000,000,000 bytes. The 32-bit counter
        // wrapped once, so the NAS reports:
        //   octets    = 6000000000 - 2^32 = 1705032704
        //   gigawords = 1
        // Reading acctinputoctets alone gives 1.7 GB — the customer appears
        // to have used a third of what they actually did and is never capped.
        const reportedOctets = 1705032704;
        const reportedGigawords = 1;

        expect(foldGigawords(reportedOctets, reportedGigawords)).toBe(6_000_000_000);

        // The naive version, pinned so the difference is explicit.
        expect(reportedOctets).not.toBe(6_000_000_000);
    });

    test('handles a 20 GB plan (4 wraps)', () => {
        const total = 20_000_000_000;
        const gigawords = Math.floor(total / Number(GIGAWORD));
        const octets = total - gigawords * Number(GIGAWORD);

        expect(gigawords).toBe(4);
        expect(foldGigawords(octets, gigawords)).toBe(total);
    });

    test('accepts BIGINT values arriving from mysql2 as strings', () => {
        expect(foldGigawords('1705032704', '1')).toBe(6_000_000_000);
    });

    test('treats null/undefined/empty as zero', () => {
        expect(foldGigawords(null, null)).toBe(0);
        expect(foldGigawords(undefined, undefined)).toBe(0);
        expect(foldGigawords('', '')).toBe(0);
    });

    test('rejects negative counters rather than corrupting a total', () => {
        expect(() => foldGigawords(-1, 0)).toThrow(RangeError);
    });

    test('rejects non-integer input', () => {
        expect(() => foldGigawords(1.5, 0)).toThrow(TypeError);
        expect(() => foldGigawords('not-a-number', 0)).toThrow(TypeError);
    });

    test('round-trips through split and fold', () => {
        for (const total of [0, 1, 4294967295, 4294967296, 6_000_000_000, 999_999_999_999]) {
            const { octets, gigawords } = splitGigawords(total);
            expect(foldGigawords(octets, gigawords)).toBe(total);
            // The low half must always fit in a uint32.
            expect(octets).toBeLessThanOrEqual(Number(UINT32_MAX));
        }
    });

    test('splitGigawords keeps sub-4GiB values in the low word', () => {
        expect(splitGigawords(1024)).toEqual({ octets: 1024, gigawords: 0 });
        expect(splitGigawords(UINT32_MAX)).toEqual({ octets: 4294967295, gigawords: 0 });
    });

    test('needsGigawords identifies values that would wrap', () => {
        expect(needsGigawords(1024)).toBe(false);
        expect(needsGigawords(UINT32_MAX)).toBe(false);
        expect(needsGigawords(Number(GIGAWORD))).toBe(true);
        expect(needsGigawords(20_000_000_000)).toBe(true);
    });
});

// =====================================================
// RATE LIMITS — the inverted-plan bug
// =====================================================

describe('formatRate', () => {
    test('uses M for whole megabits', () => {
        expect(formatRate(1000)).toBe('1M');
        expect(formatRate(10000)).toBe('10M');
    });

    test('uses k when not a whole megabit', () => {
        expect(formatRate(512)).toBe('512k');
        expect(formatRate(1500)).toBe('1500k');
    });

    test('rejects zero and negatives', () => {
        expect(() => formatRate(0)).toThrow(RangeError);
        expect(() => formatRate(-100)).toThrow(RangeError);
    });
});

describe('buildRateLimit', () => {
    test('DIRECTION: emits upload/download, i.e. rx/tx', () => {
        // A "10 Mbps down, 2 Mbps up" plan. MikroTik reads rx first, and rx
        // is what the ROUTER receives — the subscriber's upload. Inverting
        // this ships every customer a backwards plan.
        const limit = buildRateLimit({ rate_up_kbps: 2000, rate_down_kbps: 10000 });

        expect(limit).toBe('2M/10M');
        expect(limit).not.toBe('10M/2M');
    });

    test('returns null for an uncapped package', () => {
        expect(buildRateLimit({ rate_up_kbps: null, rate_down_kbps: null })).toBeNull();
    });

    test('rejects a half-configured rate rather than guessing', () => {
        expect(() => buildRateLimit({ code: 'X', rate_up_kbps: 2000, rate_down_kbps: null }))
            .toThrow(/both be set or both be null/);
    });

    test('appends burst rate and threshold', () => {
        expect(buildRateLimit({
            rate_up_kbps: 2000, rate_down_kbps: 10000,
            burst_up_kbps: 4000, burst_down_kbps: 20000
        })).toBe('2M/10M 4M/20M 2M/10M');
    });

    test('appends burst time when configured', () => {
        expect(buildRateLimit({
            rate_up_kbps: 2000, rate_down_kbps: 10000,
            burst_up_kbps: 4000, burst_down_kbps: 20000,
            burst_time_seconds: 8
        })).toBe('2M/10M 4M/20M 2M/10M 8/8');
    });

    test('honours an explicit burst threshold', () => {
        expect(buildRateLimit({
            rate_up_kbps: 2000, rate_down_kbps: 10000,
            burst_up_kbps: 4000, burst_down_kbps: 20000,
            burst_threshold_up_kbps: 1000, burst_threshold_down_kbps: 5000
        })).toBe('2M/10M 4M/20M 1M/5M');
    });

    test('rejects a burst rate below the committed rate', () => {
        expect(() => buildRateLimit({
            code: 'X',
            rate_up_kbps: 2000, rate_down_kbps: 10000,
            burst_up_kbps: 1000, burst_down_kbps: 20000
        })).toThrow(/burst rate must be >= the committed rate/);
    });
});

// =====================================================
// MAC ADDRESSES — the silent-A5-failure bug
// =====================================================

describe('normaliseMac', () => {
    test('accepts every format routers actually send', () => {
        const expected = 'A4:83:E7:11:22:33';
        expect(normaliseMac('A4:83:E7:11:22:33')).toBe(expected);
        expect(normaliseMac('a4:83:e7:11:22:33')).toBe(expected);
        expect(normaliseMac('a4-83-e7-11-22-33')).toBe(expected);
        expect(normaliseMac('a483.e711.2233')).toBe(expected);
        expect(normaliseMac('a483e7112233')).toBe(expected);
        expect(normaliseMac(' A4:83:E7:11:22:33 ')).toBe(expected);
    });

    test('rejects malformed input', () => {
        expect(() => normaliseMac('')).toThrow(TypeError);
        expect(() => normaliseMac('A4:83:E7:11:22')).toThrow(TypeError);      // too short
        expect(() => normaliseMac('A4:83:E7:11:22:33:44')).toThrow(TypeError); // too long
        expect(() => normaliseMac('ZZ:83:E7:11:22:33')).toThrow(TypeError);    // not hex
        expect(() => normaliseMac(null)).toThrow(TypeError);
        expect(() => normaliseMac(12345)).toThrow(TypeError);
    });

    test('tryNormaliseMac returns null instead of throwing', () => {
        expect(tryNormaliseMac('a4-83-e7-11-22-33')).toBe('A4:83:E7:11:22:33');
        expect(tryNormaliseMac('')).toBeNull();
        expect(tryNormaliseMac(null)).toBeNull();
        expect(tryNormaliseMac('garbage')).toBeNull();
    });

    test('macEquals compares across formats', () => {
        // A5 depends on this: the stored MAC and the one arriving from
        // accounting may be formatted differently, and a raw string compare
        // would reject the correct device.
        expect(macEquals('a4-83-e7-11-22-33', 'A4:83:E7:11:22:33')).toBe(true);
        expect(macEquals('a483.e711.2233', 'A4:83:E7:11:22:33')).toBe(true);
        expect(macEquals('A4:83:E7:11:22:34', 'A4:83:E7:11:22:33')).toBe(false);
    });

    test('macEquals is false when either side is unusable', () => {
        expect(macEquals(null, 'A4:83:E7:11:22:33')).toBe(false);
        expect(macEquals('A4:83:E7:11:22:33', '')).toBe(false);
        expect(macEquals(null, null)).toBe(false);
    });
});

// =====================================================
// PACKAGE -> RADIUS ATTRIBUTES
// =====================================================

describe('buildGroupReplyAttributes', () => {
    const find = (attrs, name) => attrs.find((a) => a.attribute === name);

    test('includes the rate limit', () => {
        const attrs = buildGroupReplyAttributes({
            code: 'PPP-10M', rate_up_kbps: 2000, rate_down_kbps: 10000
        });
        expect(find(attrs, 'Mikrotik-Rate-Limit').value).toBe('2M/10M');
    });

    test('always requests interim accounting', () => {
        // Without interim updates, usage only lands at session end and stale
        // sessions cannot be detected by age.
        const attrs = buildGroupReplyAttributes({ code: 'X' });
        expect(find(attrs, 'Acct-Interim-Interval')).toBeDefined();
    });

    test('a sub-4GiB cap needs no gigawords companion', () => {
        const attrs = buildGroupReplyAttributes({ code: 'X', data_cap_mb: 500 });

        expect(find(attrs, 'Mikrotik-Total-Limit').value).toBe(String(500 * 1024 * 1024));
        expect(find(attrs, 'Mikrotik-Total-Limit-Gigawords')).toBeUndefined();
    });

    test('THE CAP BUG: a 20 GB cap must emit the gigawords companion', () => {
        // Mikrotik-Total-Limit is uint32. 20 GB overflows it, so without
        // attribute 18 the router receives a wrapped value and caps the
        // customer at the wrong figure.
        const attrs = buildGroupReplyAttributes({ code: 'X', data_cap_mb: 20 * 1024 });

        const low = find(attrs, 'Mikrotik-Total-Limit');
        const high = find(attrs, 'Mikrotik-Total-Limit-Gigawords');

        expect(high).toBeDefined();
        expect(Number(high.value)).toBe(5);

        // Reassembling must give back exactly 20 GiB.
        expect(foldGigawords(low.value, high.value)).toBe(20 * 1024 * 1024 * 1024);
    });

    test('a time-based voucher package gets a session timeout', () => {
        const attrs = buildGroupReplyAttributes({ code: 'HS-1H', validity_minutes: 60 });
        expect(find(attrs, 'Session-Timeout').value).toBe('3600');
    });

    test('omits the rate limit entirely when uncapped', () => {
        const attrs = buildGroupReplyAttributes({ code: 'X' });
        expect(find(attrs, 'Mikrotik-Rate-Limit')).toBeUndefined();
    });
});

describe('buildGroupCheckAttributes', () => {
    test('defaults to one concurrent session', () => {
        const attrs = buildGroupCheckAttributes({ code: 'X' });
        const sim = attrs.find((a) => a.attribute === 'Simultaneous-Use');

        expect(sim.value).toBe('1');
        // Must be an assignment of the limit, not a comparison.
        expect(sim.op).toBe(':=');
    });

    test('honours an explicit concurrency limit', () => {
        const attrs = buildGroupCheckAttributes({ code: 'X', simultaneous_use: 3 });
        expect(attrs.find((a) => a.attribute === 'Simultaneous-Use').value).toBe('3');
    });
});
