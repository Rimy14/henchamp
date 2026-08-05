/**
 * Authentication utilities
 */

import api from './api.js';

class Auth {
    constructor() {
        this.currentUser = null;
    }

    /**
     * Check if user is authenticated
     */
    async checkAuth() {
        try {
            const response = await api.auth.getMe();
            if (response.success) {
                this.currentUser = response.user;
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Login user
     */
    async login(username, password) {
        try {
            const response = await api.auth.login({ username, password });
            if (response.success) {
                this.currentUser = response.user;
                return { success: true, user: response.user };
            }
            return { success: false, message: response.message };
        } catch (error) {
            return { success: false, message: error.message, status: error.status };
        }
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                this.currentUser = null;
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = '/';
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Check if user has role
     */
    hasRole(...roles) {
        if (!this.currentUser) return false;
        return roles.includes(this.currentUser.role);
    }

    /**
     * Redirect to login if not authenticated
     */
    async requireAuth() {
        const isAuth = await this.checkAuth();
        if (!isAuth) {
            window.location.href = '/';
            return false;
        }
        return true;
    }

    /**
     * Require specific role
     */
    async requireRole(...roles) {
        const isAuth = await this.requireAuth();
        if (!isAuth) return false;

        if (!this.hasRole(...roles)) {
            alert('You do not have permission to access this page');
            window.location.href = '/pages/dashboard.html';
            return false;
        }
        return true;
    }
}

// Create singleton instance
const auth = new Auth();

// System-wide Guard: Prevent modals from closing when clicking outside background overlay
if (typeof window !== 'undefined') {
    window.addEventListener('click', (e) => {
        if (e.target && (
            e.target.classList.contains('modal') ||
            e.target.classList.contains('modal-overlay') ||
            e.target.classList.contains('custom-modal-overlay') ||
            e.target.classList.contains('toast-modal') ||
            (e.target.id && e.target.id.toLowerCase().includes('modal') && e.target.tagName === 'DIV')
        )) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);
}

export default auth;
