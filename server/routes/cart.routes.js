import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { getCart, saveCart, clearCart } from '../controllers/cart.controller.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getCart);
router.post('/', saveCart);
router.delete('/', clearCart);

export default router;
