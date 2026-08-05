import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';
import cache from '../utils/cache.js';

const router = express.Router();

router.use(verifyToken);

/**
 * Get all categories with hierarchical structure
 */
router.get('/', async (req, res) => {
    try {
        // Try cache first (cache for 1 hour - categories rarely change)
        const cacheKey = 'categories:all';
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const allCategories = await query(`
            SELECT c.*, COUNT(i.id) as item_count 
            FROM categories c 
            LEFT JOIN items i ON c.id = i.category_id 
            WHERE c.status = ? 
            GROUP BY c.id 
            ORDER BY c.parent_id, c.name
        `, ['active']);

        // Separate base categories from sub-categories
        const baseCategories = allCategories.filter(c => c.parent_id === null);
        const subCategories = allCategories.filter(c => c.parent_id !== null);

        // Build hierarchical structure
        const hierarchical = baseCategories.map(base => ({
            ...base,
            children: subCategories.filter(sub => sub.parent_id === base.id)
        }));

        const response = {
            success: true,
            data: allCategories,
            hierarchical: hierarchical,
            baseCategories: baseCategories,
            subCategories: subCategories
        };

        // Cache for 1 hour (3600 seconds)
        cache.set(cacheKey, response, 3600);

        res.json(response);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get base categories only (no parent)
 */
router.get('/base', async (req, res) => {
    try {
        const categories = await query('SELECT * FROM categories WHERE parent_id IS NULL AND status = ? ORDER BY name', ['active']);
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get single category by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [category] = await query('SELECT * FROM categories WHERE id = ?', [id]);

        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Get parent category name if exists
        if (category.parent_id) {
            const [parent] = await query('SELECT name FROM categories WHERE id = ?', [category.parent_id]);
            category.parent_name = parent ? parent.name : null;
        }

        // Get count of items in this category
        const [itemCount] = await query('SELECT COUNT(*) as count FROM items WHERE category_id = ?', [id]);
        category.item_count = itemCount.count;

        // Get count of sub-categories
        const [subCount] = await query('SELECT COUNT(*) as count FROM categories WHERE parent_id = ?', [id]);
        category.subcategory_count = subCount.count;

        res.json({ success: true, data: category });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get sub-categories for a specific base category
 */
router.get('/sub/:parentId', async (req, res) => {
    try {
        const { parentId } = req.params;
        const categories = await query(
            'SELECT * FROM categories WHERE parent_id = ? AND status = ? ORDER BY name',
            [parentId, 'active']
        );
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Create new category
 */
router.post('/', checkPermission('categories:create'), async (req, res) => {
    try {
        const { name, description, type, parent_id, code_prefix } = req.body;

        // Validate required fields
        if (!name || !type) {
            return res.status(400).json({ success: false, message: 'Name and type are required' });
        }

        // Check if category name already exists
        const existing = await query('SELECT id FROM categories WHERE name = ? AND type = ? AND status = ?', [name, type, 'active']);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Category name already exists' });
        }

        // Generate or clean code_prefix
        let prefix = code_prefix ? code_prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6) : '';
        if (!prefix) {
            prefix = name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
        }

        // If parent_id is provided, validate it exists
        if (parent_id) {
            const [parent] = await query('SELECT id, type FROM categories WHERE id = ?', [parent_id]);
            if (!parent) {
                return res.status(400).json({ success: false, message: 'Parent category not found' });
            }
            // Ensure type matches parent
            if (parent.type !== type) {
                return res.status(400).json({ success: false, message: 'Sub-category type must match parent category type' });
            }
        }

        const result = await query(
            'INSERT INTO categories (name, code_prefix, description, type, parent_id, status) VALUES (?, ?, ?, ?, ?, ?)',
            [name, prefix, description || null, type, parent_id || null, 'active']
        );

        // Invalidate category cache
        cache.deletePattern('categories:*');

        res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: { id: result.insertId, name, code_prefix: prefix, type, parent_id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Update category
 */
router.put('/:id', checkPermission('categories:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, type, parent_id } = req.body;

        // Check if category exists
        const [existing] = await query('SELECT * FROM categories WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Check if new name conflicts with another category
        if (name && name !== existing.name) {
            const nameCheck = await query('SELECT id FROM categories WHERE name = ? AND type = ? AND id != ? AND status = ?', [name, type || existing.type, id, 'active']);
            if (nameCheck.length > 0) {
                return res.status(400).json({ success: false, message: 'Category name already exists' });
            }
        }

        // Prevent setting category as its own parent
        if (parent_id && parseInt(parent_id) === parseInt(id)) {
            return res.status(400).json({ success: false, message: 'Category cannot be its own parent' });
        }

        // If parent_id is being changed, validate the new parent
        if (parent_id && parent_id !== existing.parent_id) {
            const [parent] = await query('SELECT id, type, parent_id FROM categories WHERE id = ?', [parent_id]);
            if (!parent) {
                return res.status(400).json({ success: false, message: 'Parent category not found' });
            }
            // Prevent circular references (parent's parent cannot be this category)
            if (parent.parent_id === parseInt(id)) {
                return res.status(400).json({ success: false, message: 'Circular reference detected' });
            }
            // Ensure type matches if type is being updated or parent has a type
            const newType = type || existing.type;
            if (parent.type !== newType) {
                return res.status(400).json({ success: false, message: 'Sub-category type must match parent category type' });
            }
        }

        await query(
            'UPDATE categories SET name = ?, description = ?, type = ?, parent_id = ? WHERE id = ?',
            [
                name || existing.name,
                description !== undefined ? description : existing.description,
                type || existing.type,
                parent_id !== undefined ? parent_id : existing.parent_id,
                id
            ]
        );

        // Invalidate category cache
        cache.deletePattern('categories:*');

        res.json({
            success: true,
            message: 'Category updated successfully',
            data: { id, name: name || existing.name }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Delete category (soft delete)
 */
router.delete('/:id', checkPermission('categories:delete'), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if category exists
        const [category] = await query('SELECT * FROM categories WHERE id = ?', [id]);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Check if category has items
        const items = await query('SELECT COUNT(*) as count FROM items WHERE category_id = ?', [id]);
        if (items[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category. It has ${items[0].count} item(s) associated with it.`
            });
        }

        // Check if category has sub-categories
        const subCategories = await query('SELECT COUNT(*) as count FROM categories WHERE parent_id = ? AND status = ?', [id, 'active']);
        if (subCategories[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category. It has ${subCategories[0].count} sub-category(ies).`
            });
        }

        // Soft delete
        await query('UPDATE categories SET status = ? WHERE id = ?', ['inactive', id]);

        // Invalidate category cache
        cache.deletePattern('categories:*');

        res.json({
            success: true,
            message: 'Category deleted successfully',
            data: { id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
