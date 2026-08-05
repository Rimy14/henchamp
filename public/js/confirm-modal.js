/**
 * Confirmation Modal Utility
 * Provides a reusable modal for confirmation dialogs
 */

class ConfirmModal {
    constructor() {
        this.modal = null;
        this.resolveCallback = null;
        this.init();
    }

    init() {
        // Create modal HTML
        const modalHTML = `
            <div id="confirmModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h2 id="confirmTitle">Confirm Action</h2>
                        <button id="closeConfirmModal" class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p id="confirmMessage" style="margin-bottom: 1.5rem; color: var(--gray-700); font-size: 1rem;">
                            Are you sure you want to proceed?
                        </p>
                    </div>
                    <div class="modal-footer" style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                        <button id="cancelConfirm" class="btn btn-secondary">Cancel</button>
                        <button id="submitConfirm" class="btn btn-primary">Confirm</button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body if not exists
        if (!document.getElementById('confirmModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        this.modal = document.getElementById('confirmModal');
        this.setupListeners();
    }

    setupListeners() {
        const closeBtn = document.getElementById('closeConfirmModal');
        const cancelBtn = document.getElementById('cancelConfirm');
        const submitBtn = document.getElementById('submitConfirm');

        // Close button
        closeBtn.addEventListener('click', () => this.close(false));

        // Cancel button
        cancelBtn.addEventListener('click', () => this.close(false));

        // Submit button
        submitBtn.addEventListener('click', () => this.close(true));

        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close(false);
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.close(false);
            }
        });

        // Enter key to confirm
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.modal.style.display === 'flex') {
                this.close(true);
            }
        });
    }

    /**
     * Show the modal and return a promise with the user's choice
     * @param {string} title - Modal title
     * @param {string} message - Modal message
     * @param {string} confirmText - Text for confirm button (default: "Confirm")
     * @param {string} confirmClass - CSS class for confirm button (default: "btn-primary")
     * @returns {Promise<boolean>} - Resolves with true if confirmed, false if cancelled
     */
    show(title = 'Confirm Action', message = 'Are you sure you want to proceed?', confirmText = 'Confirm', confirmClass = 'btn-primary') {
        return new Promise((resolve) => {
            this.resolveCallback = resolve;

            // Set title and message
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;

            // Set confirm button text and class
            const submitBtn = document.getElementById('submitConfirm');
            submitBtn.textContent = confirmText;
            submitBtn.className = `btn ${confirmClass}`;

            // Show modal
            this.modal.style.display = 'flex';

            // Focus confirm button
            setTimeout(() => submitBtn.focus(), 100);
        });
    }

    close(confirmed) {
        this.modal.style.display = 'none';

        if (this.resolveCallback) {
            this.resolveCallback(confirmed);
            this.resolveCallback = null;
        }
    }
}

// Create singleton instance
const confirmModal = new ConfirmModal();

// Export for use in other modules
export default confirmModal;
