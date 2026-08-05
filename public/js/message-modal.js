/**
 * Global Message Modal Utility
 * Provides a consistent modal interface for displaying success/error/warning messages
 * Replaces native alert() calls with better UX
 */

class MessageModal {
    constructor() {
        this.init();
    }

    init() {
        // Create modal HTML if it doesn't exist
        if (!document.getElementById('globalMessageModal')) {
            const modalHTML = `
                <div id="globalMessageModal" class="modal-overlay" style="display: none;">
                    <div class="modal-container" style="max-width: 450px;">
                        <div class="modal-header">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <i id="globalMessageIcon" class="fas fa-info-circle" style="font-size: 1.5rem;"></i>
                                <h3 id="globalMessageTitle">Message</h3>
                            </div>
                            <button class="btn-icon" onclick="window.messageModal.close()">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div id="globalMessageContent" style="line-height: 1.6;"></div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-primary" onclick="window.messageModal.close()">OK</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    }

    /**
     * Show a message modal
     * @param {string} type - 'success', 'error', 'warning', 'info'
     * @param {string} title - Modal title
     * @param {string} message - Message content (can include HTML)
     */
    show(type = 'info', title = 'Message', message = '') {
        const modal = document.getElementById('globalMessageModal');
        const iconEl = document.getElementById('globalMessageIcon');
        const titleEl = document.getElementById('globalMessageTitle');
        const contentEl = document.getElementById('globalMessageContent');

        if (!modal || !iconEl || !titleEl || !contentEl) {
            console.error('[MessageModal] Required elements not found');
            return;
        }

        // Set icon and color based on type
        switch (type) {
            case 'success':
                iconEl.className = 'fas fa-check-circle';
                iconEl.style.color = 'var(--success)';
                break;
            case 'error':
                iconEl.className = 'fas fa-times-circle';
                iconEl.style.color = 'var(--danger)';
                break;
            case 'warning':
                iconEl.className = 'fas fa-exclamation-triangle';
                iconEl.style.color = 'var(--warning)';
                break;
            default:
                iconEl.className = 'fas fa-info-circle';
                iconEl.style.color = 'var(--info)';
        }

        titleEl.textContent = title;
        contentEl.innerHTML = message; // Allow HTML for formatted messages

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }

    /**
     * Close the message modal
     */
    close() {
        const modal = document.getElementById('globalMessageModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    }

    /**
     * Convenience methods for different message types
     */
    success(message, title = 'Success') {
        this.show('success', title, message);
    }

    error(message, title = 'Error') {
        this.show('error', title, message);
    }

    warning(message, title = 'Warning') {
        this.show('warning', title, message);
    }

    info(message, title = 'Information') {
        this.show('info', title, message);
    }

    /**
     * Show a confirmation dialog
     * @param {string} title 
     * @param {string} message 
     * @param {Function} onConfirm 
     * @param {Function} onCancel 
     */
    confirm(title, message, onConfirm, onCancel) {
        // Create confirm modal ID if not exists
        if (!document.getElementById('globalConfirmModal')) {
            const modalHTML = `
                <div id="globalConfirmModal" class="modal-overlay" style="display: none;">
                    <div class="modal-container" style="max-width: 450px;">
                        <div class="modal-header">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <i id="globalConfirmIcon" class="fas fa-question-circle" style="font-size: 1.5rem; color: var(--warning);"></i>
                                <h3 id="globalConfirmTitle">Confirm Action</h3>
                            </div>
                            <button class="btn-icon" onclick="window.messageModal.closeConfirm()">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div id="globalConfirmContent" style="line-height: 1.6;"></div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" id="globalConfirmCancel">Cancel</button>
                            <button class="btn btn-primary" id="globalConfirmOk">Confirm</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        const modal = document.getElementById('globalConfirmModal');
        const titleEl = document.getElementById('globalConfirmTitle');
        const contentEl = document.getElementById('globalConfirmContent');
        const cancelBtn = document.getElementById('globalConfirmCancel');
        const confirmBtn = document.getElementById('globalConfirmOk');

        titleEl.textContent = title;
        contentEl.innerHTML = message;

        // Clone buttons to remove old event listeners
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newConfirmBtn = confirmBtn.cloneNode(true);

        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newCancelBtn.addEventListener('click', () => {
            this.closeConfirm();
            if (onCancel) onCancel();
        });

        newConfirmBtn.addEventListener('click', () => {
            this.closeConfirm();
            if (onConfirm) onConfirm();
        });

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }

    closeConfirm() {
        const modal = document.getElementById('globalConfirmModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    }
}

// Create singleton instance
const messageModal = new MessageModal();

// Make available globally
window.messageModal = messageModal;

// Export for modules
export default messageModal;
