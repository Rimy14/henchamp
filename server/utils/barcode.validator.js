/**
 * Server-side Barcode Validation Utility
 * Provides validation and sanitization for barcode inputs
 */

/**
 * Barcode format patterns
 */
const BARCODE_PATTERNS = {
    EAN13: /^\d{13}$/,
    UPCA: /^\d{12}$/,
    EAN8: /^\d{8}$/,
    CODE39: /^[A-Z0-9\-\.\ \$\/\+\%]+$/,
    // Generic: alphanumeric with common barcode symbols
    GENERIC: /^[A-Z0-9\-\.\ ]+$/i
};

/**
 * Validate EAN-13 checksum
 * @param {string} barcode - 13 digit EAN barcode
 * @returns {boolean}
 */
function validateEAN13Checksum(barcode) {
    if (!barcode || barcode.length !== 13) return false;

    const digits = barcode.split('').map(Number);
    const checkDigit = digits[12];

    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }

    const calculatedCheck = (10 - (sum % 10)) % 10;
    return calculatedCheck === checkDigit;
}

/**
 * Validate UPC-A checksum
 * @param {string} barcode - 12 digit UPC-A barcode
 * @returns {boolean}
 */
function validateUPCAChecksum(barcode) {
    if (!barcode || barcode.length !== 12) return false;

    const digits = barcode.split('').map(Number);
    const checkDigit = digits[11];

    let sum = 0;
    for (let i = 0; i < 11; i++) {
        sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }

    const calculatedCheck = (10 - (sum % 10)) % 10;
    return calculatedCheck === checkDigit;
}

/**
 * Validate EAN-8 checksum
 * @param {string} barcode - 8 digit EAN-8 barcode
 * @returns {boolean}
 */
function validateEAN8Checksum(barcode) {
    if (!barcode || barcode.length !== 8) return false;

    const digits = barcode.split('').map(Number);
    const checkDigit = digits[7];

    let sum = 0;
    for (let i = 0; i < 7; i++) {
        sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }

    const calculatedCheck = (10 - (sum % 10)) % 10;
    return calculatedCheck === checkDigit;
}

/**
 * Sanitize barcode input
 * @param {string} barcode - Raw barcode input
 * @returns {string} - Sanitized barcode
 */
function sanitizeBarcode(barcode) {
    if (!barcode || typeof barcode !== 'string') {
        return '';
    }

    // Trim whitespace and convert to uppercase
    let sanitized = barcode.trim().toUpperCase();

    // Remove any control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

    return sanitized;
}

/**
 * Validate barcode format and checksum
 * @param {string} barcode - Barcode to validate
 * @param {boolean} strict - If true, requires checksum validation for EAN/UPC
 * @returns {Object} - { valid: boolean, type: string|null, message: string }
 */
function validateBarcode(barcode, strict = true) {
    // Sanitize input first
    const sanitized = sanitizeBarcode(barcode);

    if (!sanitized) {
        return { valid: false, type: null, message: 'Barcode is required' };
    }

    if (sanitized.length > 255) {
        return { valid: false, type: null, message: 'Barcode exceeds maximum length (255 characters)' };
    }

    // Check for EAN-13
    if (BARCODE_PATTERNS.EAN13.test(sanitized)) {
        if (strict && !validateEAN13Checksum(sanitized)) {
            return { valid: false, type: 'EAN13', message: 'Invalid EAN-13 checksum' };
        }
        return { valid: true, type: 'EAN13', message: 'Valid EAN-13 barcode' };
    }

    // Check for UPC-A
    if (BARCODE_PATTERNS.UPCA.test(sanitized)) {
        if (strict && !validateUPCAChecksum(sanitized)) {
            return { valid: false, type: 'UPCA', message: 'Invalid UPC-A checksum' };
        }
        return { valid: true, type: 'UPCA', message: 'Valid UPC-A barcode' };
    }

    // Check for EAN-8
    if (BARCODE_PATTERNS.EAN8.test(sanitized)) {
        if (strict && !validateEAN8Checksum(sanitized)) {
            return { valid: false, type: 'EAN8', message: 'Invalid EAN-8 checksum' };
        }
        return { valid: true, type: 'EAN8', message: 'Valid EAN-8 barcode' };
    }

    // Check for Code 39
    if (BARCODE_PATTERNS.CODE39.test(sanitized)) {
        return { valid: true, type: 'CODE39', message: 'Valid Code 39 barcode' };
    }

    // Generic alphanumeric validation (fallback)
    if (BARCODE_PATTERNS.GENERIC.test(sanitized)) {
        return { valid: true, type: 'GENERIC', message: 'Valid generic barcode' };
    }

    return {
        valid: false,
        type: null,
        message: 'Invalid barcode format. Only alphanumeric characters and basic symbols (- . space) are allowed.'
    };
}

/**
 * Check if barcode is valid (simple boolean check)
 * @param {string} barcode - Barcode to validate
 * @returns {boolean}
 */
function isValidBarcode(barcode) {
    const result = validateBarcode(barcode, false); // Non-strict mode
    return result.valid;
}

export {
    validateBarcode,
    isValidBarcode,
    sanitizeBarcode,
    validateEAN13Checksum,
    validateUPCAChecksum,
    validateEAN8Checksum
};
