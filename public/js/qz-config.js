/**
 * QZ Tray Configuration for POS Thermal Printer
 * Handles connection and printing to Printer_POS-80 or Printer_POS-81
// ekOPz0E3R64tcBLx4a+SLSYlKtrioK4SKGqpj/oDbXUPd0dLT4UeDrIC7riPh51g
// RlprXTw/AgMBAAECggEAD/3bchj0JwlmZzUZKWCPtg0Hk/PoUB4LKBsQHvZNNJOr
// N+xZwvPn2LhTPJJIQpLsLTaGlvSHLv8vPLYXmMmLxPIrBfhXJPm4ggGPKE9xEf2y
// XNJkMpLUBr8JYQBWvj6pWJwMFKbQKqLQkA0Gf/zLYHmNxvqQKGEREMiMIbAm7fJb
// dMgMQQbJ8hUv56TZuXZLF6RMIJ9Mc5lJpHoNaMkOTfQHvSTjZEODGJNklYC0sQaL
// +kj8p8v5ZCOshVZpLDLbKmDvRWGaCLMYZPpYOxZxSIpQKmLaVF2VBhCpHU7vv+QI
// JhK9q4nXvKfMeBwLLlvGGJY0pLcpNYQaEKThPQKBAoGBAM3PO4kH0Lhe8kJ7wnrM
// c1F0n5YaUdF8vLFlT2lYPmGO2j1a4p+ks6nMXhkMJ6Z1LYqKPlOUzQGxE8kbQYEG
// VqMNFLLbJbdGF8lBDOaPMJ3fPJgSF8S9mLQUHYOXQxp8lqJpJ9PqY8XQKE0hXn4L
// XNRL/tYXKRkHF8j0MxPJ8XHlAoGBAMWB8eX7xSJHvRNsEBdBLJ7jEnPQN0ReFCJD
// 9gJTLQSvP0+tAQXG8lNPMQKMHJm8rQMQ8hLjC0nLl7TlVJ8RbZ5WqGLHhDdJL0lF
// 4i2MRO0Nk8H0G0qYKQgNYU3F4C8F0cU8kLHKqJQhvJJaVUbIE8L8Jm6bL6Dh0X0V
// kWEEkfFHAoGBAI4qKNTKLHQJLk8Fk7IKlnJPF8J8E3G9L1hLyZxBqPQI0RIyZx0a
// 0FqMRM8J6WLO8lWPSGqQhEBpGJl2aVFBL1ShL3hKPlQQhJFJ8EhTJLJj8RPGhJPQ
// mGLkMFn0hYBNJFqMCKQkLYqYjF0FGhFKJ6LqJRQ9FqGMq8hL0F8qH9LVAoGBAKNL
// mBPJLnQi8FhxqJMqGMJqK9Lh3XJN9qvZJ8L0jQGhUlL8nsPHLJFM8q3Ri8jZYGJN
// JBqlj8kJ0HnL4l8PFJhLZJRqL8J0LKFJQG9N0L8K8HJhG4LJrMFhBLJKMGq8kFJL
// gGJN0LhMBK8JqFJKJGqL0GhJLIJNqMGKr8L0JFAhAoGBAMJ8L0J9qL3FhJLqK8JN
// qLhM8GJFKJhL0JqN8LKJGqMJL0F8JNqKJGhL8JMqL0GJhN8LKJFqMJKr0FhJL8JN
// qG8KJLhMB8JFKLJhG0JNqL8KJGqMFL0JhL8JNKGqMJL0F8JNqKJGhL8JMqL0GJhN
// 8LKJFqMJL0F8JNqKJGMfl8JNqL0KJGqMJL0FhJL8JNqG8K
// -----END PRIVATE KEY-----`;

/**
 * Configure QZ Tray security with digital certificate
 * Uses Node.js backend for signing (private key stays secure on server)
 */
if (window.qz) {
    console.log('[QZ Tray] Configuring certificate signing with Node.js backend...');

    // Set certificate from public URL
    qz.security.setCertificatePromise(function (resolve, reject) {
        fetch('/qz/digital-certificate.txt')
            .then(response => response.text())
            .then(cert => {
                console.log('[QZ Tray] ✅ Certificate loaded from server');
                resolve(cert);
            })
            .catch(err => {
                console.error('[QZ Tray] ❌ Failed to load certificate:', err);
                reject(err);
            });
    });

    // Set signature algorithm
    qz.security.setSignatureAlgorithm("SHA256"); // Node.js crypto uses SHA256

    // Set signature promise - calls backend to sign
    qz.security.setSignaturePromise(function (toSign) {
        return function (resolve, reject) {
            fetch('/api/qz/sign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ request: toSign }),
                credentials: 'include'
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log('[QZ Tray] ✅ Request signed by server');
                        resolve(data.signature);
                    } else {
                        console.error('[QZ Tray] ❌ Signing failed:', data.message);
                        reject(new Error(data.message));
                    }
                })
                .catch(err => {
                    console.error('[QZ Tray] ❌ Signing request failed:', err);
                    reject(err);
                });
        };
    });

    console.log('[QZ Tray] ✅ Certificate signing configured - using secure Node.js backend');
}

