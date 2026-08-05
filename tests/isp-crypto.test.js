/**
 * Tests for secret encryption and code generation.
 *
 * The encryption here protects RADIUS passwords and router admin
 * credentials, which cannot be hashed (CHAP needs the cleartext). The code
 * generator produces vouchers that are printed and typed by hand.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

// Must be set before the module resolves its key.
process.env.ISP_ENCRYPTION_KEY =
    '0'.repeat(32) + 'f'.repeat(32);

const {
    encrypt,
    decrypt,
    randomString,
    generateSecret,
    generateVoucherCode,
    resetKeyCache,
    UNAMBIGUOUS_ALPHABET
} = await import('../server/services/isp/crypto.js');

beforeAll(() => resetKeyCache());

describe('encrypt / decrypt', () => {
    test('round-trips a secret', () => {
        const secret = 'sup3rS3cretP@ssw0rd';
        expect(decrypt(encrypt(secret))).toBe(secret);
    });

    test('round-trips unicode', () => {
        const secret = 'pässwörd-日本語-🔐';
        expect(decrypt(encrypt(secret))).toBe(secret);
    });

    test('produces a Buffer suitable for a VARBINARY column', () => {
        expect(Buffer.isBuffer(encrypt('hello'))).toBe(true);
    });

    test('is non-deterministic — the same input encrypts differently each time', () => {
        // A fresh IV per call. Without this, identical passwords would
        // produce identical ciphertext and a database dump would reveal
        // which subscribers share one.
        const a = encrypt('same-input');
        const b = encrypt('same-input');

        expect(a.equals(b)).toBe(false);
        expect(decrypt(a)).toBe(decrypt(b));
    });

    test('detects tampering via the GCM auth tag', () => {
        const payload = encrypt('sensitive');
        payload[payload.length - 1] ^= 0xff;    // flip bits in the ciphertext

        // Must throw, not return garbage.
        expect(() => decrypt(payload)).toThrow();
    });

    test('rejects a truncated payload', () => {
        expect(() => decrypt(Buffer.alloc(8))).toThrow(RangeError);
    });

    test('refuses to encrypt an empty string', () => {
        expect(() => encrypt('')).toThrow(RangeError);
    });

    test('rejects non-string input', () => {
        expect(() => encrypt(12345)).toThrow(TypeError);
        expect(() => encrypt(null)).toThrow(TypeError);
    });

    test('rejects non-Buffer input to decrypt', () => {
        expect(() => decrypt('not a buffer')).toThrow(TypeError);
    });
});

describe('key validation', () => {
    test('rejects a key of the wrong length', () => {
        const original = process.env.ISP_ENCRYPTION_KEY;
        process.env.ISP_ENCRYPTION_KEY = 'tooshort';
        resetKeyCache();

        expect(() => encrypt('x')).toThrow(/32 bytes hex-encoded/);

        process.env.ISP_ENCRYPTION_KEY = original;
        resetKeyCache();
    });

    test('rejects a missing key with actionable guidance', () => {
        const original = process.env.ISP_ENCRYPTION_KEY;
        delete process.env.ISP_ENCRYPTION_KEY;
        resetKeyCache();

        expect(() => encrypt('x')).toThrow(/ISP_ENCRYPTION_KEY is not set/);

        process.env.ISP_ENCRYPTION_KEY = original;
        resetKeyCache();
    });
});

describe('randomString', () => {
    test('produces the requested length', () => {
        for (const n of [1, 8, 16, 64]) {
            expect(randomString(n).length).toBe(n);
        }
    });

    test('draws only from the supplied alphabet', () => {
        const out = randomString(500, 'AB');
        expect(/^[AB]+$/.test(out)).toBe(true);
    });

    test('is not biased towards the start of the alphabet', () => {
        // Rejection sampling should give a roughly even split. Taking
        // `byte % length` directly would skew early characters, which for a
        // voucher alphabet makes bulk guessing measurably easier.
        const sample = randomString(6000, 'AB');
        const countA = (sample.match(/A/g) || []).length;
        const ratio = countA / sample.length;

        expect(ratio).toBeGreaterThan(0.45);
        expect(ratio).toBeLessThan(0.55);
    });

    test('rejects invalid arguments', () => {
        expect(() => randomString(0)).toThrow(RangeError);
        expect(() => randomString(-5)).toThrow(RangeError);
        expect(() => randomString(8, 'A')).toThrow(RangeError);
    });
});

describe('generateVoucherCode', () => {
    test('excludes characters people confuse on printed paper', () => {
        // 0/O and 1/I/L are the pairs that generate support calls when a
        // customer reads a code off a printed slip.
        for (const forbidden of ['0', 'O', '1', 'I', 'L']) {
            expect(UNAMBIGUOUS_ALPHABET).not.toContain(forbidden);
        }
    });

    test('generates codes only from the unambiguous alphabet', () => {
        for (let i = 0; i < 200; i++) {
            const code = generateVoucherCode(8);
            for (const char of code) {
                expect(UNAMBIGUOUS_ALPHABET).toContain(char);
            }
        }
    });

    test('has no collisions across a realistic batch', () => {
        // 1000 codes is the largest batch the API permits. Uniqueness is
        // ultimately guaranteed by the DB index, but a generator that
        // collided often would make batch creation unreliably slow.
        const codes = new Set();
        for (let i = 0; i < 1000; i++) codes.add(generateVoucherCode(8));

        expect(codes.size).toBe(1000);
    });

    test('honours a custom length', () => {
        expect(generateVoucherCode(12).length).toBe(12);
    });
});

describe('generateSecret', () => {
    test('defaults to 16 characters', () => {
        expect(generateSecret().length).toBe(16);
    });

    test('produces distinct secrets', () => {
        const secrets = new Set();
        for (let i = 0; i < 500; i++) secrets.add(generateSecret());
        expect(secrets.size).toBe(500);
    });
});
