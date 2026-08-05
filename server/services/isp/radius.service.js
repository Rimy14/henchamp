/**
 * RADIUS Policy Service
 *
 * The ONLY module that writes to the FreeRADIUS tables. Everything else goes
 * through here, so there is exactly one place where the meaning of a
 * `radcheck` row is decided.
 *
 * Mental model: FreeRADIUS answers the router; we only shape the policy it
 * reads. We never authenticate anyone ourselves. If this application is down,
 * subscribers already online stay online and new logins still work — which is
 * precisely why the RADIUS tables are the source of truth rather than a
 * cache of ours.
 *
 * Two operators matter and they are not interchangeable:
 *   `:=`  assign / replace   — passwords, reply attributes
 *   `==`  must equal         — conditions that can FAIL (e.g. MAC binding)
 *
 * Using `:=` where `==` was meant turns a check into an assignment: the
 * condition always passes and the control silently does nothing. That single
 * character is the difference between voucher device-locking working and
 * being a no-op.
 *
 * See docs/ISP_LEARN.md §5.
 */

import { radiusQuery, radiusTransaction } from '../../config/radius-db.js';
import logger from '../../utils/logger.js';

// =====================================================
// USER-LEVEL CHECK ITEMS (radcheck)
// =====================================================

/**
 * Set a user's password.
 *
 * Cleartext-Password is required by CHAP/MS-CHAP — the server must be able
 * to recompute hash(challenge + password), which a bcrypt digest cannot
 * support. See services/isp/crypto.js for the mitigations.
 *
 * @param {string} username
 * @param {string} password
 */
export async function setUserPassword(username, password) {
    await replaceCheckAttribute(username, 'Cleartext-Password', ':=', password);
}

/**
 * Lock a username to a single device (A5).
 *
 * MUST use `==`. With `:=` FreeRADIUS would assign the MAC into the request
 * instead of comparing against it, and every device would be accepted.
 *
 * @param {string} username
 * @param {string} normalisedMac - already through normaliseMac()
 */
export async function bindUserToMac(username, normalisedMac) {
    await replaceCheckAttribute(username, 'Calling-Station-Id', '==', normalisedMac);
    logger.info('RADIUS: bound user to MAC', { username, mac: normalisedMac });
}

/**
 * Remove a device lock, freeing the credential for a different device.
 * @param {string} username
 */
export async function unbindUserMac(username) {
    await deleteCheckAttribute(username, 'Calling-Station-Id');
    logger.info('RADIUS: cleared MAC binding', { username });
}

/**
 * Block future authentications.
 *
 * NOTE: this does nothing to a session that is already established. A PPPoE
 * session can stay up for weeks and will never re-authenticate. Cutting off
 * a live subscriber additionally requires kicking the session — see
 * lifecycle.service.js and routeros.service.js.
 *
 * @param {string} username
 */
export async function blockUser(username) {
    await replaceCheckAttribute(username, 'Auth-Type', ':=', 'Reject');
    logger.info('RADIUS: blocked user', { username });
}

/**
 * Reverse blockUser(). Idempotent — a no-op if the user was never blocked.
 * @param {string} username
 */
export async function unblockUser(username) {
    await deleteCheckAttribute(username, 'Auth-Type');
    logger.info('RADIUS: unblocked user', { username });
}

/**
 * Is this user currently blocked?
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export async function isUserBlocked(username) {
    const rows = await radiusQuery(
        `SELECT 1 FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject' LIMIT 1`,
        [username]
    );
    return rows.length > 0;
}

/**
 * Upsert a single check attribute.
 *
 * Delete-then-insert inside a transaction rather than UPDATE, because
 * radcheck has no unique constraint on (username, attribute) — duplicates
 * are legal in the schema and FreeRADIUS would evaluate all of them. That
 * would mean a stale password row silently continuing to grant access
 * alongside the new one.
 */
async function replaceCheckAttribute(username, attribute, op, value) {
    await radiusTransaction(async (conn) => {
        await conn.execute(
            'DELETE FROM radcheck WHERE username = ? AND attribute = ?',
            [username, attribute]
        );
        await conn.execute(
            'INSERT INTO radcheck (username, attribute, op, value) VALUES (?, ?, ?, ?)',
            [username, attribute, op, value]
        );
    });
}

async function deleteCheckAttribute(username, attribute) {
    await radiusQuery(
        'DELETE FROM radcheck WHERE username = ? AND attribute = ?',
        [username, attribute]
    );
}

// =====================================================
// GROUP MEMBERSHIP (radusergroup)
// =====================================================

/**
 * Put a user in exactly one group.
 *
 * Package membership is exclusive here: a subscriber is on one tariff. If a
 * user accumulated rows for two groups, FreeRADIUS would merge both sets of
 * reply attributes by priority and the effective speed would depend on
 * insertion order — a bug that only shows up after a package change.
 *
 * @param {string} username
 * @param {string} groupname
 */
export async function setUserGroup(username, groupname) {
    await radiusTransaction(async (conn) => {
        await conn.execute('DELETE FROM radusergroup WHERE username = ?', [username]);
        await conn.execute(
            'INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)',
            [username, groupname]
        );
    });
}