class QZPrinter {
    constructor() {
        this.printerNames = ['Printer_POS-81', 'Printer_POS-80']; // Target thermal printer names (priority order)
        this.connected = false;
        this.qz = window.qz;
    }

    /**
     * Initialize QZ Tray connection
     */
    async connect() {
        if (!this.qz) {
            throw new Error('QZ Tray library not loaded');
        }

        if (this.connected) {
            return true;
        }

        try {
            // Check if QZ Tray is running
            if (!this.qz.websocket.isActive()) {
                await this.qz.websocket.connect();
            }

            this.connected = true;
            console.log('[QZ Tray] ✅ Connected successfully');
            console.log('[QZ Tray] 🖨️  Printer Status: CONNECTED');
            return true;
        } catch (error) {
            console.error('[QZ Tray] ❌ Connection failed:', error);
            console.log('[QZ Tray] 🖨️  Printer Status: DISCONNECTED');
            throw new Error('QZ Tray not running. Please start QZ Tray application.');
        }
    }

    /**
     * Disconnect from QZ Tray
     */
    async disconnect() {
        if (this.qz && this.qz.websocket.isActive()) {
            await this.qz.websocket.disconnect();
            this.connected = false;
            console.log('[QZ Tray] Disconnected');
        }
    }

    /**
     * Find printer by name
     */
    async findPrinter() {
        try {
            const printers = await this.qz.printers.find();
            console.log('[QZ Tray] Available printers:', printers);

            // Try exact match first (in priority order)
            let printer = null;
            for (const name of this.printerNames) {
                printer = printers.find(p => p === name);
                if (printer) {
                    console.log(`[QZ Tray] ✅ Found exact match: ${printer}`);
                    break;
                }
            }

            // Try partial match if exact not found
            if (!printer) {
                printer = printers.find(p =>
                    p.toLowerCase().includes('pos-81') ||
                    p.toLowerCase().includes('pos-80') ||
                    p.toLowerCase().includes('xprinter') ||
                    p.toLowerCase().includes('thermal')
                );
                if (printer) {
                    console.log(`[QZ Tray] ✅ Found partial match: ${printer}`);
                }
            }

            if (!printer) {
                console.warn('[QZ Tray] Target printer not found, using default');
                return printers[0]; // Fallback to first available
            }

            console.log('[QZ Tray] 🖨️  Active Printer Name:', printer);
            return printer;
        } catch (error) {
            console.error('[QZ Tray] Error finding printer:', error);
            throw error;
        }
    }

    /**
     * Print receipt HTML to thermal printer
     */
    async printHTML(htmlContent) {
        try {
            await this.connect();
            const printer = await this.findPrinter();

            const config = this.qz.configs.create(printer, {
                size: { width: 74 }, // 74mm width, auto height
                units: 'mm',
                margins: { top: 0, right: 0, bottom: 0, left: 0 }
            });

            const data = [{
                type: 'html',
                format: 'plain',
                data: htmlContent
            }];

            await this.qz.print(config, data);
            console.log('[QZ Tray] Print job sent successfully to', printer);

            return true;
        } catch (error) {
            console.error('[QZ Tray] Print failed:', error);
            throw error;
        }
    }

    /**
     * Check if QZ Tray is available and connected
     */
    isAvailable() {
        return this.qz && this.qz.websocket && this.qz.websocket.isActive();
    }
}

// Create global instance
window.qzPrinter = new QZPrinter();

// Auto-connect on page load if enabled in client config
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/config/client-config');
        const data = await response.json();
        
        if (data && data.success && data.config && data.config.enableQzTray === false) {
            console.log('[QZ Tray] ℹ️ Integration is disabled in settings. Direct thermal printing will not be used.');
            return;
        }
    } catch (configErr) {
        console.warn('[QZ Tray] ⚠️ Failed to load client config, trying to connect anyway...', configErr);
    }

    console.log('[QZ Tray] 🔄 Attempting to connect to printer...');
    try {
        await window.qzPrinter.connect();
        console.log('[QZ Tray] 🎉 Printer ready for use');
    } catch (error) {
        console.warn('[QZ Tray] ⚠️  Auto-connect failed:', error.message);
        console.warn('[QZ Tray] 📄 Will fall back to browser print');
    }
});

// Disconnect on page unload
window.addEventListener('beforeunload', () => {
    if (window.qzPrinter) {
        window.qzPrinter.disconnect();
    }
});

console.log('[QZ Tray] Configuration loaded');
