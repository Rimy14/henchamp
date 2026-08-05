/**
 * Client-side Barcode Validation Utility
 * Supports EAN-13, UPC-A, Code128, and basic validation
 */

/**
 * Barcode format patterns
 */
const BARCODE_PATTERNS = {
    EAN13: /^\d{13}$/,
    UPCA: /^\d{12}$/,
    EAN8: /^\d{8}$/,
    CODE128: /^[\x00-\x7F]{1,48}$/, // ASCII characters, max 48
    CODE39: /^[A-Z0-9\-\.\ \$\/\+\%]+$/,
    // Generic: alphanumeric with common barcode symbols
    GENERIC: /^[A-Z0-9\-\.\ ]+$/i
};

/**
 * Validate barcode format
 * @param {string} barcode - Barcode to validate
 * @returns {Object} - { valid: boolean, type: string|null, error: string|null }
 */
export function validateBarcodeFormat(barcode) {
    if (!barcode || typeof barcode !== 'string') {
        return { valid: false, type: null, error: 'Barcode is required' };
    }

    const trimmed = barcode.trim();

    if (trimmed.length === 0) {
        return { valid: false, type: null, error: 'Barcode cannot be empty' };
    }

    if (trimmed.length > 255) {
        return { valid: false, type: null, error: 'Barcode too long (max 255 characters)' };
    }

    // Check for EAN-13
    if (BARCODE_PATTERNS.EAN13.test(trimmed)) {
        const checksumValid = validateEAN13Checksum(trimmed);
        if (!checksumValid) {
            return { valid: false, type: 'EAN13', error: 'Invalid EAN-13 checksum' };
        }
        return { valid: true, type: 'EAN13', error: null };
    }

    // Check for UPC-A
    if (BARCODE_PATTERNS.UPCA.test(trimmed)) {
        const checksumValid = validateUPCAChecksum(trimmed);
        if (!checksumValid) {
            return { valid: false, type: 'UPCA', error: 'Invalid UPC-A checksum' };
        }
        return { valid: true, type: 'UPCA', error: null };
    }

    // Check for EAN-8
    if (BARCODE_PATTERNS.EAN8.test(trimmed)) {
        const checksumValid = validateEAN8Checksum(trimmed);
        if (!checksumValid) {
            return { valid: false, type: 'EAN8', error: 'Invalid EAN-8 checksum' };
        }
        return { valid: true, type: 'EAN8', error: null };
    }

    // Check for Code 39
    if (BARCODE_PATTERNS.CODE39.test(trimmed)) {
        return { valid: true, type: 'CODE39', error: null };
    }

    // Generic alphanumeric validation (fallback for other formats)
    if (BARCODE_PATTERNS.GENERIC.test(trimmed)) {
        return { valid: true, type: 'GENERIC', error: null };
    }

    return {
        valid: false,
        type: null,
        error: 'Invalid barcode format. Must be alphanumeric with basic symbols only.'
    };
}

/**
 * Validate EAN-13 checksum
 * @param {string} barcode - 13 digit EAN barcode
 * @returns {boolean}
 */
export function validateEAN13Checksum(barcode) {
    if (!barcode || barcode.length !== 13) return false;

    const digits = barcode.split('').map(Number);
    const checkDigit = digits[12];

    // Calculate checksum: sum of odd positions + (3 * sum of even positions)
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
export function validateUPCAChecksum(barcode) {
    if (!barcode || barcode.length !== 12) return false;

    const digits = barcode.split('').map(Number);
    const checkDigit = digits[11];

    // Calculate checksum: (3 * sum of odd positions) + sum of even positions
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
export function validateEAN8Checksum(barcode) {
    if (!barcode || barcode.length !== 8) return false;

    const digits = barcode.split('').map(Number);
    const checkDigit = digits[7];

    // Calculate checksum: (3 * sum of odd positions) + sum of even positions
    let sum = 0;
    for (let i = 0; i < 7; i++) {
        sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }

    const calculatedCheck = (10 - (sum % 10)) % 10;
    return calculatedCheck === checkDigit;
}

/**
 * Get barcode type without validation
 * @param {string} barcode - Barcode to identify
 * @returns {string|null} - Barcode type or null
 */
export function getBarcodeType(barcode) {
    if (!barcode) return null;

    const trimmed = barcode.trim();

    if (BARCODE_PATTERNS.EAN13.test(trimmed)) return 'EAN13';
    if (BARCODE_PATTERNS.UPCA.test(trimmed)) return 'UPCA';
    if (BARCODE_PATTERNS.EAN8.test(trimmed)) return 'EAN8';
    if (BARCODE_PATTERNS.CODE39.test(trimmed)) return 'CODE39';
    if (BARCODE_PATTERNS.CODE128.test(trimmed)) return 'CODE128';
    if (BARCODE_PATTERNS.GENERIC.test(trimmed)) return 'GENERIC';

    return null;
}

/**
 * Format/normalize barcode
 * @param {string} barcode - Barcode to format
 * @returns {string} - Normalized barcode
 */
export function formatBarcode(barcode) {
    if (!barcode) return '';

    // Trim whitespace and convert to uppercase for consistency
    return barcode.trim().toUpperCase();
}

/**
 * Quick validation (lenient mode for scanner input)
 * @param {string} barcode - Barcode to validate
 * @returns {boolean}
 */
export function isValidBarcode(barcode) {
    const result = validateBarcodeFormat(barcode);
    return result.valid;
}

// Export all functions
export default {
    validateBarcodeFormat,
    validateEAN13Checksum,
    validateUPCAChecksum,
    validateEAN8Checksum,
    getBarcodeType,
    formatBarcode,
    isValidBarcode
};