/**
 * @param {string} username
 * @returns {Promise<string|null>}
 */
export async function getUserGroup(username) {
    const rows = await radiusQuery(
        'SELECT groupname FROM radusergroup WHERE username = ? ORDER BY priority LIMIT 1',
        [username]
    );
    return rows.length ? rows[0].groupname : null;
}

// =====================================================
// GROUP POLICY (radgroupcheck / radgroupreply)
// =====================================================

/**
 * Replace a group's entire policy — this is how a package definition becomes
 * RADIUS configuration.
 *
 * Full replacement rather than incremental patching: it makes the operation
 * idempotent and convergent, so re-provisioning a package after an edit
 * cannot leave an orphaned attribute from the previous definition behind.
 *
 * @param {string} groupname
 * @param {Array<{attribute,op,value}>} checkAttributes
 * @param {Array<{attribute,op,value}>} replyAttributes
 */
export async function replaceGroupPolicy(groupname, checkAttributes, replyAttributes) {
    await radiusTransaction(async (conn) => {
        await conn.execute('DELETE FROM radgroupcheck WHERE groupname = ?', [groupname]);
        await conn.execute('DELETE FROM radgroupreply WHERE groupname = ?', [groupname]);

        for (const attr of checkAttributes) {
            await conn.execute(
                'INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES (?, ?, ?, ?)',
                [groupname, attr.attribute, attr.op, String(attr.value)]
            );
        }
        for (const attr of replyAttributes) {
            await conn.execute(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, ?, ?, ?)',
                [groupname, attr.attribute, attr.op, String(attr.value)]
            );
        }
    });

    logger.info('RADIUS: replaced group policy', {
        groupname,
        checks: checkAttributes.length,
        replies: replyAttributes.length
    });
}

/**
 * Read back a group's policy — used by the verification endpoint so an admin
 * can confirm what the router will actually receive.
 *
 * @param {string} groupname
 */
export async function getGroupPolicy(groupname) {
    const [checks, replies] = await Promise.all([
        radiusQuery(
            'SELECT attribute, op, value FROM radgroupcheck WHERE groupname = ? ORDER BY attribute',
            [groupname]
        ),
        radiusQuery(
            'SELECT attribute, op, value FROM radgroupreply WHERE groupname = ? ORDER BY attribute',
            [groupname]
        )
    ]);
    return { groupname, check: checks, reply: replies };
}

// =====================================================
// FULL USER LIFECYCLE
// =====================================================

/**
 * Remove every RADIUS trace of a username.
 *
 * Used when a subscriber is terminated or a voucher is revoked. Deliberately
 * does not touch radacct — accounting history is kept for billing disputes
 * and reporting even after the credential is gone.
 *
 * @param {string} username
 */
export async function deprovisionUser(username) {
    await radiusTransaction(async (conn) => {
        await conn.execute('DELETE FROM radcheck WHERE username = ?', [username]);
        await conn.execute('DELETE FROM radreply WHERE username = ?', [username]);
        await conn.execute('DELETE FROM radusergroup WHERE username = ?', [username]);
    });
    logger.info('RADIUS: deprovisioned user', { username });
}

/**
 * Inspect everything RADIUS knows about a username. Powers the "why can't
 * this person log in?" support view.
 *
 * @param {string} username
 */
export async function describeUser(username) {
    const [check, reply, group] = await Promise.all([
        radiusQuery(
            'SELECT attribute, op, value FROM radcheck WHERE username = ? ORDER BY attribute',
            [username]
        ),
        radiusQuery(
            'SELECT attribute, op, value FROM radreply WHERE username = ? ORDER BY attribute',
            [username]
        ),
        getUserGroup(username)
    ]);

    return {
        username,
        group,
        check: check.map(redactPassword),
        reply,
        blocked: check.some((a) => a.attribute === 'Auth-Type' && a.value === 'Reject'),
        boundMac: check.find((a) => a.attribute === 'Calling-Station-Id')?.value || null
    };
}

/**
 * Never return a cleartext password over the API, even to an admin. The
 * support view needs to know a password is *set*, not what it is.
 */
function redactPassword(attr) {
    if (attr.attribute === 'Cleartext-Password') {
        return { ...attr, value: '••••••••' };
    }
    return attr;
}

// =====================================================
// NAS REGISTRY
// =====================================================

/**
 * Register (or update) a router in the FreeRADIUS `nas` table.
 *
 * A router missing from this table is silently ignored by FreeRADIUS — no
 * log line, no rejection, nothing. It is the single most common cause of
 * "the router is configured but authentication does nothing".
 *
 * @param {{nasname, shortname, secret, description?, type?}} nas
 */
export async function upsertNas({ nasname, shortname, secret, description, type = 'mikrotik' }) {
    await radiusTransaction(async (conn) => {
        await conn.execute('DELETE FROM nas WHERE shortname = ?', [shortname]);
        await conn.execute(
            `INSERT INTO nas (nasname, shortname, type, secret, description)
             VALUES (?, ?, ?, ?, ?)`,
            [nasname, shortname, type, secret, description || 'HenChamp managed router']
        );
    });
    logger.info('RADIUS: registered NAS', { shortname, nasname });
}

