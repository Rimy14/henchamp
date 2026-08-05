import { body, param, query, validationResult } from 'express-validator';
import { query as dbQuery } from '../config/database.js';

/**
 * Handle validation errors
 */
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('❌ Validation failed for:', req.path);
        console.log('Validation errors:', errors.array());
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
};

/**
 * Validation rules for login
 */
export const validateLogin = [
    body('username')
        .trim()
        .notEmpty().withMessage('Username is required')
        .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    handleValidationErrors
];

/**
 * Validation rules for change password
 */
export const validateChangePassword = [
    body('currentPassword')
        .notEmpty().withMessage('Current password is required')
        .isLength({ min: 6 }).withMessage('Current password must be at least 6 characters'),
    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/).withMessage('Password must contain uppercase, lowercase, number, and special character'),
    body('confirmPassword')
        .notEmpty().withMessage('Confirm password is required')
        .custom((value, { req }) => value === req.body.newPassword).withMessage('Passwords do not match'),
    handleValidationErrors
];

/**
 * Validation rules for user creation
 */
export const validateUserCreate = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
        .optional({ checkFalsy: true })
        .trim()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role')
        .notEmpty().withMessage('Role is required')
        .custom(async (value) => {
            const roles = await dbQuery('SELECT name FROM roles WHERE name = ?', [value]);
            if (roles.length === 0) {
                throw new Error('Invalid role');
            }
            return true;
        }),
    handleValidationErrors
];

/**
 * Validation rules for user update
 */
export const validateUserUpdate = [
    param('id').isInt().withMessage('Invalid user ID'),
    body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
        .optional({ checkFalsy: true })
        .trim()
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail(),
    body('role')
        .optional({ checkFalsy: true })
        .custom(async (value) => {
            if (!value) return true;
            const roles = await dbQuery('SELECT name FROM roles WHERE name = ?', [value]);
            if (roles.length === 0) {
                throw new Error('Invalid role');
            }
            return true;
        }),
    body('status')
        .optional()
        .isIn(['active', 'inactive']).withMessage('Invalid status'),
    handleValidationErrors
];

/**
 * Validation rules for item creation
 */
export const validateItemCreate = [
    body('name')
        .trim()
        .notEmpty().withMessage('Item name is required')
        .isLength({ max: 200 }).withMessage('Item name too long'),
    body('category_id')
        .notEmpty().withMessage('Category is required')
        .isInt().withMessage('Invalid category ID'),
    body('unit_of_measure')
        .trim()
        .notEmpty().withMessage('Unit of measure is required'),
    body('cost_price')
        .optional()
        .isFloat({ min: 0 }).withMessage('Cost price must be a positive number'),
    body('selling_price')
        .optional()
        .isFloat({ min: 0 }).withMessage('Selling price must be a positive number'),
    body('reorder_level')
        .optional()
        .isInt({ min: 0 }).withMessage('Reorder level must be a non-negative integer'),
    handleValidationErrors
];

/**
 * Validation rules for PO creation
 */
export const validatePOCreate = [
    body('supplier_id')
        .notEmpty().withMessage('Supplier is required')
        .isInt().withMessage('Invalid supplier ID'),
    body('expected_delivery_date')
        .optional()
        .isISO8601().withMessage('Invalid date format'),
    body('items')
        .isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.item_id')
        .isInt().withMessage('Invalid item ID'),
    body('items.*.quantity')
        .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.unit_price')
        .isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
    handleValidationErrors
];

/**
 * Validation rules for GRN creation
 */
export const validateGRNCreate = [
    body('po_id')
        .notEmpty().withMessage('Purchase order is required')
        .isInt({ min: 1 }).withMessage('Invalid purchase order ID'),
    body('received_date')
        .notEmpty().withMessage('Received date is required')
        .isISO8601().withMessage('Invalid date format')
        .custom(value => new Date(value) <= new Date()).withMessage('Received date cannot be in the future'),
    body('items')
        .isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.item_id')
        .isInt({ min: 1 }).withMessage('Invalid item ID'),
    body('items.*.received_quantity')
        .isFloat({ min: 0.01 }).withMessage('Received quantity must be greater than 0'),
    body('items.*.quality_status')
        .isIn(['accepted', 'rejected', 'partial']).withMessage('Invalid quality status'),
    body('items.*.notes')
        .optional()
        .isLength({ max: 200 }).withMessage('Item notes too long'),
    body('notes')
        .optional()
        .isLength({ max: 500 }).withMessage('Notes too long'),
    handleValidationErrors
];

/**
 * Validation rules for GRN approval
 */
export const validateGRNApprove = [
    param('id').isInt({ min: 1 }).withMessage('Invalid GRN ID'),
    handleValidationErrors
];

/**
 * Validation rules for GRN rejection
 */
export const validateGRNReject = [
    param('id').isInt({ min: 1 }).withMessage('Invalid GRN ID'),
    body('reason')
        .notEmpty().withMessage('Rejection reason is required')
        .isLength({ min: 10, max: 500 }).withMessage('Reason must be 10-500 characters'),
    handleValidationErrors
];

/**
 * Validation rules for BOM creation
 */
export const validateBOMCreate = [
    body('finished_good_id')
        .notEmpty().withMessage('Finished good is required')
        .isInt({ min: 1 }).withMessage('Invalid finished good ID'),
    body('description')
        .optional()
        .isLength({ max: 500 }).withMessage('Description too long'),
    body('items')
        .isArray({ min: 1 }).withMessage('At least one raw material is required'),
    body('items.*.raw_material_id')
        .isInt({ min: 1 }).withMessage('Invalid raw material ID'),
    body('items.*.quantity')
        .isFloat({ min: 0.001, max: 99999 }).withMessage('Quantity must be between 0.001 and 99999'),
    body('items.*.notes')
        .optional()
        .isLength({ max: 200 }).withMessage('Item notes too long'),
    handleValidationErrors
];

