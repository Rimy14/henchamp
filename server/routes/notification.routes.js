import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { getNotifications } from '../controllers/notification.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getNotifications);

export default router;
