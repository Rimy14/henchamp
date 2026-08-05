import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';
import cache from '../utils/cache.js';
import { validateBarcode, sanitizeBarcode } from '../utils/barcode.validator.js';
import { findClosestMatch } from '../utils/fuzzy-match.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.use(verifyToken);

/**
 * Get all items with optional filters
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const type = req.query.type || '';
        const exclude_type = req.query.exclude_type || '';
        const offset = (page - 1) * limit;

        // Create cache key based on query parameters
        const cacheKey = `items:page${page}:limit${limit}:search${search}:type${type}:exc${exclude_type}`;

        // Try cache first
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const params = [];
        let whereClause = "WHERE i.status = 'active'";

        // Filter by category type if specified
        if (type) {
            whereClause += ' AND c.type = ?';
            params.push(type);
        } else if (exclude_type) {
            whereClause += ' AND c.type != ?';
            params.push(exclude_type);
        }

        // Filter by search term
        if (search) {
            whereClause += ' AND (i.name LIKE ? OR i.code LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            ${whereClause}
        `;
        const countResult = await query(countSql, params);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Get paginated data with location-specific stock
        const sql = `
            SELECT 
                i.*,
                c.name as category_name,
                c.type as category_type,
                s.name as supplier_name,
                COALESCE(shop_inv.quantity, 0) as shop_stock,
                COALESCE(store_inv.quantity, 0) as store_stock,
                (COALESCE(shop_inv.quantity, 0) + COALESCE(store_inv.quantity, 0)) as total_stock
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            LEFT JOIN suppliers s ON i.supplier_id = s.id
            LEFT JOIN inventory shop_inv ON i.id = shop_inv.item_id 
                AND shop_inv.location_id = (SELECT id FROM locations WHERE name = 'SHOP' LIMIT 1)
            LEFT JOIN inventory store_inv ON i.id = store_inv.item_id 
                AND store_inv.location_id = (SELECT id FROM locations WHERE name = 'STORE' LIMIT 1)
            ${whereClause}
            ORDER BY i.name
            LIMIT ${limit} OFFSET ${offset}
        `;

        // Use params (without limit/offset) as they are now inline
        const items = await query(sql, params);

        const response = {
            success: true,
            data: items,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        };

        // Cache for 5 minutes (300 seconds)
        cache.set(cacheKey, response, 300);

        res.json(response);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/by-barcode/:barcode', async (req, res) => {
    try {
        const { barcode } = req.params;
        const sql = `
            SELECT 
                i.*,
                c.name as category_name,
                c.type as category_type,
                s.name as supplier_name,
                COALESCE(shop_inv.quantity, 0) as shop_stock,
                COALESCE(store_inv.quantity, 0) as store_stock,
                (COALESCE(shop_inv.quantity, 0) + COALESCE(store_inv.quantity, 0)) as total_stock
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            LEFT JOIN suppliers s ON i.supplier_id = s.id
            LEFT JOIN inventory shop_inv ON i.id = shop_inv.item_id 
                AND shop_inv.location_id = (SELECT id FROM locations WHERE name = 'SHOP' LIMIT 1)
            LEFT JOIN inventory store_inv ON i.id = store_inv.item_id 
                AND store_inv.location_id = (SELECT id FROM locations WHERE name = 'STORE' LIMIT 1)
            WHERE i.barcode = ? AND i.status = 'active'
        `;
        const [item] = await query(sql, [barcode]);

        if (item) {
            res.json({ success: true, data: item });
        } else {
            res.status(404).json({ success: false, message: 'Item not found for this barcode.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Generate next global item code
 * Format: ITEM-####
 */
async function generateItemCode() {
    try {
        const existingCodes = await query("SELECT code FROM items WHERE code LIKE 'ITEM-%'");
        const codeList = Array.isArray(existingCodes) ? existingCodes : [];
        const codeSet = new Set(codeList.map(c => c.code ? c.code.toUpperCase() : ''));

        let nextNumber = 1;
        let code = `ITEM-${String(nextNumber).padStart(4, '0')}`;
        while (codeSet.has(code)) {
            nextNumber++;
            code = `ITEM-${String(nextNumber).padStart(4, '0')}`;
        }

        return code;

    } catch (error) {
        console.error('Error generating item code:', error);
        return `ITEM-${Date.now().toString().slice(-8)}`;
    }
}

