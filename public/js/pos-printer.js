/**
 * POS Printer Configuration and Auto-Print Handler
 * Handles automatic printing to configured thermal printers
 */

// Configuration
const POS_PRINTER_CONFIG = {
    targetPrinterNames: ['Printer_POS-81', 'Printer_POS-80'], // Priority order
    autoPrint: true,
    showPreviewFirst: false
};

/**
 * Enhanced print handler with QZ Tray support
 * Attempts QZ Tray first, falls back to browser print
 */
window.printReceiptNow = async function () {
    console.log('🖨️  ========== PRINT JOB STARTED ==========');
    const receiptElement = document.getElementById('receipt-preview');

    if (!receiptElement) {
        console.error('[Print] ❌ Receipt preview element not found');
        return;
    }

    const receiptHtml = receiptElement.innerHTML;
    console.log('[Print] 📄 Receipt content prepared');

    // Try QZ Tray first if available
    if (window.qzPrinter && window.qz) {
        console.log('[Print] 🔍 QZ Tray detected, checking printer connection...');
        try {
            const isConnected = window.qzPrinter.isAvailable();
            console.log('[Print] 🖨️  Printer Connection Status:', isConnected ? 'CONNECTED ✅' : 'DISCONNECTED ❌');
            console.log('[Print] 🚀 Attempting QZ Tray print...');

            // Wrap receipt in minimal HTML structure for QZ Tray
            const printHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        * {
                            box-sizing: border-box;
                        }
                        body { 
                            font-family: 'Courier New', monospace; 
                            font-size: 9px;
                            width: 80mm !important;   /* Full paper width */
                            max-width: 80mm !important;
                            margin: 0;
                            padding: 1.5mm 4mm 3mm 4mm;  /* Equal side padding for centering */
                            background: white;
                            overflow: hidden;
                            height: auto !important;
                        }
                        /* Center content wrapper for upper part - shifted left by 1mm */
                        .receipt-header,
                        .receipt-details,
                        .receipt-table,
                        .receipt-copy-header {
                            max-width: 68mm;
                            margin-left: auto;
                            margin-right: auto;
                            transform: translateX(-3.8mm); /* Total shift -3.8mm (previous -3.5mm + 0.3mm) */
                        }
                        /* Center content wrapper for lower part - shifted left by 1.5mm */
                        .receipt-totals,
                        .receipt-footer {
                            max-width: 68mm;
                            margin-left: auto;
                            margin-right: auto;
                            transform: translateX(-1.5mm); /* Shift left by 1.5mm as requested */
                        }
                        .receipt-logo {
                            display: block;
                            margin: 0 auto 6px auto;
                            max-width: 50mm;
                            max-height: 20mm;
                            object-fit: contain;
                        }
                        .receipt-header { 
                            text-align: center; 
                            margin-bottom: 8px;
                            border-bottom: 2px solid #000;
                            padding-bottom: 6px;
                        }
                        .receipt-header h2 { 
                            font-size: 14px;
                            margin: 0 0 4px 0;
                            font-weight: bold;
                            letter-spacing: 0.5px;
                        }
                        .receipt-header p {
                            margin: 1px 0;
                            font-size: 9px;
                            line-height: 1.3;
                        }
                        .receipt-details {
                            margin-bottom: 6px;
                            display: flex;
                            justify-content: space-between;
                            font-size: 8px;
                        }
                        .receipt-table { 
                            width: 100%; 
                            border-collapse: collapse;
                            margin-bottom: 6px;
                            table-layout: fixed;
                        }
                        .receipt-table colgroup col:first-child {
                            width: 55%;           /* Description column */
                        }
                        .receipt-table colgroup col:last-child {
                            width: 45%;           /* Amount column - more space */
                        }
                        .receipt-table th { 
                            text-align: left; 
                            border-bottom: 2px solid #000;
                            padding: 2px 0;
                            font-size: 11px;
                            font-weight: bold;
                        }
                        .receipt-table th.text-right {
                            text-align: right;
                            padding: 2px 2mm 2px 4px; /* Matches td padding */
                            white-space: nowrap;
                        }
                        .receipt-table td { 
                            padding: 1px 0;
                            vertical-align: top;
                            font-size: 11px;           /* Increased from 9px */
                        }
                        .receipt-table td.text-right {
                            text-align: right;
                            padding: 1px 2mm 1px 4px;   /* 2mm right padding */
                            white-space: nowrap;
                            font-size: 11px;           /* Increased from 9px */
                            font-weight: bold;         /* Make amounts bold */
                            min-width: 24mm;           /* More space for long amounts */
                        }
                        .receipt-item-name {
                            display: block;
                            font-weight: bold;         /* Make item names bold */
                            font-size: 11px;           /* Match table font size */
                        }
                        .receipt-item-meta {
                            font-weight: normal;       /* Keep quantity/price normal */
                            font-size: 9px;
                        }
                        /* ... item styles ... */
                        .receipt-row { 
                            display: flex; 
                            justify-content: space-between; 
                            margin: 1px 0;
                            font-size: 9px;
                            gap: 2px;
                            padding-right: 2mm; /* Match table cell padding */
                        }
                        .receipt-row.bold { 
                            font-weight: bold;
                            font-size: 9.5px;
                            border-top: 2px solid #000;
                            padding-top: 3px;
                            margin-top: 3px;
                            padding-right: 2mm; /* Ensure bold rows also match */
                        }
                        .receipt-totals { 
                            border-top: 2px solid #000; 
                            padding-top: 3px;
                            margin: 3px 0;
                        }
                        .receipt-totals .text-right {
                            font-size: 9.5px;
                            font-weight: bold;
                        }
                        .receipt-footer { 
                            text-align: center; 
                            border-top: 1px dashed #000;
                            padding-top: 4px;
                            margin-top: 4px;
                            font-size: 8px;
                        }
                    </style>
                </head>
                <body>
                    ${receiptHtml}
                </body>
                </html>
            `;

            // Send to QZ Tray for printing
            console.log('[Print] 📤 Sending receipt to thermal printer...');
            await window.qzPrinter.printHTML(printHtml);
            console.log('[Print] ✅ Receipt sent to printer successfully');

            // Show success message
            if (window.toast) {
                window.toast.success('Receipt printed successfully');
            }

            console.log('[Print] 🎉 QZ Tray print job completed successfully');
            console.log('%c✅ PRINT SUCCESSFUL - Receipt printed to thermal printer!', 'color: green; font-weight: bold; font-size: 14px;');
            console.log('🖨️  ========== PRINT JOB FINISHED ==========');

            // Close modal after successful print
            setTimeout(() => {
                if (typeof closeReceiptPreview === 'function') {
                    closeReceiptPreview();
                }
            }, 500);

            return true;

        } catch (error) {
            console.error('[Print] ❌ QZ Tray print failed:', error);
            console.log('%c❌ PRINT FAILED - QZ Tray Error: ' + error.message, 'color: red; font-weight: bold; font-size: 14px;');
            console.log('[Print] 🔄 Falling back to browser print...');

            if (window.toast) {
                window.toast.warning('QZ Tray unavailable - using browser print');
            }

            fallbackToBrowserPrint();
        }
    } else {
        console.log('[Print] ⚠️  QZ Tray not available');
        console.log('[Print] 🖨️  Printer Status: Not connected to QZ Tray');
        console.log('[Print] 📄 Using browser print dialog...');

        if (window.toast) {
            window.toast.info('Using browser print dialog');
        }

        fallbackToBrowserPrint();
    }
};

/**
 * Fallback to standard browser print
 */
function fallbackToBrowserPrint() {
    if (!document.getElementById('thermal-print-styles')) {
        const printStyles = `
            @media print {
                @page {
                    size: 80mm auto;
                    margin: 0;
                }
                
                body * {
                    visibility: hidden;
                }
                
                #receipt-preview,
                #receipt-preview * {
                    visibility: visible;
                }
                
                #receipt-preview {
                    position: absolute;
                    left: 0;
                    right: 0;
                    margin: 0 auto;
                    width: 68mm;
                    top: 0;
                    padding: 2mm 6mm;
                    background: white !important;
                    font-family: 'Courier New', monospace;
                    font-size: 9px;
                }

                /* Shift upper part left by 3.8mm in print mode */
                .receipt-header,
                .receipt-details,
                .receipt-table,
                .receipt-copy-header {
                    transform: translateX(-3.8mm);
                }

                /* Shift lower part left by 1.5mm in print mode */
                .receipt-totals,
                .receipt-footer {
                    transform: translateX(-1.5mm);
                }
                
                .modal-overlay,
                .modal-header,
                .modal-footer {
                    display: none !important;
                }

                /* Mirror important QZ styles in print fallback */
                .receipt-table {
                    width: 100%;
                    table-layout: fixed;
                }
                .receipt-table colgroup col:first-child { width: 55%; }
                .receipt-table colgroup col:last-child   { width: 45%; }
                .receipt-table td {
                    font-size: 11px;
                }
                .receipt-table td.text-right,
                .receipt-table th.text-right {
                    padding: 1px 2mm 1px 4px;
                    white-space: nowrap;
                    font-size: 11px;
                    font-weight: bold;
                    min-width: 24mm;
                }
                .receipt-item-name {
                    display: block;
                    font-weight: bold;
                    font-size: 11px;
                }
                .receipt-item-meta {
                    font-weight: normal;
                    font-size: 9px;
                }
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.id = 'thermal-print-styles';
        styleSheet.textContent = printStyles;
        document.head.appendChild(styleSheet);
    }

    console.log('[Print] 🖨️  Opening browser print dialog...');
    window.print();
    console.log('[Print] 📄 Browser print dialog shown');

    setTimeout(() => {
        if (typeof closeReceiptPreview === 'function') {
            closeReceiptPreview();
        }
    }, 500);
}

/**
 * Check if specific printer is available (experimental)
 */
async function checkPrinterAvailability() {
    try {
        if ('navigator' in window && 'getPrinters' in navigator) {
            const printers = await navigator.getPrinters();
            const targetPrinter = printers.find(p =>
                POS_PRINTER_CONFIG.targetPrinterNames.some(name => p.name.includes(name))
            );
            return targetPrinter ? true : false;
        }
    } catch (error) {
        console.warn('Printer detection not supported:', error);
    }
    return false;
}

// Export for use in pos.js
window.POS_PRINTER_CONFIG = POS_PRINTER_CONFIG;
window.checkPrinterAvailability = checkPrinterAvailability;

console.log('[POS Printer] Configuration loaded:', POS_PRINTER_CONFIG);