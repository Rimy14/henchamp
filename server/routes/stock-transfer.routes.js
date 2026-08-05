import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

import * as transferController from '../controllers/stock-transfer.controller.js';

router.get('/', transferController.getTransfers);
router.get('/locations', transferController.getLocations);
router.get('/raw-materials', transferController.getRawMaterialsItems);
router.get('/stock-by-location', transferController.getItemStockAtLocation);
router.get('/:id', transferController.getTransferById);
router.post('/', transferController.createTransfer);

export default router;
