/**
 * Show modal with custom type (success, error, warning, info)
 */
function showModal(message, title, type = 'error') {
    // Close any existing modal first
    closeModal();

    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-triangle',
        warning: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    const gradientMap = {
        success: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        error: 'linear-gradient(135deg, #f5576c 0%, #e94057 100%)',
        warning: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        info: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    };

    const modal = document.createElement('div');
    modal.className = 'custom-modal-overlay';
    modal.innerHTML = `
        <div class="custom-modal">
            <div class="custom-modal-header" style="background: ${gradientMap[type]}">
                <i class="fas ${iconMap[type]}"></i>
                <h3>${title || 'Notification'}</h3>
            </div>
            <div class="custom-modal-body">
                <p>${message.replace(/\\n/g, '<br>')}</p>
            </div>
            <div class="custom-modal-footer">
                <button class="btn btn-primary" onclick="closeCustomModal()">
                    <i class="fas fa-check"></i> OK
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Auto-focus and allow ESC to close
    setTimeout(() => {
        const button = modal.querySelector('button');
        if (button) button.focus();
    }, 100);

    // Allow ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * Close modal
 */
function closeModal() {
    const modal = document.querySelector('.custom-modal-overlay');
    if (modal) modal.remove();
}

// Export for window (for onclick handlers)
window.closeCustomModal = closeModal;
window.showModal = showModal;
