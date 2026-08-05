/**
 * RADIUS Attribute Helpers
 *
 * Pure functions that translate between our package/usage model and the
 * MikroTik RADIUS wire format. No database, no network — everything here is
 * unit-testable in isolation, which matters because getting any of it wrong
 * is invisible until a real subscriber is affected.
 *
 * MikroTik vendor ID: 14988
 */

/** 2^32 — the point at which 32-bit RADIUS counters wrap. */
export const GIGAWORD = 4294967296n;

/** Largest value a uint32 RADIUS attribute can carry. */
export const UINT32_MAX = 4294967295n;

// =====================================================
// BYTE COUNTERS / GIGAWORDS
// =====================================================

/**
 * Combine a 32-bit octet counter with its gigawords companion into a real
 * byte count.
 *
 * Acct-Input-Octets and Acct-Output-Octets are 32-bit and wrap at 4 GiB.
 * RADIUS carries the high-order 32 bits separately in Acct-Input-Gigawords
 * (52) and Acct-Output-Gigawords (53):
 *
 *     real_bytes = (gigawords * 2^32) + octets
 *
 * Skipping this is the single most common bug in ISP billing code: a
 * subscriber on a 20 GB plan reports ~1.2 GB and is never capped, and it
 * never shows up in testing because nobody moves 4 GiB during a test.
 *
 * Arithmetic is done in BigInt to avoid float error, then narrowed to Number.
 * Number is exact to 2^53 bytes (~9 PB), far beyond any subscriber.
 *
 * @param {number|string|bigint} octets - low 32 bits
 * @param {number|string|bigint} gigawords - high 32 bits
 * @returns {number} true byte count
 */
export function foldGigawords(octets, gigawords) {
    const low = toBigInt(octets);
    const high = toBigInt(gigawords);

    if (low < 0n || high < 0n) {
        throw new RangeError('Octet counters cannot be negative');
    }

    return Number(low + high * GIGAWORD);
}

/**
 * Split a byte count into the (octets, gigawords) pair RADIUS expects when
 * we are *sending* a limit — e.g. Mikrotik-Total-Limit (17) plus
 * Mikrotik-Total-Limit-Gigawords (18).
 *
 * @param {number|string|bigint} bytes
 * @returns {{octets: number, gigawords: number}}
 */
export function splitGigawords(bytes) {
    const total = toBigInt(bytes);

    if (total < 0n) {
        throw new RangeError('Byte limit cannot be negative');
    }

    return {
        octets: Number(total % GIGAWORD),
        gigawords: Number(total / GIGAWORD)
    };
}

/**
 * Does this byte value need a gigawords companion attribute to survive the
 * trip over the wire?
 *
 * @param {number|string|bigint} bytes
 * @returns {boolean}
 */
export function needsGigawords(bytes) {
    return toBigInt(bytes) > UINT32_MAX;
}

function toBigInt(value) {
    if (value === null || value === undefined || value === '') return 0n;
    if (typeof value === 'bigint') return value;

    // mysql2 hands back BIGINT columns as strings once they exceed 2^53.
    if (typeof value === 'string') {
        if (!/^-?\d+$/.test(value.trim())) {
            throw new TypeError(`Expected an integer string, got "${value}"`);
        }
        return BigInt(value.trim());
    }

    if (typeof value === 'number') {
        if (!Number.isInteger(value)) {
            throw new TypeError(`Expected an integer, got ${value}`);
        }
        return BigInt(value);
    }

    throw new TypeError(`Cannot convert ${typeof value} to a byte counter`);
}

// =====================================================
// RATE LIMITING
// =====================================================

/**
 * Format a kbps figure the way RouterOS wants it.
 *
 * MikroTik uses decimal multipliers: k = 1000, M = 1000000. Our packages are
 * stored in kbps, so 10000 kbps -> "10M" and 512 kbps -> "512k".
 *
 * @param {number} kbps
 * @returns {string}
 */
export function formatRate(kbps) {
    if (!Number.isInteger(kbps) || kbps <= 0) {
        throw new RangeError(`Rate must be a positive integer in kbps, got ${kbps}`);
    }

    if (kbps % 1000 === 0) return `${kbps / 1000}M`;
    return `${kbps}k`;
}

/**
 * Build the Mikrotik-Rate-Limit (attribute 8) string for a package.
 *
 * Wire format:
 *   rx-rate[/tx-rate] [rx-burst-rate/tx-burst-rate]
 *   [rx-burst-threshold/tx-burst-threshold] [rx-burst-time/tx-burst-time]
 *
 * ⚠️ DIRECTION. The names are from the *router's* point of view:
 *   rx = data the router RECEIVES from the subscriber = their UPLOAD
 *   tx = data the router TRANSMITS to the subscriber = their DOWNLOAD
 *
 * So a 10 Mbps-down / 2 Mbps-up plan is "2M/10M", not "10M/2M". Ship this
 * backwards and every customer gets an inverted plan. Verified against a
 * live router before release — see docs/MANUAL_TESTING.md.
 *
 * @param {object} pkg - row from isp_packages
 * @returns {string|null} null when the package is uncapped
 */
