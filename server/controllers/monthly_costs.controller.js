import db from '../config/database.js';
import logger from '../utils/logger.js';

// Get all monthly cost categories
export const getCategories = async (req, res) => {
  try {
    const { include_inactive } = req.query;
    let queryStr = 'SELECT * FROM monthly_cost_categories';
    const params = [];

    if (include_inactive !== 'true') {
      queryStr += ' WHERE is_active = 1';
    }

    queryStr += ' ORDER BY name ASC';

    const [rows] = await db.query(queryStr, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error fetching monthly cost categories:', error);
    res.status(500).json({ success: false, message: 'Error fetching monthly cost categories' });
  }
};

// Create a new monthly cost category
export const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const trimmedName = name.trim();
    const trimmedDesc = description ? description.trim() : null;

    // Check if category already exists
    const [existing] = await db.query('SELECT id FROM monthly_cost_categories WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }

    const [result] = await db.execute(
      'INSERT INTO monthly_cost_categories (name, description, is_active) VALUES (?, ?, 1)',
      [trimmedName, trimmedDesc]
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: { id: result.insertId, name: trimmedName, description: trimmedDesc, is_active: 1 }
    });
  } catch (error) {
    logger.error('Error creating monthly cost category:', error);
    res.status(500).json({ success: false, message: 'Error creating monthly cost category' });
  }
};

// Toggle category active/inactive status
export const toggleCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const [categories] = await db.query('SELECT * FROM monthly_cost_categories WHERE id = ?', [id]);
    if (categories.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const newStatus = categories[0].is_active ? 0 : 1;
    await db.execute('UPDATE monthly_cost_categories SET is_active = ? WHERE id = ?', [newStatus, id]);

    res.json({
      success: true,
      message: `Category ${newStatus === 1 ? 'activated' : 'deactivated'} successfully`,
      is_active: newStatus
    });
  } catch (error) {
    logger.error('Error toggling monthly cost category status:', error);
    res.status(500).json({ success: false, message: 'Error updating category status' });
  }
};

// Get all monthly costs
export const getAllMonthlyCosts = async (req, res) => {
  try {
    const { month, year } = req.query;
    let queryStr = `
      SELECT mc.*, 
             COALESCE(mcc.name, mc.category, 'Uncategorized') AS display_category,
             mcc.name AS category_rel_name
      FROM monthly_costs mc
      LEFT JOIN monthly_cost_categories mcc ON mc.category_id = mcc.id
    `;
    const params = [];

    if (month && year) {
      queryStr += ' WHERE MONTH(mc.created_at) = ? AND YEAR(mc.created_at) = ?';
      params.push(month, year);
    }

    queryStr += ' ORDER BY mc.created_at DESC';

    const [rows] = await db.query(queryStr, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error fetching monthly costs:', error);
    res.status(500).json({ success: false, message: 'Error fetching monthly costs' });
  }
};

// Add a new monthly cost
export const addMonthlyCost = async (req, res) => {
  const { name, amount, date, category_id, category } = req.body;

  if (!name || !amount) {
    return res.status(400).json({ success: false, message: 'Name and amount are required' });
  }

  const createdAt = date ? `${date} 12:00:00` : new Date();
  let categoryIdVal = category_id || null;
  let categoryNameVal = category || null;

  try {
    if (categoryIdVal && !categoryNameVal) {
      const [cats] = await db.query('SELECT name FROM monthly_cost_categories WHERE id = ?', [categoryIdVal]);
      if (cats.length > 0) {
        categoryNameVal = cats[0].name;
      }
    }

    const [result] = await db.execute(
      'INSERT INTO monthly_costs (name, amount, category_id, category, created_at) VALUES (?, ?, ?, ?, ?)',
      [name, amount, categoryIdVal, categoryNameVal, createdAt]
    );

    res.status(201).json({
      success: true,
      id: result.insertId,
      name,
      amount,
      category_id: categoryIdVal,
      category: categoryNameVal,
      created_at: createdAt
    });
  } catch (error) {
    logger.error('Error adding monthly cost:', error);
    res.status(500).json({ success: false, message: 'Error adding monthly cost' });
  }
};

// Void a monthly cost entry
export const voidMonthlyCost = async (req, res) => {
  try {
    const { id } = req.params;
    const { void_reason } = req.body;

    if (!void_reason || !void_reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason for voiding is required' });
    }

    const [costs] = await db.query('SELECT * FROM monthly_costs WHERE id = ?', [id]);
    if (costs.length === 0) {
      return res.status(404).json({ success: false, message: 'Monthly cost not found' });
    }

    if (costs[0].is_voided) {
      return res.status(400).json({ success: false, message: 'Monthly cost is already voided' });
    }

    const voidedBy = req.user?.username || 'Admin';

    await db.execute(
      `UPDATE monthly_costs 
       SET is_voided = 1, void_reason = ?, voided_at = CURRENT_TIMESTAMP, voided_by = ? 
       WHERE id = ?`,
      [void_reason.trim(), voidedBy, id]
    );

    res.json({
      success: true,
      message: 'Monthly cost voided successfully'
    });
  } catch (error) {
    logger.error('Error voiding monthly cost:', error);
    res.status(500).json({ success: false, message: 'Error voiding monthly cost' });
  }
};