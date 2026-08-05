

// ==========================================
// RECEIPT PREVIEW AND PRINT FUNCTIONS
// ==========================================

// Open receipt preview modal
function showReceiptPreview() {
    const modal = document.getElementById('receiptPreviewModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }
}

// Close receipt preview modal
window.closeReceiptPreview = function () {
    const modal = document.getElementById('receiptPreviewModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            // Clear receipt content to prevent persistence
            const receiptPreview = document.getElementById('receipt-preview');
            if (receiptPreview) {
                receiptPreview.innerHTML = '';
            }
        }, 300);
    }
};

// Print receipt when user clicks print button
window.printReceiptNow = function () {
    window.print();
    // Optionally close the modal after printing
    // closeReceiptPreview();
};