/**
 * Validation rules for BOM update
 */
export const validateBOMUpdate = [
    param('id').isInt({ min: 1 }).withMessage('Invalid BOM ID'),
    body('description')
        .optional()
        .isLength({ max: 500 }).withMessage('Description too long'),
    body('items')
        .isArray({ min: 1 }).withMessage('At least one raw material is required'),
    body('items.*.raw_material_id')
        .isInt({ min: 1 }).withMessage('Invalid raw material ID'),
    body('items.*.quantity')
        .isFloat({ min: 0.001, max: 99999 }).withMessage('Quantity must be between 0.001 and 99999'),
    body('items.*.notes')
        .optional()
        .isLength({ max: 200 }).withMessage('Item notes too long'),
    handleValidationErrors
];

/**
 * Validation rules for Production creation
 */
export const validateProductionCreate = [
    body('bom_id')
        .notEmpty().withMessage('BOM is required')
        .isInt({ min: 1 }).withMessage('Invalid BOM ID'),
    body('quantity_produced')
        .notEmpty().withMessage('Quantity produced is required')
        .isFloat({ min: 1, max: 99999 }).withMessage('Quantity must be between 1 and 99999'),
    body('production_date')
        .notEmpty().withMessage('Production date is required')
        .isISO8601().withMessage('Invalid date format')
        .custom(value => new Date(value) <= new Date()).withMessage('Production date cannot be in the future'),
    body('notes')
        .optional()
        .isLength({ max: 500 }).withMessage('Notes too long'),
    handleValidationErrors
];

/**
 * Validation rules for Production status update
 */
export const validateProductionStatus = [
    param('id').isInt({ min: 1 }).withMessage('Invalid production ID'),
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['Pending', 'In Progress', 'Completed', 'Cancelled']).withMessage('Invalid status'),
    handleValidationErrors
];

/**
 * Validation rules for PO status update
 */
export const validatePOStatus = [
    param('id').isInt({ min: 1 }).withMessage('Invalid PO ID'),
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['Draft', 'Pending', 'Approved', 'Received', 'Cancelled']).withMessage('Invalid status'),
    handleValidationErrors
];

/**
 * Validation for ID parameter
 */
export const validateId = [
    param('id').isInt().withMessage('Invalid ID'),
    handleValidationErrors
];

/**
 * Sanitize and validate pagination params
 */
export const validatePagination = (req, res, next) => {
    req.query.page = parseInt(req.query.page) || 1;
    req.query.limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100 items per page
    req.query.offset = (req.query.page - 1) * req.query.limit;
    next();
};
/**
 * Validation rules for sale creation (with item-level discount validation)
 */
export const validateSaleCreate = [
    body('items').isArray({ min: 1 }).withMessage('Items array is required with at least one item'),
    body('items.*.item_id').isInt({ min: 1 }).withMessage('Valid item_id is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.unit_price').isFloat({ min: 0 }).withMessage('Unit price must be non-negative'),

    // Item discount validation
    body('items.*.discount_amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Item discount amount must be non-negative')
        .custom((value, { req, path }) => {
            // Extract the index from the path (e.g., "items[0].discount_amount" -> 0)
            const match = path.match(/\[(\d+)\]/);
            if (match) {
                const index = parseInt(match[1]);
                const item = req.body.items[index];

                if (item && value !== undefined && value !== null && value > 0) {
                    const itemTotal = item.quantity * item.unit_price;
                    if (value > itemTotal) {
                        throw new Error(`Discount Rs${value} cannot exceed item total Rs${itemTotal}`);
                    }
                }
            }
            return true;
        }),

    body('items.*.discount_percentage')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Item discount percentage must be between 0 and 100'),

    body('customer_id').optional().isInt({ min: 1 }).withMessage('Invalid customer_id'),
    body('discount_percentage').optional().isFloat({ min: 0, max: 100 }).withMessage('Discount percentage must be between 0 and 100'),
    body('discount_amount').optional().isFloat({ min: 0 }).withMessage('Discount amount must be non-negative'),
    body('tax_percentage').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax percentage must be between 0 and 100'),
    body('payment_method').optional().isIn(['Cash', 'Card', 'Bank Transfer', 'Credit']).withMessage('Invalid payment method'),

    // Validate payments array if provided
    body('payments').optional().isArray().withMessage('Payments must be an array'),
    body('payments.*.method')
        .optional()
        .isString()
        .notEmpty()
        .withMessage('Payment method is required'),
    body('payments.*.amount')
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage('Payment amount must be greater than 0'),

    handleValidationErrors
];

/**
 * Validation rules for PO Payment creation
 */
export const validatePOPayment = [
    param('id').isInt({ min: 1 }).withMessage('Invalid PO ID'),
    body('amount')
        .notEmpty().withMessage('Amount is required')
        .isFloat({ min: 0.01 }).withMessage('Payment amount must be greater than 0'),
    body('payment_method')
        .notEmpty().withMessage('Payment method is required')
        .isIn(['Cash', 'Bank Transfer', 'Cheque', 'Card', 'Other']).withMessage('Invalid payment method'),
    body('reference_number')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 }).withMessage('Reference number too long'),
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Notes too long'),
    body('paid_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('Invalid date format'),
    handleValidationErrors
];

