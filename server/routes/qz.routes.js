import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const router = express.Router();

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load private key once at startup if enabled
const privateKeyPath = path.join(__dirname, '..', '..', 'private-key.pem');
let privateKey;

if (process.env.ENABLE_QZ_TRAY === 'true') {
    try {
        privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        console.log('✓ QZ Tray private key loaded successfully');
    } catch (error) {
        console.warn('⚠️ QZ Tray integration enabled but private key failed to load:', error.message);
    }
} else {
    console.log('ℹ QZ Tray integration is disabled in configuration (A4 printing will be used)');
}

/**
 * Serve digital certificate
 * GET /qz/digital-certificate.txt
 */
router.get('/digital-certificate.txt', (req, res) => {
    const certPath = path.join(__dirname, '..', '..', 'digital-certificate.txt');

    try {
        const cert = fs.readFileSync(certPath, 'utf8');
        res.type('text/plain').send(cert);
        console.log('✓ Certificate served successfully');
    } catch (error) {
        console.error('✗ Failed to serve certificate:', error.message);
        res.status(404).send('Certificate not found');
    }
});

/**
 * Sign data for QZ Tray
 * POST /api/qz/sign
 * Body: { request: "data to sign" }
 */
router.post('/sign', async (req, res) => {
    try {
        const { request } = req.body;

        if (!request) {
            return res.status(400).json({
                success: false,
                message: 'Missing request parameter'
            });
        }

        if (!privateKey) {
            return res.status(500).json({
                success: false,
                message: 'Private key not loaded'
            });
        }

        // Create signature using SHA256
        const sign = crypto.createSign('SHA256');
        sign.update(request);
        sign.end();

        // Sign with private key and encode as base64
        const signature = sign.sign(privateKey, 'base64');

        res.json({
            success: true,
            signature: signature
        });

    } catch (error) {
        console.error('QZ signing error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sign request',
            error: error.message
        });
    }
});

export default router;