export function buildRateLimit(pkg) {
    const up = pkg.rate_up_kbps;
    const down = pkg.rate_down_kbps;

    // No shaping configured — omit the attribute entirely rather than
    // sending something meaningless.
    if (!up && !down) return null;

    if (!up || !down) {
        throw new Error(
            `Package ${pkg.code || pkg.id}: rate_up_kbps and rate_down_kbps must both be set or both be null`
        );
    }

    let limit = `${formatRate(up)}/${formatRate(down)}`;

    const burstUp = pkg.burst_up_kbps;
    const burstDown = pkg.burst_down_kbps;
    if (!burstUp && !burstDown) return limit;

    if (!burstUp || !burstDown) {
        throw new Error(
            `Package ${pkg.code || pkg.id}: burst_up_kbps and burst_down_kbps must both be set or both be null`
        );
    }
    if (burstUp < up || burstDown < down) {
        throw new Error(
            `Package ${pkg.code || pkg.id}: burst rate must be >= the committed rate`
        );
    }

    limit += ` ${formatRate(burstUp)}/${formatRate(burstDown)}`;

    // Burst threshold: the average rate below which bursting is allowed.
    // RouterOS requires threshold <= burst rate. Default to the committed
    // rate, which is the conventional choice.
    const thresholdUp = pkg.burst_threshold_up_kbps || up;
    const thresholdDown = pkg.burst_threshold_down_kbps || down;
    limit += ` ${formatRate(thresholdUp)}/${formatRate(thresholdDown)}`;

    const burstTime = pkg.burst_time_seconds;
    if (burstTime) {
        if (!Number.isInteger(burstTime) || burstTime <= 0) {
            throw new RangeError(`burst_time_seconds must be a positive integer, got ${burstTime}`);
        }
        limit += ` ${burstTime}/${burstTime}`;
    }

    return limit;
}

// =====================================================
// MAC ADDRESSES
// =====================================================

const MAC_HEX = /^[0-9A-F]{12}$/;

/**
 * Normalise a MAC address to uppercase colon-separated form.
 *
 * Routers are inconsistent: MikroTik hotspot sends "A4:83:E7:11:22:33",
 * other kit sends "a4-83-e7-11-22-33" or "a483.e711.2233". Voucher binding
 * compares these values for equality, so every MAC that enters the system
 * goes through here first. Comparing unnormalised MACs silently breaks A5.
 *
 * @param {string} mac
 * @returns {string} e.g. "A4:83:E7:11:22:33"
 * @throws {TypeError} if it is not a valid 48-bit MAC
 */
export function normaliseMac(mac) {
    if (typeof mac !== 'string') {
        throw new TypeError(`MAC address must be a string, got ${typeof mac}`);
    }

    const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();

    if (!MAC_HEX.test(hex)) {
        throw new TypeError(`Invalid MAC address: "${mac}"`);
    }

    return hex.match(/.{2}/g).join(':');
}

/**
 * Non-throwing variant for untrusted input (RADIUS accounting rows can carry
 * empty or malformed Calling-Station-Id values, particularly for PPPoE
 * sessions on some firmware).
 *
 * @param {string} mac
 * @returns {string|null}
 */
export function tryNormaliseMac(mac) {
    try {
        return normaliseMac(mac);
    } catch {
        return null;
    }
}

/**
 * Compare two MAC addresses safely, normalising both sides.
 *
 * @returns {boolean} false if either side is missing or malformed
 */
export function macEquals(a, b) {
    const left = tryNormaliseMac(a);
    const right = tryNormaliseMac(b);
    return left !== null && right !== null && left === right;
}

// =====================================================
// PACKAGE -> RADIUS REPLY ATTRIBUTES
// =====================================================

/**
 * Translate a package row into the set of radgroupreply rows that define it.
 *
 * @param {object} pkg - row from isp_packages
 * @returns {Array<{attribute: string, op: string, value: string}>}
 */
export function buildGroupReplyAttributes(pkg) {
    const attributes = [];

    const rateLimit = buildRateLimit(pkg);
    if (rateLimit) {
        attributes.push({ attribute: 'Mikrotik-Rate-Limit', op: ':=', value: rateLimit });
    }

    // Data cap. Mikrotik-Total-Limit is uint32, so anything above 4 GiB needs
    // the Gigawords companion or the router sees a wrapped value.
    if (pkg.data_cap_mb) {
        const capBytes = BigInt(pkg.data_cap_mb) * 1024n * 1024n;
        const { octets, gigawords } = splitGigawords(capBytes);

        attributes.push({ attribute: 'Mikrotik-Total-Limit', op: ':=', value: String(octets) });
        if (gigawords > 0) {
            attributes.push({
                attribute: 'Mikrotik-Total-Limit-Gigawords',
                op: ':=',
                value: String(gigawords)
            });
        }
    }

    // Time-based vouchers: hand the router a session timeout so it enforces
    // expiry itself rather than relying on our poller noticing.
    if (pkg.validity_minutes) {
        attributes.push({
            attribute: 'Session-Timeout',
            op: ':=',
            value: String(pkg.validity_minutes * 60)
        });
    }

    // Interim accounting. Without this, usage figures only update at session
    // end and stale sessions are undetectable (see the reaper job).
    attributes.push({ attribute: 'Acct-Interim-Interval', op: ':=', value: '600' });

    return attributes;
}

/**
 * Translate a package row into its radgroupcheck rows.
 *
 * @param {object} pkg
 * @returns {Array<{attribute: string, op: string, value: string}>}
 */
export function buildGroupCheckAttributes(pkg) {
    const attributes = [];

    // Concurrency cap. For vouchers this is what stops one code running two
    // sessions at once; combined with MAC binding it satisfies A5.
    const simultaneous = pkg.simultaneous_use ?? 1;
    attributes.push({
        attribute: 'Simultaneous-Use',
        op: ':=',
        value: String(simultaneous)
    });

    return attributes;
}
