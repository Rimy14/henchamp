/**
 * ISP NAS Controller — router registry (A4)
 *
 * The most privileged surface in the ISP module: these rows hold the
 * router's admin credentials and the RADIUS shared secret. Everything here
 * requires `isp:nas`, which only Admin has, and no endpoint ever returns a
 * decrypted secret.
 */

import logger from '../utils/logger.js';
import * as nasService from '../services/isp/nas.service.js';
import { getAuditTrail } from '../services/isp/audit.js';

export async function getAllNas(req, res) {
    try {
        const rows = await nasService.listNas();
        res.json({ success: true, data: rows });
    } catch (error) {
        logger.error('Error fetching NAS list:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

export async function getNasById(req, res) {
    try {
        const nas = await nasService.getNasRow(Number(req.params.id));
        if (!nas) {
            return res.status(404).json({ success: false, message: 'NAS not found' });
        }

        const audit = await getAuditTrail('nas', Number(req.params.id), 20);
        res.json({ success: true, data: { ...nasService.sanitiseNas(nas), audit } });
    } catch (error) {
        logger.error('Error fetching NAS:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Register a router.
 *
 * Writes both our row and the FreeRADIUS `nas` row. A router present in only
 * one of them fails silently: missing from FreeRADIUS means its RADIUS
 * packets are dropped with no log entry at all.
 */
export async function createNas(req, res) {
    try {
        const required = ['name', 'shortname', 'nas_ip', 'radius_secret', 'api_host', 'api_user', 'api_password'];
        const missing = required.filter((field) => !req.body[field]);

        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required field(s): ${missing.join(', ')}`
            });
        }

        const nas = await nasService.upsertNas(req.body, req.user?.userId);

        res.status(201).json({
            success: true,
            data: nas,
            message:
                'Router registered in both the app and FreeRADIUS. ' +
                'Run the connection test to confirm the REST API is reachable.'
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'A router with that shortname already exists'
            });
        }
        logger.error('Error creating NAS:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Update a router. Secrets are optional — omitting them keeps the stored
 * values rather than blanking them.
 */
export async function updateNas(req, res) {
    try {
        const nas = await nasService.upsertNas(
            { ...req.body, id: Number(req.params.id) },
            req.user?.userId
        );
        res.json({ success: true, data: nas });
    } catch (error) {
        if (/not found/i.test(error.message)) {
            return res.status(404).json({ success: false, message: error.message });
        }
        logger.error('Error updating NAS:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

export async function deleteNas(req, res) {
    try {
        await nasService.deleteNas(Number(req.params.id), req.user?.userId);
        res.json({ success: true, message: 'Router removed from app and FreeRADIUS' });
    } catch (error) {
        if (/not found/i.test(error.message)) {
            return res.status(404).json({ success: false, message: error.message });
        }
        logger.error('Error deleting NAS:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Test connectivity to a router's REST API.
 *
 * Returns 200 with `reachable: false` rather than an error status when the
 * router cannot be reached — the request succeeded, the answer is just "no".
 * Making this a 5xx would make the UI show a generic failure instead of the
 * actual router error message, which is the useful part.
 */
export async function testNas(req, res) {
    try {
        const result = await nasService.testNasConnection(Number(req.params.id));
        res.json({ success: true, data: result });
    } catch (error) {
        if (/not found/i.test(error.message)) {
            return res.status(404).json({ success: false, message: error.message });
        }
        logger.error('Error testing NAS:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}
