/**
 * ISP Secret Encryption
 *
 * AES-256-GCM helpers for the `*_enc` columns (RADIUS passwords, router API
 * credentials, NAS shared secrets).
 *
 * Why encryption and not hashing: RADIUS with CHAP/MS-CHAP requires the
 * server to hold the ORIGINAL password, because the client sends
 * hash(challenge + password) and the server must recompute it. A bcrypt hash
 * is useless for that — it cannot be reversed to feed into MD5.
 *
 * So the plaintext has to exist somewhere. We keep our copy encrypted at
 * rest with a key that lives in the environment rather than the database, so
 * a dump of the database alone does not yield credentials. FreeRADIUS's own
 * radcheck table still holds Cleartext-Password (the protocol requires it) —
 * that DB user is locked to localhost and has no access to the app schema.
 *
 * Mitigating control: subscriber and voucher secrets are always
 * machine-generated (see generateSecret), never chosen by the user, so a
 * compromise cannot expose a password reused on their email account.
 *
 * See docs/ISP_PLAN.md §2.3 and docs/ISP_LEARN.md §5.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit nonce, the GCM standard
const TAG_LENGTH = 16;  // 128-bit auth tag
const KEY_LENGTH = 32;  // AES-256

let cachedKey = null;

/**
 * Read and validate the key from the environment.
 *
 * Resolved lazily rather than at import time so that unit tests which never
 * touch encryption do not need a key configured, and so a missing key
 * produces a clear error at the point of use.
 */
function getKey() {
    if (cachedKey) return cachedKey;

    const raw = process.env.ISP_ENCRYPTION_KEY;

    if (!raw) {
        throw new Error(
            'ISP_ENCRYPTION_KEY is not set. Generate one with:\n' +
            '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }

    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
        throw new Error(
            'ISP_ENCRYPTION_KEY must be exactly 32 bytes hex-encoded (64 hex characters)'
        );
    }

    cachedKey = Buffer.from(raw, 'hex');

    if (cachedKey.length !== KEY_LENGTH) {
        cachedKey = null;
        throw new Error('ISP_ENCRYPTION_KEY did not decode to 32 bytes');
    }

    return cachedKey;
}

/**
 * Clear the cached key. Tests use this after changing process.env.
 * @internal
 */
export function resetKeyCache() {
    cachedKey = null;
}

/**
 * Encrypt a secret for storage in a VARBINARY column.
 *
 * Layout: [12-byte IV][16-byte auth tag][ciphertext]
 * Self-describing, so decrypt() needs no out-of-band metadata.
 *
 * @param {string} plaintext
 * @returns {Buffer}
 */
export function encrypt(plaintext) {
    if (typeof plaintext !== 'string') {
        throw new TypeError(`Can only encrypt strings, got ${typeof plaintext}`);
    }
    if (plaintext.length === 0) {
        throw new RangeError('Refusing to encrypt an empty string');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

    const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);

    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Decrypt a value produced by encrypt().
 *
 * GCM authenticates as well as encrypts, so a tampered or truncated buffer
 * throws rather than returning garbage.
 *
 * @param {Buffer} payload
 * @returns {string}
 */
export function decrypt(payload) {
    if (!Buffer.isBuffer(payload)) {
        throw new TypeError(`Can only decrypt Buffers, got ${typeof payload}`);
    }
    if (payload.length <= IV_LENGTH + TAG_LENGTH) {
        throw new RangeError('Encrypted payload is truncated');
    }

    const iv = payload.subarray(0, IV_LENGTH);
    const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]).toString('utf8');
}

// =====================================================
// SECRET / CODE GENERATION
// =====================================================

/**
 * Alphabet for anything a human has to read off paper and retype.
 *
 * Deliberately excludes 0/O and 1/I/L — the pairs people confuse on a
 * printed voucher. 30 characters remain, so an 8-character code carries
 * ~39 bits of entropy (30^8 ≈ 6.5e11).
 */
export const UNAMBIGUOUS_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Full alphanumeric set for machine-only secrets (PPPoE passwords), where
 * legibility does not matter but entropy does.
 */
const FULL_ALPHABET =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Draw `length` characters uniformly from `alphabet` using a CSPRNG.
 *
 * Uses rejection sampling to avoid modulo bias — taking `byte % alphabet
 * .length` directly would make early characters marginally more likely,
 * which is exactly the kind of subtle weakness that makes voucher codes
 * guessable in bulk.
 *
 * @param {number} length
 * @param {string} alphabet
 * @returns {string}
 */
export function randomString(length, alphabet = FULL_ALPHABET) {
    if (!Number.isInteger(length) || length <= 0) {
        throw new RangeError(`length must be a positive integer, got ${length}`);
    }
    if (typeof alphabet !== 'string' || alphabet.length < 2) {
        throw new RangeError('alphabet must be a string of at least 2 characters');
    }

    const size = alphabet.length;
    // Largest multiple of `size` that fits in a byte; values at or above this
    // are discarded so the remaining range divides evenly.
    const ceiling = Math.floor(256 / size) * size;

    let out = '';
    while (out.length < length) {
        const bytes = crypto.randomBytes((length - out.length) * 2);
        for (const byte of bytes) {
            if (byte >= ceiling) continue;
            out += alphabet[byte % size];
            if (out.length === length) break;
        }
    }

    return out;
}

/**
 * Generate a machine-only secret (PPPoE / hotspot subscriber password).
 *
 * Subscribers never choose these. That is deliberate: RADIUS needs the
 * cleartext, so a user-chosen password would put a credential they may have
 * reused elsewhere into a recoverable store.
 *
 * @param {number} length
 * @returns {string}
 */
export function generateSecret(length = 16) {
    return randomString(length, FULL_ALPHABET);
}

/**
 * Generate a printed voucher code.
 *
 * @param {number} length
 * @returns {string}
 */
export function generateVoucherCode(length = 8) {
    return randomString(length, UNAMBIGUOUS_ALPHABET);
}
