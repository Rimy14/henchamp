import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', async (req, res) => {
    res.json({ success: true, data: [], message: 'Returns module - Coming soon' });
});

export default router;
