/**
 * HenChamp Branded Login Page Functionality
 */

import auth from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const togglePasswordIcon = document.getElementById('togglePasswordIcon');

    // Password Visibility Toggle Handler
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            if (togglePasswordIcon) {
                togglePasswordIcon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
            }
        });
    }

    // Check if already logged in
    checkExistingAuth();

    // Check for expiration or error messages from URL
    checkForMessages();

    loginForm.addEventListener('submit', handleLogin);

    async function checkExistingAuth() {
        const isAuthenticated = await auth.checkAuth();
        if (isAuthenticated) {
            window.location.href = '/app.html'; // Redirect to app shell
        }
    }

    function checkForMessages() {
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.get('expired') === 'true') {
            showError('Your session has expired. Please login again.');
        } else if (urlParams.get('error') === 'true') {
            showError('An error occurred. Please login again.');
        }

        // Clean up URL
        if (urlParams.has('expired') || urlParams.has('error')) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    async function handleLogin(e) {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        // Basic validation
        if (!username || !password) {
            showError('Please enter both username and password');
            return;
        }

        // Disable form
        setLoading(true);
        hideError();

        try {
            const result = await auth.login(username, password);

            if (result.success) {
                // Redirect to app shell
                window.location.href = '/app.html';
            } else {
                let msg = result.message || 'Login failed. Please try again.';

                // Specific handling based on status codes
                if (result.status === 401) {
                    msg = 'Invalid username or password';
                } else if (result.status === 403) {
                    msg = 'Your account has been deactivated. Please contact an administrator.';
                } else if (result.status === 500) {
                    msg = 'A server error occurred. Please try again later.';
                }

                showError(msg);
                setLoading(false);
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Unable to connect to the server. Please check your internet connection.');
            setLoading(false);
        }
    }

    function setLoading(loading) {
        const btnText = loginBtn.querySelector('.btn-text');
        const btnLoader = loginBtn.querySelector('.btn-loader');

        if (loading) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline-flex';
            loginBtn.disabled = true;
            usernameInput.disabled = true;
            passwordInput.disabled = true;
        } else {
            btnText.style.display = 'inline-flex';
            btnLoader.style.display = 'none';
            loginBtn.disabled = false;
            usernameInput.disabled = false;
            passwordInput.disabled = false;
        }
    }

    function showError(message) {
        if (errorText) {
            errorText.textContent = message;
        } else {
            errorMessage.textContent = message;
        }
        errorMessage.style.display = 'flex';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }

    // Allow Enter key to submit
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });
});
