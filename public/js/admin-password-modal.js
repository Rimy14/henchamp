/**
 * Admin Password Modal Utility
 * Provides a reusable modal for admin password input
 */

class AdminPasswordModal {
    constructor() {
        this.modal = null;
        this.resolveCallback = null;
        this.rejectCallback = null;
        this.init();
    }

    init() {
        // Create modal HTML
        const modalHTML = `
            <div id="adminPasswordModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h2 id="adminPasswordTitle">Admin Authorization Required</h2>
                        <button id="closeAdminPasswordModal" class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p id="adminPasswordMessage" style="margin-bottom: 1rem; color: var(--gray-700);">
                            Enter admin password to proceed with this action.
                        </p>
                        <div class="form-group">
                            <label for="adminPasswordInput">Admin Password</label>
                            <input 
                                type="password" 
                                id="adminPasswordInput" 
                                class="form-control" 
                                placeholder="Enter password"
                                autocomplete="off"
                            >
                            <small id="adminPasswordError" class="error-message" style="display: none; color: var(--danger); margin-top: 0.5rem;"></small>
                        </div>
                    </div>
                    <div class="modal-footer" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button id="cancelAdminPassword" class="btn btn-secondary">Cancel</button>
                        <button id="submitAdminPassword" class="btn btn-primary">Submit</button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body if not exists
        if (!document.getElementById('adminPasswordModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        this.modal = document.getElementById('adminPasswordModal');
        this.setupListeners();
    }

    setupListeners() {
        const closeBtn = document.getElementById('closeAdminPasswordModal');
        const cancelBtn = document.getElementById('cancelAdminPassword');
        const submitBtn = document.getElementById('submitAdminPassword');
        const input = document.getElementById('adminPasswordInput');

        // Close button
        closeBtn.addEventListener('click', () => this.close(null));

        // Cancel button
        cancelBtn.addEventListener('click', () => this.close(null));

        // Submit button
        submitBtn.addEventListener('click', () => this.submit());

        // Enter key to submit
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submit();
            }
        });

        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close(null);
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.close(null);
            }
        });
    }

    /**
     * Show the modal and return a promise with the password
     * @param {string} title - Modal title
     * @param {string} message - Modal message
     * @returns {Promise<string|null>} - Resolves with password or null if cancelled
     */
    show(title = 'Admin Authorization Required', message = 'Enter admin password to proceed with this action.') {
        return new Promise((resolve, reject) => {
            this.resolveCallback = resolve;
            this.rejectCallback = reject;

            // Set title and message
            document.getElementById('adminPasswordTitle').textContent = title;
            document.getElementById('adminPasswordMessage').textContent = message;

            // Clear previous input and errors
            const input = document.getElementById('adminPasswordInput');
            input.value = '';
            this.hideError();

            // Show modal
            this.modal.style.display = 'flex';

            // Focus input
            setTimeout(() => input.focus(), 100);
        });
    }

    submit() {
        const input = document.getElementById('adminPasswordInput');
        const password = input.value.trim();

        if (!password) {
            this.showError('Password is required');
            return;
        }

        this.close(password);
    }

    close(password) {
        this.modal.style.display = 'none';

        if (this.resolveCallback) {
            this.resolveCallback(password);
            this.resolveCallback = null;
            this.rejectCallback = null;
        }
    }

    showError(message) {
        const errorEl = document.getElementById('adminPasswordError');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    hideError() {
        const errorEl = document.getElementById('adminPasswordError');
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

// Create singleton instance
const adminPasswordModal = new AdminPasswordModal();

// Export for use in other modules
export default adminPasswordModal;