/**
 * @param {string} shortname
 */
export async function removeNas(shortname) {
    await radiusQuery('DELETE FROM nas WHERE shortname = ?', [shortname]);
}

// =====================================================
// ACCOUNTING READS (radacct)
// =====================================================

/**
 * Read accounting rows newer than a watermark.
 *
 * Incremental by radacctid so ingestion is O(new rows) rather than O(table).
 * radacct grows without bound on a live system; a full scan on every poll
 * would degrade steadily and invisibly until it fell over.
 *
 * @param {number|string} sinceRadacctId
 * @param {number} limit
 */
export async function getAccountingSince(sinceRadacctId, limit = 500) {
    // LIMIT is interpolated because MySQL will not accept a placeholder for
    // it in a prepared statement. Coerced to an integer first so it cannot
    // carry an injection.
    const safeLimit = Math.max(1, Math.min(5000, parseInt(limit, 10) || 500));

    return radiusQuery(
        `SELECT radacctid, acctuniqueid, acctsessionid, username,
                nasipaddress, nasporttype, framedipaddress,
                callingstationid, calledstationid,
                acctstarttime, acctupdatetime, acctstoptime,
                acctsessiontime, acctinputoctets, acctoutputoctets,
                acctterminatecause, servicetype, framedprotocol
           FROM radacct
          WHERE radacctid > ?
          ORDER BY radacctid ASC
          LIMIT ${safeLimit}`,
        [String(sinceRadacctId)]
    );
}

/**
 * Re-read specific accounting rows by their unique id.
 *
 * Needed because FreeRADIUS UPDATES an existing radacct row for every
 * Interim-Update and for Accounting-Stop — it does not insert a new one. A
 * cursor over radacctid therefore sees a session exactly once, at Start, and
 * never observes another byte of its traffic.
 *
 * The ingester pairs this with the id watermark: new rows come from the
 * watermark, changes to still-open sessions come from here. Cost is bounded
 * by the number of concurrent sessions (~150 here), not by table size,
 * because a closed session can never change again.
 *
 * @param {string[]} acctUniqueIds
 */
export async function getAccountingByUniqueIds(acctUniqueIds) {
    if (!Array.isArray(acctUniqueIds) || acctUniqueIds.length === 0) return [];

    // Chunked so a large open-session count cannot build a statement with
    // more placeholders than MySQL will accept.
    const CHUNK = 500;
    const results = [];

    for (let i = 0; i < acctUniqueIds.length; i += CHUNK) {
        const chunk = acctUniqueIds.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => '?').join(',');

        const rows = await radiusQuery(
            `SELECT radacctid, acctuniqueid, acctsessionid, username,
                    nasipaddress, nasporttype, framedipaddress,
                    callingstationid, calledstationid,
                    acctstarttime, acctupdatetime, acctstoptime,
                    acctsessiontime, acctinputoctets, acctoutputoctets,
                    acctterminatecause, servicetype, framedprotocol
               FROM radacct
              WHERE acctuniqueid IN (${placeholders})`,
            chunk
        );
        results.push(...rows);
    }

    return results;
}

/**
 * Sessions FreeRADIUS still considers open.
 *
 * Note these can be stale: if a router reboots, the Acct-Stop never arrives
 * and the row stays open forever. Combined with Simultaneous-Use := 1 that
 * locks a subscriber out of their own account, which is what the session
 * reaper job exists to prevent.
 */
export async function getOpenAccountingSessions() {
    return radiusQuery(
        `SELECT radacctid, acctuniqueid, username, nasipaddress, framedipaddress,
                callingstationid, acctstarttime, acctupdatetime,
                acctsessiontime, acctinputoctets, acctoutputoctets
           FROM radacct
          WHERE acctstoptime IS NULL
          ORDER BY acctstarttime DESC`,
        []
    );
}

/**
 * Force-close a stale accounting row.
 *
 * Writing into FreeRADIUS's own table is a deliberate exception to the
 * read-only rule for radacct: the alternative is a subscriber permanently
 * locked out by a session that no longer exists.
 *
 * @param {string} acctUniqueId
 * @param {string} cause
 */
export async function closeStaleAccountingSession(acctUniqueId, cause = 'Session-Timeout') {
    await radiusQuery(
        `UPDATE radacct
            SET acctstoptime = NOW(), acctterminatecause = ?
          WHERE acctuniqueid = ? AND acctstoptime IS NULL`,
        [cause, acctUniqueId]
    );
}

/**
 * Recent authentication attempts for a user — the first thing to look at
 * when someone reports "it says wrong password".
 *
 * @param {string} username
 * @param {number} limit
 */
export async function getAuthHistory(username, limit = 20) {
    const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
    return radiusQuery(
        `SELECT reply, authdate FROM radpostauth
          WHERE username = ? ORDER BY authdate DESC LIMIT ${safeLimit}`,
        [username]
    );
}
