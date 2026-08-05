/**
 * Validate barcode input field
 * @returns {boolean} - True if valid or empty, false if invalid
 */
function validateBarcodeInput() {
    const barcodeInput = document.getElementById('itemBarcode');
    const errorDiv = document.getElementById('barcodeError');

    if (!barcodeInput || !errorDiv) return true;

    const barcode = barcodeInput.value.trim();

    // Empty is valid (optional field)
    if (!barcode) {
        errorDiv.style.display = 'none';
        barcodeInput.style.borderColor = '';
        return true;
    }

    // Validate format
    const validation = validateBarcodeFormat(barcode);

    if (!validation.valid) {
        errorDiv.textContent = validation.error || 'Invalid barcode format';
        errorDiv.style.display = 'block';
        barcodeInput.style.borderColor = 'var(--danger)';
        return false;
    }

    // Valid - clear any errors
    errorDiv.style.display = 'none';
    barcodeInput.style.borderColor = 'var(--success)';

    // Auto-format the barcode
    barcodeInput.value = formatBarcode(barcode);

    return true;
}
