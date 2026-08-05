import express from 'express';
import multer from 'multer';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';
import { validatePOCreate, validatePOStatus, validatePOPayment } from '../middleware/validation.middleware.js';
import { getAllPOs, getPOById, createPO, updatePOStatus, getPOPayments, addPOPayment, cancelPOPayment, bulkCreatePOs } from '../controllers/po.controller.js';


const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.use(verifyToken);

// Get PO CSV Bulk Upload Template (Pre-filled with Active System Items)
router.get('/bulk-template', checkPermission('po:read'), async (req, res) => {
    try {
        const { supplier_id } = req.query;

        let selectedSupplierName = '';
        const params = [];
        let whereClause = "WHERE i.status = 'active'";

        if (supplier_id) {
            const [supp] = await query('SELECT name FROM suppliers WHERE id = ?', [supplier_id]);
            if (supp) {
                selectedSupplierName = supp.name;
            }
            whereClause += " AND (i.supplier_id = ? OR i.supplier_id IS NULL)";
            params.push(supplier_id);
        }

        const items = await query(`
            SELECT i.code, i.name, i.selling_price_excl_tax, i.tax_rate, s.name as supplier_name
            FROM items i
            LEFT JOIN suppliers s ON i.supplier_id = s.id
            ${whereClause}
            ORDER BY i.name
        `, params);

        const headers = [
            'po_ref',
            'supplier_name',
            'order_date',
            'expected_delivery',
            'notes',
            'item_name',
            'item_code',
            'quantity',
            'unit_price_excl_tax',
            'tax_rate'
        ];

        const todayStr = new Date().toISOString().split('T')[0];
        const rows = [headers.join(',')];

        if (items && items.length > 0) {
            items.forEach((item) => {
                const row = [
                    'PO-001',
                    selectedSupplierName || item.supplier_name || '',
                    todayStr,
                    '',
                    '',
                    item.name || '',
                    item.code || '',
                    '', // Quantity to be entered by user
                    item.selling_price_excl_tax !== null && item.selling_price_excl_tax !== undefined ? item.selling_price_excl_tax : '0.00',
                    item.tax_rate !== null && item.tax_rate !== undefined ? item.tax_rate : '0'
                ];
                rows.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            });
        } else {
            const example = [
                'PO-001',
                selectedSupplierName || 'Sample Supplier',
                todayStr,
                '',
                'Bulk Order',
                'Sample Item',
                'ITEM-0001',
                '10',
                '100.00',
                '0'
            ];
            rows.push(example.map(v => `"${v}"`).join(','));
        }

        const csvContent = rows.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="po_bulk_template.csv"');
        res.status(200).send(csvContent);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});



// Bulk Upload POs
router.post('/bulk-upload', checkPermission('po:create'), upload.single('file'), bulkCreatePOs);

// Get all POs
router.get('/', checkPermission('po:read'), getAllPOs);

// Get single PO by ID
router.get('/:id', checkPermission('po:read'), getPOById);

// Create new PO
router.post('/', checkPermission('po:create'), validatePOCreate, createPO);

// Update PO status
router.patch('/:id/status', checkPermission('po:approve'), validatePOStatus, updatePOStatus);

// Get PO payments
router.get('/:id/payments', checkPermission('po:read'), getPOPayments);

// Record PO payment
router.post('/:id/payments', checkPermission('po:create'), validatePOPayment, addPOPayment);

// Cancel PO payment (Requires Admin Password)
router.patch('/:id/payments/:paymentId/cancel', checkPermission('po:approve'), cancelPOPayment);

export default router;



