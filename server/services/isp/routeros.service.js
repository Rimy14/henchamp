/**
 * RouterOS REST API Client
 *
 * Talks to MikroTik routers over the JSON REST API introduced in RouterOS
 * v7.1beta4. Used for imperative actions RADIUS cannot express — reading
 * live sessions and terminating them.
 *
 * NO THIRD-PARTY LIBRARY, deliberately. The obvious npm packages are dead:
 * `node-routeros` was archived by its author in March 2024, and
 * `routeros-client` / `mikronode` are equally unmaintained. Node 22 ships
 * native fetch, and the REST API is plain HTTP Basic + JSON, so this whole
 * client is a small file with no supply-chain surface.
 *
 * Method mapping (RouterOS convention, not REST convention):
 *   GET    -> print     PUT    -> add
 *   PATCH  -> set       DELETE -> remove
 *   POST   -> any console command
 *
 * ⚠️ Every value RouterOS returns is a STRING, including numbers and
 * booleans: `"disabled": "false"` is a truthy JavaScript string. Coerce
 * explicitly — see toBool() / toInt().
 *
 * Requires `/ip service enable www-ssl` on the router.
 */

import https from 'https';
import http from 'http';
import logger from '../../utils/logger.js';

const DEFAULT_TIMEOUT = parseInt(process.env.ISP_ROUTEROS_TIMEOUT_MS || '10000', 10);

/**
 * CHR and freshly-provisioned routers ship a self-signed certificate. In a
 * lab that is expected; in production the operator should install a real
 * certificate and set ISP_ROUTEROS_ALLOW_SELF_SIGNED=false.
 *
 * The agent is created once and reused so we are not building a new TLS
 * context per request.
 */
const allowSelfSigned = process.env.ISP_ROUTEROS_ALLOW_SELF_SIGNED !== 'false';
const httpsAgent = new https.Agent({
    rejectUnauthorized: !allowSelfSigned,
    keepAlive: true
});
const httpAgent = new http.Agent({ keepAlive: true });

/**
 * Error carrying enough context to diagnose a router problem from a log line.
 */
export class RouterOSError extends Error {
    constructor(message, { status, detail, host, path: routerPath, cause } = {}) {
        super(message);
        this.name = 'RouterOSError';
        this.status = status;
        this.detail = detail;
        this.host = host;
        this.path = routerPath;
        if (cause) this.cause = cause;
    }

    /** True when retrying later could plausibly succeed. */
    get isTransient() {
        if (this.status === undefined) return true;          // network-level
        return this.status >= 500 || this.status === 429;
    }
}

/**
 * A connection to one router. Construct from an isp_nas row via fromNasRow().
 */
export class RouterOSClient {
    /**
     * @param {object} options
     * @param {string} options.host
     * @param {number} [options.port=443]
     * @param {string} options.user
     * @param {string} options.password
     * @param {boolean} [options.useTls=true]
     * @param {number} [options.timeout]
     */
    constructor({ host, port = 443, user, password, useTls = true, timeout = DEFAULT_TIMEOUT }) {
        if (!host) throw new TypeError('RouterOSClient requires a host');
        if (!user) throw new TypeError('RouterOSClient requires a user');

        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password ?? '';
        this.useTls = useTls;
        this.timeout = timeout;
        this.baseUrl = `${useTls ? 'https' : 'http'}://${host}:${port}/rest`;
    }

    /**
     * Build a client from a decrypted isp_nas row.
     * @param {object} nas - with api_password already decrypted
     */
    static fromNasRow(nas) {
        return new RouterOSClient({
            host: nas.api_host,
            port: nas.api_port,
            user: nas.api_user,
            password: nas.api_password,
            useTls: Boolean(nas.api_use_tls)
        });
    }

