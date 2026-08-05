/**
 * Loading Screen Manager
 * Provides utilities for showing/hiding loading overlays
 */

class LoadingScreen {
    constructor() {
        this.isShowing = false;
        this.minDisplayTime = 150; // Minimum time to show loading (prevent flashing) - reduced from 300ms for better responsiveness
        this.showTimestamp = null;
        this.pendingHide = false;
        this.maxTimeoutId = null; // Safety timeout ID
        this.init();
    }

    /**
     * Initialize loading screen elements
     */
    init() {
        // Create content-area loading overlay if it doesn't exist
        if (!document.getElementById('globalLoadingOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'globalLoadingOverlay';
            overlay.className = 'loading-overlay content-area-overlay';
            overlay.style.display = 'none'; // Ensure hidden on init
            overlay.innerHTML = `
                <div class="loading-content">
                    <div class="spinner-large"></div>
                    <div class="loading-message" id="loadingMessage">Loading...</div>
                </div>
            `;

            // Append to content area instead of body for scoped loading
            const contentArea = document.getElementById('content-area');
            if (contentArea) {
                // Ensure content-area has relative positioning for absolute overlay
                const computedStyle = window.getComputedStyle(contentArea);
                if (computedStyle.position === 'static') {
                    contentArea.style.position = 'relative';
                }
                contentArea.appendChild(overlay);
            } else {
                // Fallback to body if content-area not found (e.g., login page)
                document.body.appendChild(overlay);
            }
        }
    }

    /**
     * Show content-area loading screen
     * @param {string} message - Optional loading message
     */
    show(message = 'Loading...') {
        this.isShowing = true;
        this.showTimestamp = Date.now();
        this.pendingHide = false;

        const overlay = document.getElementById('globalLoadingOverlay');
        const messageEl = document.getElementById('loadingMessage');

        if (overlay) {
            if (messageEl) {
                messageEl.textContent = message;
            }
            overlay.style.display = 'flex';
            overlay.classList.add('active');
            // Don't prevent body scroll for content-area overlay
            // document.body.style.overflow = 'hidden';
        }

        // Safety mechanism: Force hide after 30 seconds
        // This prevents permanent stuck loading screens
        if (this.maxTimeoutId) {
            clearTimeout(this.maxTimeoutId);
        }
        this.maxTimeoutId = setTimeout(() => {
            if (this.isShowing) {
                console.warn('[LoadingScreen] Force hiding - exceeded maximum display time (30s)');
                this.hide(true);
            }
        }, 30000); // 30 second absolute maximum
    }

    /**
     * Hide content-area loading screen
     * @param {boolean} force - Force immediate hide, ignore min display time
     */
    async hide(force = false) {
        if (!this.isShowing) return;

        const elapsed = Date.now() - this.showTimestamp;
        const remaining = this.minDisplayTime - elapsed;

        if (!force && remaining > 0) {
            // Wait for minimum display time
            this.pendingHide = true;
            await new Promise(resolve => setTimeout(resolve, remaining));
        }

        if (this.pendingHide || force) {
            this.isShowing = false;
            this.pendingHide = false;

            // Clear safety timeout
            if (this.maxTimeoutId) {
                clearTimeout(this.maxTimeoutId);
                this.maxTimeoutId = null;
            }

            const overlay = document.getElementById('globalLoadingOverlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.classList.remove('error-state');
                overlay.style.display = 'none';
            }
        }
    }

    /**
     * Show error state in the loading overlay
     * @param {string} title - Error title
     * @param {string} message - Error message
     */
    showError(title = 'Connection Error', message = 'Failed to connect to the server. Please check your internet connection.') {
        this.isShowing = true;
        this.showTimestamp = Date.now();
        this.pendingHide = false;

        if (this.maxTimeoutId) {
            clearTimeout(this.maxTimeoutId);
            this.maxTimeoutId = null;
        }

        const overlay = document.getElementById('globalLoadingOverlay');
        const content = overlay ? overlay.querySelector('.loading-content') : null;

        if (overlay && content) {
            overlay.classList.add('error-state');
            overlay.style.display = 'flex';
            overlay.classList.add('active');

            content.innerHTML = `
                <div class="error-icon"><i class="fas fa-wifi-slash"></i></div>
                <h2 class="error-title">${title}</h2>
                <div class="error-message">${message}</div>
                <div class="error-actions">
                    <button class="btn btn-primary" onclick="window.location.reload()"><i class="fas fa-sync-alt"></i> Retry / Reload</button>
                    ${!message.includes('internet') ? `<button class="btn btn-secondary" onclick="window.loadingScreen.hide(true)">Dismiss</button>` : ''}
                </div>
            `;
        }
    }

    /**
     * Show loading in a specific element
     * @param {HTMLElement|string} element - Element or selector
     * @param {string} message - Optional loading message
     */
    showInElement(element, message = 'Loading...') {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;

        // Store original position if not already set
        const currentPosition = window.getComputedStyle(el).position;
        if (currentPosition === 'static') {
            el.style.position = 'relative';
            el.dataset.originalPosition = 'static';
        }

        // Create element-specific overlay
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay element-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner-large"></div>
                <div class="loading-message">${message}</div>
            </div>
        `;

        el.appendChild(overlay);
        // Force reflow for animation
        overlay.offsetHeight;
        overlay.classList.add('active');
    }

    /**
     * Hide loading from a specific element
     * @param {HTMLElement|string} element - Element or selector
     */
    hideInElement(element) {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;

        const overlay = el.querySelector('.loading-overlay.element-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                // Restore original position if it was static
                if (el.dataset.originalPosition === 'static') {
                    el.style.position = '';
                    delete el.dataset.originalPosition;
                }
            }, 300); // Match CSS transition time
        }
    }

    /**
     * Wrap an async function with loading screen
     * @param {Function} fn - Async function to wrap
     * @param {string} message - Loading message
     * @returns {Function} Wrapped function
     */
    wrap(fn, message = 'Loading...') {
        return async (...args) => {
            this.show(message);
            try {
                const result = await fn(...args);
                return result;
            } finally {
                await this.hide();
            }
        };
    }

    /**
     * Wrap an async function with element-specific loading
     * @param {Function} fn - Async function to wrap
     * @param {HTMLElement|string} element - Element or selector
     * @param {string} message - Loading message
     * @returns {Function} Wrapped function
     */
    wrapElement(fn, element, message = 'Loading...') {
        return async (...args) => {
            this.showInElement(element, message);
            try {
                const result = await fn(...args);
                return result;
            } finally {
                this.hideInElement(element);
            }
        };
    }
}

// Create and export singleton instance
const loadingScreen = new LoadingScreen();

// Make available globally
window.loadingScreen = loadingScreen;

// Safety mechanism: Force hide loading screen if user returns to tab and it's been showing too long
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && loadingScreen.isShowing) {
        const elapsed = Date.now() - loadingScreen.showTimestamp;
        if (elapsed > 5000) { // If showing for > 5 seconds
            console.warn('Force hiding stuck loading screen (user returned to tab)');
            loadingScreen.hide(true); // Force hide
        }
    }
});

export default loadingScreen;
