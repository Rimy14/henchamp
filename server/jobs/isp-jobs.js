/**
 * ISP Background Jobs
 *
 * Three periodic tasks:
 *   accounting-ingest  radacct -> isp_sessions -> isp_usage_daily   (A6)
 *   session-reaper     close sessions that stopped reporting
 *   voucher-expiry     expire vouchers past their validity window
 *
 * Deliberately setInterval and not a cron library. At this scale (100–150
 * subscribers, one app process) that is enough, and it adds no dependency.
 *
 * ⚠️ SINGLE-PROCESS ASSUMPTION. If the app is ever run under PM2 cluster
 * mode or on multiple hosts, every instance would run these concurrently.
 * The accounting cursor makes double-ingest harmless (deltas come out zero),
 * but the reaper and expiry would duplicate work. Before scaling out, move
 * these behind a lock or a dedicated worker — see the note on task-queue.js
 * about Bull/BullMQ for multi-server deployments.
 */

import logger from '../utils/logger.js';
import * as accounting from '../services/isp/accounting.service.js';
import * as voucherService from '../services/isp/voucher.service.js';

const timers = [];
let running = false;

/**
 * Wrap a job so that a failure logs and is swallowed.
 *
 * An unhandled rejection inside setInterval would hit the process-level
 * handler in server.js, which calls process.exit(1). A transient RADIUS
 * database hiccup must not take down the whole POS system with it.
 */
function guard(name, fn) {
    return async () => {
        const started = Date.now();
        try {
            const result = await fn();
            const ms = Date.now() - started;

            // Only log when something actually happened — a 60s poll that
            // logs "nothing to do" forever buries real events.
            if (result && hasWork(result)) {
                logger.info(`ISP job "${name}" completed`, { ...result, ms });
            } else {
                logger.debug(`ISP job "${name}" idle`, { ms });
            }
        } catch (error) {
            logger.error(`ISP job "${name}" failed`, {
                error: error.message,
                stack: error.stack
            });
        }
    };
}

function hasWork(result) {
    return Object.entries(result).some(
        ([key, value]) => key !== 'watermark' && typeof value === 'number' && value > 0
    );
}

/**
 * Register an interval and run it once immediately.
 *
 * Running on start means a restart catches up on anything missed while the
 * process was down, rather than waiting a full interval first.
 */
function schedule(name, intervalMs, fn) {
    const job = guard(name, fn);

    // Defer the first run briefly so it does not compete with boot-time
    // connection setup.
    const kickoff = setTimeout(job, 5_000);
    const timer = setInterval(job, intervalMs);

    // Do not hold the event loop open — the HTTP server governs process
    // lifetime, not these timers.
    if (typeof timer.unref === 'function') timer.unref();
    if (typeof kickoff.unref === 'function') kickoff.unref();

    timers.push(timer, kickoff);

    logger.info(`ISP job "${name}" scheduled`, { everyMs: intervalMs });
}

/**
 * Start all ISP background jobs.
 * No-op when ISP_JOBS_ENABLED is not 'true', or if already running.
 */
export function startIspJobs() {
    if (process.env.ISP_JOBS_ENABLED !== 'true') {
        logger.info('ISP background jobs disabled (set ISP_JOBS_ENABLED=true to enable)');
        return false;
    }
    if (running) {
        logger.warn('ISP background jobs already running');
        return false;
    }

    const accountingInterval = parseInt(process.env.ISP_ACCOUNTING_INTERVAL_MS || '60000', 10);
    const reaperInterval = parseInt(process.env.ISP_REAPER_INTERVAL_MS || '300000', 10);

    schedule('accounting-ingest', accountingInterval, () => accounting.ingestAccounting());
    schedule('session-reaper', reaperInterval, () => accounting.reapStaleSessions());
    schedule('voucher-expiry', reaperInterval, () => voucherService.expireDueVouchers());

    running = true;
    return true;
}

/** Stop all ISP jobs. Used by tests and graceful shutdown. */
export function stopIspJobs() {
    for (const timer of timers) {
        clearInterval(timer);
        clearTimeout(timer);
    }
    timers.length = 0;
    running = false;
    logger.info('ISP background jobs stopped');
}

export function isRunning() {
    return running;
}