    /**
     * Issue a request against the router.
     *
     * @param {string} method
     * @param {string} routerPath - e.g. '/ppp/active'
     * @param {object} [body]
     * @returns {Promise<any>}
     */
    async request(method, routerPath, body) {
        // Built on node:https rather than global fetch on purpose. Node's
        // fetch is undici-based and ignores the `agent` option — TLS
        // behaviour there can only be changed with an undici dispatcher (an
        // extra dependency) or by setting NODE_TLS_REJECT_UNAUTHORIZED
        // globally, which would disable certificate checking for the whole
        // process including M-Pesa and Paystack calls. https.request lets us
        // scope `rejectUnauthorized` to this one connection.
        const payloadBody = body === undefined ? undefined : JSON.stringify(body);
        const transport = this.useTls ? https : http;

        const options = {
            host: this.host,
            port: this.port,
            path: `/rest${routerPath}`,
            method,
            headers: {
                Authorization:
                    'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64'),
                Accept: 'application/json',
                ...(payloadBody
                    ? {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payloadBody)
                    }
                    : {})
            },
            agent: this.useTls ? httpsAgent : httpAgent,
            timeout: this.timeout
        };

        const { status, text } = await new Promise((resolve, reject) => {
            const req = transport.request(options, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode,
                        text: Buffer.concat(chunks).toString('utf8')
                    })
                );
            });

            // A router that accepts the TCP connection then stalls would
            // otherwise hang this request forever. RouterOS caps commands at
            // 60s, so anything past our timeout is a genuine fault.
            req.on('timeout', () => {
                req.destroy(
                    new RouterOSError(`RouterOS request timed out after ${this.timeout}ms`, {
                        host: this.host,
                        path: routerPath
                    })
                );
            });
            req.on('error', reject);

            if (payloadBody) req.write(payloadBody);
            req.end();
        }).catch((error) => {
            if (error instanceof RouterOSError) throw error;
            throw new RouterOSError(
                `Cannot reach RouterOS at ${this.host}:${this.port} — ${error.message}`,
                { host: this.host, path: routerPath, cause: error }
            );
        });

        let parsed = null;
        if (text) {
            try {
                parsed = JSON.parse(text);
            } catch {
                // RouterOS returns an empty body for some successful commands
                // and plain text on a few error paths.
                parsed = text;
            }
        }

        if (status < 200 || status >= 300) {
            throw new RouterOSError(parsed?.message || `RouterOS returned ${status}`, {
                status,
                detail: parsed?.detail || parsed,
                host: this.host,
                path: routerPath
            });
        }

        return parsed;
    }

    /** GET -> print */
    get(routerPath) {
        return this.request('GET', routerPath);
    }

    /** POST -> arbitrary console command */
    post(routerPath, body) {
        return this.request('POST', routerPath, body ?? {});
    }

    /** DELETE -> remove */
    delete(routerPath) {
        return this.request('DELETE', routerPath);
    }

    // =====================================================
    // HIGH-LEVEL OPERATIONS
    // =====================================================

    /**
     * Identity and version. Used by the "test connection" admin action and to
     * record routeros_version against the NAS.
     */
    async getSystemInfo() {
        const [resource, identity] = await Promise.all([
            this.get('/system/resource'),
            this.get('/system/identity')
        ]);

        return {
            version: resource?.version ?? null,
            boardName: resource?.['board-name'] ?? null,
            uptime: resource?.uptime ?? null,
            cpuLoad: toInt(resource?.['cpu-load']),
            freeMemory: toInt(resource?.['free-memory']),
            totalMemory: toInt(resource?.['total-memory']),
            identity: identity?.name ?? null
        };
    }

    /**
     * Live PPPoE sessions.
     * @returns {Promise<Array>}
     */
    async getActivePppSessions() {
        const rows = await this.get('/ppp/active');
        return asArray(rows).map((r) => ({
            id: r['.id'],
            service: 'pppoe',
            username: r.name,
            address: r.address,
            callerId: r['caller-id'] || null,   // client MAC
            uptime: r.uptime,
            encoding: r.encoding ?? null,
            sessionId: r['session-id'] ?? null
        }));
    }

    /**
     * Live hotspot sessions.
     * @returns {Promise<Array>}
     */
    async getActiveHotspotSessions() {
        const rows = await this.get('/ip/hotspot/active');
        return asArray(rows).map((r) => ({
            id: r['.id'],
            service: 'hotspot',
            username: r.user,
            address: r.address,
            callerId: r['mac-address'] || null,
            uptime: r.uptime,
            bytesIn: toInt(r['bytes-in']),
            bytesOut: toInt(r['bytes-out']),
            sessionId: r['radius-session-id'] ?? null
        }));
    }

    /**
     * Every live session on this router, both services.
     *
     * Tolerates one service being unconfigured: a router running only PPPoE
     * has no /ip/hotspot menu populated, and that is not an error.
     */
    async getActiveSessions() {
        const results = await Promise.allSettled([
            this.getActivePppSessions(),
            this.getActiveHotspotSessions()
        ]);

        const sessions = [];
        for (const result of results) {
            if (result.status === 'fulfilled') {
                sessions.push(...result.value);
            } else {
                logger.debug('RouterOS: session listing partially failed', {
                    host: this.host,
                    error: result.reason?.message
                });
            }
        }
        return sessions;
    }

    /**
     * Terminate a live PPPoE session by its RouterOS .id.
     * @param {string} id
     */
    async removePppSession(id) {
        await this.post('/ppp/active/remove', { '.id': id });
        logger.info('RouterOS: removed PPP session', { host: this.host, id });
    }

    /**
     * Terminate a live hotspot session by its RouterOS .id.
     * @param {string} id
     */
    async removeHotspotSession(id) {
        await this.post('/ip/hotspot/active/remove', { '.id': id });
        logger.info('RouterOS: removed hotspot session', { host: this.host, id });
    }

    /**
     * Kick every live session belonging to a username, whichever service it
     * is on.
     *
     * This is the enforcement half of suspension. Changing RADIUS policy
     * blocks the *next* login; without this the subscriber stays online
     * indefinitely because a PPPoE session never re-authenticates.
     *
     * @param {string} username
     * @returns {Promise<number>} sessions terminated
     */
    async disconnectUser(username) {
        const sessions = await this.getActiveSessions();
        const targets = sessions.filter((s) => s.username === username);

        let removed = 0;
        for (const session of targets) {
            try {
                if (session.service === 'pppoe') await this.removePppSession(session.id);
                else await this.removeHotspotSession(session.id);
                removed++;
            } catch (error) {
                // Losing a race with a user who disconnected on their own is
                // normal; carry on with the remaining sessions.
                logger.warn('RouterOS: failed to remove session', {
                    host: this.host,
                    username,
                    id: session.id,
                    error: error.message
                });
            }
        }

        logger.info('RouterOS: disconnected user', { host: this.host, username, removed });
        return removed;
    }
}

// =====================================================
// COERCION HELPERS
// =====================================================

/**
 * RouterOS returns booleans as the strings "true" / "false", both of which
 * are truthy in JavaScript.
 */
export function toBool(value) {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null) return false;
    return String(value).toLowerCase() === 'true';
}

/**
 * RouterOS returns numbers as strings.
 * @returns {number|null}
 */
export function toInt(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = parseInt(String(value), 10);
    return Number.isNaN(n) ? null : n;
}

/**
 * A single-record RouterOS endpoint returns an object; a list endpoint
 * returns an array; an empty list can come back as null.
 */
function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    return [value];
}
