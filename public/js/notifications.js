/**
 * Notification Manager
 * Handles polling for alerts and updating the UI
 */

import api from './api.js';

class NotificationManager {
    constructor() {
        this.pollInterval = 60000; // 1 minute
        this.timer = null;
        this._isVisible = false;
    }

    init() {
        this.setupEventListeners();
        this.fetchNotifications();
        this.startPolling();
    }

    setupEventListeners() {
        const toggle = document.getElementById('notificationToggle');
        const dropdown = document.getElementById('notificationDropdown');
        const clearAll = document.getElementById('markAllRead');

        if (toggle) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        if (clearAll) {
            clearAll.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clearNotifications();
            });
        }

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this._isVisible && !dropdown.contains(e.target) && e.target !== toggle) {
                this.toggleDropdown(false);
            }
        });
    }

    async fetchNotifications() {
        try {
            const result = await api.notifications.get();

            if (result.success) {
                this.updateUI(result.data);
            }
        } catch (error) {
            // Don't log expected 401s here, already handled by api.js
            if (error.status !== 401) {
                console.error('Failed to fetch notifications:', error);
            }
        }
    }

    updateUI(data) {
        const badge = document.getElementById('notificationBadge');
        const list = document.getElementById('notificationList');

        // Update badge
        if (data.totalCount > 0) {
            badge.textContent = data.totalCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }

        // Update list
        if (data.alerts && data.alerts.length > 0) {
            list.innerHTML = data.alerts.map(alert => `
                <a href="${alert.link}" class="notification-item" onclick="window.notificationManager.toggleDropdown(false)">
                    <div class="notification-icon-box ${alert.type}">
                        <i class="${this.getIcon(alert.type)}"></i>
                    </div>
                    <div class="notification-info">
                        <div class="notification-msg">${alert.message}</div>
                        <div class="notification-action">View details</div>
                    </div>
                </a>
            `).join('');
        } else {
            list.innerHTML = '<div class="notification-empty">No new notifications</div>';
        }
    }

    getIcon(type) {
        switch (type) {
            case 'po': return 'fas fa-file-contract';
            case 'grn': return 'fas fa-truck-loading';
            case 'quotation': return 'fas fa-file-alt';
            case 'overdue': return 'fas fa-exclamation-circle';
            default: return 'fas fa-bell';
        }
    }

    toggleDropdown(force) {
        const dropdown = document.getElementById('notificationDropdown');
        this._isVisible = force !== undefined ? force : !this._isVisible;

        if (this._isVisible) {
            dropdown.classList.add('active');
        } else {
            dropdown.classList.remove('active');
        }
    }

    clearNotifications() {
        // Just clear the UI for now as we don't have "read" persistence in DB yet
        const badge = document.getElementById('notificationBadge');
        const list = document.getElementById('notificationList');
        badge.style.display = 'none';
        list.innerHTML = '<div class="notification-empty">No new notifications</div>';
        this.toggleDropdown(false);
    }

    startPolling() {
        this.timer = setInterval(() => this.fetchNotifications(), this.pollInterval);
    }

    stopPolling() {
        if (this.timer) clearInterval(this.timer);
    }
}

const notificationManager = new NotificationManager();
window.notificationManager = notificationManager;
export default notificationManager;