router.post('/', checkPermission('items:create'), async (req, res) => {
    try {
        const { 
            name, description, category_id, unit_of_measure, selling_price, 
            reorder_level, barcode, tax_rate, tax_type, 
            selling_price_excl_tax, selling_price_incl_tax 
        } = req.body;

        const taxRateNum = parseFloat(tax_rate) || 0;
        const taxTypeVal = tax_type === 'inclusive' ? 'inclusive' : 'exclusive';

        let priceExcl = 0;
        let priceIncl = 0;

        if (taxTypeVal === 'inclusive') {
            priceIncl = parseFloat(selling_price_incl_tax || selling_price) || 0;
            priceExcl = parseFloat(selling_price_excl_tax) || (taxRateNum > 0 ? (priceIncl / (1 + taxRateNum / 100)) : priceIncl);
        } else {
            priceExcl = parseFloat(selling_price_excl_tax || selling_price) || 0;
            priceIncl = parseFloat(selling_price_incl_tax) || (priceExcl * (1 + taxRateNum / 100));
        }

        const mainSellingPrice = priceExcl;

        // Auto-generate item code based on category
        const code = await generateItemCode(category_id);

        const result = await query(
            `INSERT INTO items (
                code, name, description, category_id, unit_of_measure, 
                selling_price, tax_rate, tax_type, selling_price_excl_tax, selling_price_incl_tax, 
                reorder_level, current_stock
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                code, name, description, category_id, unit_of_measure, 
                mainSellingPrice, taxRateNum, taxTypeVal, priceExcl, priceIncl, 
                reorder_level || 0
            ]
        );

        // Invalidate items cache
        cache.deletePattern('items:*');

        res.status(201).json({
            success: true,
            message: 'Item created successfully. Stock can be added via GRN.',
            data: {
                id: result.insertId,
                code: code
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/:id', checkPermission('items:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, description, category_id, unit_of_measure, selling_price, 
            reorder_level, supplier_id, barcode, tax_rate, tax_type, 
            selling_price_excl_tax, selling_price_incl_tax 
        } = req.body;

        // Check if item exists
        const [existing] = await query('SELECT * FROM items WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // Validate required fields
        if (!name || !unit_of_measure) {
            return res.status(400).json({ success: false, message: 'Name and Unit of Measure are required' });
        }

        const taxRateNum = parseFloat(tax_rate) || 0;
        const taxTypeVal = tax_type === 'inclusive' ? 'inclusive' : 'exclusive';

        let priceExcl = 0;
        let priceIncl = 0;

        if (taxTypeVal === 'inclusive') {
            priceIncl = parseFloat(selling_price_incl_tax || selling_price) || 0;
            priceExcl = parseFloat(selling_price_excl_tax) || (taxRateNum > 0 ? (priceIncl / (1 + taxRateNum / 100)) : priceIncl);
        } else {
            priceExcl = parseFloat(selling_price_excl_tax || selling_price) || 0;
            priceIncl = parseFloat(selling_price_incl_tax) || (priceExcl * (1 + taxRateNum / 100));
        }

        const mainSellingPrice = priceExcl;

        await query(
            `UPDATE items SET 
                name = ?, 
                description = ?, 
                category_id = ?, 
                unit_of_measure = ?, 
                selling_price = ?,
                tax_rate = ?,
                tax_type = ?,
                selling_price_excl_tax = ?,
                selling_price_incl_tax = ?,
                reorder_level = ?,
                supplier_id = ?
            WHERE id = ?`,
            [
                name,
                description || null,
                category_id,
                unit_of_measure,
                mainSellingPrice,
                taxRateNum,
                taxTypeVal,
                priceExcl,
                priceIncl,
                reorder_level || 0,
                supplier_id || null,
                id
            ]
        );

        // Invalidate items cache
        cache.deletePattern('items:*');

        res.json({
            success: true,
            message: 'Item updated successfully',
            data: { id, name }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get CSV Template for Bulk Item Upload
 */
router.get('/bulk-template', checkPermission('items:read'), async (req, res) => {
    try {
        const categories = await query('SELECT name FROM categories WHERE status = "active" ORDER BY name ASC');
        const suppliers = await query('SELECT name FROM suppliers ORDER BY name ASC');
        const uoms = await query('SELECT name FROM units_of_measure ORDER BY name ASC');

        const categoryList = categories.length > 0 ? categories.map(c => c.name).join(', ') : 'None configured';
        const supplierList = suppliers.length > 0 ? suppliers.map(s => s.name).join(', ') : 'None configured';
        const uomList = uoms.length > 0 ? uoms.map(u => u.name).join(', ') : 'Piece, Ream, Box';

        const commentLines = [
            '# ===== AUTORA POS - BULK ITEM IMPORT TEMPLATE =====',
            `# VALID CATEGORIES: ${categoryList}`,
            `# VALID SUPPLIERS: ${supplierList}`,
            `# VALID UNITS OF MEASURE: ${uomList}`,
            '# TAX TYPES: exclusive OR inclusive',
            '# ====================================================='
        ];

        const headers = [
            'name',
            'description',
            'category_name',
            'unit_of_measure',
            'selling_price_excl_tax',
            'tax_rate',
            'tax_type',
            'reorder_level',
            'supplier_name',
            'barcode'
        ];

        const example1 = [
            'Premium Glossy Paper A4',
            '250gsm Glossy Paper',
            categories[0]?.name || 'Paper',
            uoms[0]?.name || 'Ream',
            '450.00',
            '0',
            'exclusive',
            '50',
            suppliers[0]?.name || '',
            'BC1001'
        ];

        const csvContent = [
            ...commentLines,
            headers.join(','),
            example1.map(v => `"${v}"`).join(',')
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="items_bulk_template.csv"');
        res.status(200).send(csvContent);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Bulk Upload Items via CSV
 * Supports optional query param: ?dryRun=true (or ?dry_run=true) for dry-run preview mode
 */
router.post('/bulk-upload', checkPermission('items:create'), upload.single('file'), async (req, res) => {
    try {
        const isDryRun = req.query.dryRun === 'true' || req.query.dry_run === 'true';

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded' });
        }

        const csvString = req.file.buffer.toString('utf8');
        let records = [];
        try {
            records = parse(csvString, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                comment: '#'
            });
        } catch (err) {
            return res.status(400).json({ success: false, message: `Invalid CSV format: ${err.message}` });
        }

        if (records.length === 0) {
            return res.status(400).json({ success: false, message: 'CSV file is empty' });
        }

        // Fetch lookup maps for Categories, Suppliers, UOMs
        const categories = await query('SELECT id, name FROM categories WHERE status = "active"');
        const suppliers = await query('SELECT id, name FROM suppliers');
        const uoms = await query('SELECT name FROM units_of_measure');

        const categoryMap = new Map();
        categories.forEach(c => categoryMap.set(c.name.trim().toLowerCase(), c.id));

        const supplierMap = new Map();
        suppliers.forEach(s => supplierMap.set(s.name.trim().toLowerCase(), s.id));

        const availableCategories = categories.map(c => c.name);
        const availableSuppliers = suppliers.map(s => s.name);

        const results = [];
        let createdCount = 0;
        let validCount = 0;
        let failedCount = 0;

        for (let i = 0; i < records.length; i++) {
            const rowNum = i + 2; // Line in CSV
            const row = records[i];

            const name = row.name ? row.name.trim() : '';
            const description = row.description ? row.description.trim() : null;
            const categoryName = row.category_name ? row.category_name.trim() : '';
            const uom = row.unit_of_measure ? row.unit_of_measure.trim() : '';
            const sellingPriceExcl = parseFloat(row.selling_price_excl_tax) || 0;
            const taxRateNum = parseFloat(row.tax_rate) || 0;
            const taxTypeVal = (row.tax_type && row.tax_type.trim().toLowerCase() === 'inclusive') ? 'inclusive' : 'exclusive';
            const reorderLevel = parseInt(row.reorder_level) || 0;
            const supplierName = row.supplier_name ? row.supplier_name.trim() : '';
            const barcode = row.barcode ? row.barcode.trim() : null;

            if (!name) {
                results.push({ row: rowNum, name: name || 'Unnamed', status: 'error', reason: 'Item name is required' });
                failedCount++;
                continue;
            }

            if (!categoryName || !categoryMap.has(categoryName.toLowerCase())) {
                const suggestion = findClosestMatch(categoryName, availableCategories);
                const hint = suggestion ? `. Did you mean: '${suggestion}'?` : '';
                results.push({ row: rowNum, name, status: 'error', reason: `Category '${categoryName}' not found${hint}` });
                failedCount++;
                continue;
            }

            if (!uom) {
                results.push({ row: rowNum, name, status: 'error', reason: 'Unit of Measure is required' });
                failedCount++;
                continue;
            }

            const categoryId = categoryMap.get(categoryName.toLowerCase());
            let supplierId = null;
            if (supplierName) {
                if (supplierMap.has(supplierName.toLowerCase())) {
                    supplierId = supplierMap.get(supplierName.toLowerCase());
                } else {
                    const suggestion = findClosestMatch(supplierName, availableSuppliers);
                    const hint = suggestion ? `. Did you mean: '${suggestion}'?` : '';
                    results.push({ row: rowNum, name, status: 'error', reason: `Supplier '${supplierName}' not found${hint}` });
                    failedCount++;
                    continue;
                }
            }

            let priceExcl = sellingPriceExcl;
            let priceIncl = 0;
            if (taxTypeVal === 'inclusive') {
                priceIncl = priceExcl;
                priceExcl = taxRateNum > 0 ? (priceIncl / (1 + taxRateNum / 100)) : priceIncl;
            } else {
                priceIncl = priceExcl * (1 + taxRateNum / 100);
            }

            try {
                // Check duplicate barcode if specified
                if (barcode) {
                    const [existingBarcode] = await query('SELECT id FROM items WHERE barcode = ?', [barcode]);
                    if (existingBarcode) {
                        results.push({ row: rowNum, name, status: 'error', reason: `Barcode '${barcode}' already exists` });
                        failedCount++;
                        continue;
                    }
                }

                // Check duplicate name in same category
                const [existingName] = await query('SELECT id FROM items WHERE name = ? AND category_id = ? AND status = "active"', [name, categoryId]);
                if (existingName) {
                    results.push({ row: rowNum, name, status: 'error', reason: `Item with name '${name}' already exists in category '${categoryName}'` });
                    failedCount++;
                    continue;
                }

                if (isDryRun) {
                    validCount++;
                    results.push({ row: rowNum, name, status: 'valid', reason: 'Ready to import' });
                } else {
                    const code = await generateItemCode(categoryId);

                    await query(
                        `INSERT INTO items (
                            code, name, description, category_id, unit_of_measure, 
                            selling_price, tax_rate, tax_type, selling_price_excl_tax, selling_price_incl_tax, 
                            reorder_level, supplier_id, barcode, current_stock
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                        [
                            code, name, description, categoryId, uom,
                            priceExcl, taxRateNum, taxTypeVal, priceExcl, priceIncl,
                            reorderLevel, supplierId, barcode
                        ]
                    );

                    createdCount++;
                    results.push({ row: rowNum, name, code, status: 'created', reason: 'Success' });
                }
            } catch (err) {
                failedCount++;
                results.push({ row: rowNum, name, status: 'error', reason: err.message });
            }
        }

        if (!isDryRun && createdCount > 0) {
            cache.deletePattern('items:*');
        }

        res.json({
            success: true,
            dryRun: isDryRun,
            summary: {
                total: records.length,
                valid: isDryRun ? validCount : createdCount,
                created: isDryRun ? 0 : createdCount,
                failed: failedCount
            },
            results
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;