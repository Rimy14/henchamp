import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import messageModal from './message-modal.js';
import Pagination from './pagination.js';

let users = [];
let editingUserId = null;
let usersPagination = null;
let currentVoidPasswordValue = '';


// Export init function for Router
export default async function init() {
    // Reset state
    users = [];
    editingUserId = null;
    usersPagination = null;

    // Check authentication and admin role
    const isAuthenticated = await auth.checkAuth();
    if (!isAuthenticated) return;

    const user = auth.currentUser;

    // Check if user is admin
    if (user.role.toLowerCase() !== 'admin') {
        toast.error('Access Denied: Admin privileges required');
        setTimeout(() => {
            window.location.hash = '#/dashboard';
        }, 2000);
        return;
    }

    // Initialize pagination for both tabs
    usersPagination = new Pagination('usersPaginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            loadUsers(page);
        }
    });

    // Show loading screen
    loadingScreen.show('Loading data...');

    try {
        await loadUsers(1);
        await loadVoidPassword();
        await loadRolesForDropdown();
    } finally {
        await loadingScreen.hide();
    }

    // Event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Add button (dynamic based on active tab)
    const addBtn = document.getElementById('addBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            openAddUserModal();
        });
    }

    // User modal events
    const closeUserModalBtn = document.getElementById('closeUserModalBtn');
    if (closeUserModalBtn) closeUserModalBtn.addEventListener('click', closeUserModal);

    const cancelUserBtn = document.getElementById('cancelUserBtn');
    if (cancelUserBtn) cancelUserBtn.addEventListener('click', closeUserModal);

    const userForm = document.getElementById('userForm');
    if (userForm) userForm.addEventListener('submit', handleUserSubmit);

    // Void password events
    const editVoidPasswordBtn = document.getElementById('editVoidPasswordBtn');
    if (editVoidPasswordBtn) editVoidPasswordBtn.addEventListener('click', openVoidPasswordModal);

    const toggleVoidPasswordBtn = document.getElementById('toggleVoidPasswordBtn');
    if (toggleVoidPasswordBtn) toggleVoidPasswordBtn.addEventListener('click', toggleVoidPasswordVisibility);

    const closeVoidPasswordModalBtn = document.getElementById('closeVoidPasswordModalBtn');
    if (closeVoidPasswordModalBtn) closeVoidPasswordModalBtn.addEventListener('click', closeVoidPasswordModal);

    const cancelVoidPasswordBtn = document.getElementById('cancelVoidPasswordBtn');
    if (cancelVoidPasswordBtn) cancelVoidPasswordBtn.addEventListener('click', closeVoidPasswordModal);

    const voidPasswordForm = document.getElementById('voidPasswordForm');
    if (voidPasswordForm) voidPasswordForm.addEventListener('submit', handleVoidPasswordSubmit);
}

// ==================== USERS FUNCTIONS ====================

async function loadUsers(page = 1) {
    try {
        const { limit } = usersPagination ? usersPagination.getState() : { limit: 10 };

        const response = await api.users.getAll({
            page: page,
            limit: limit
        });

        if (response.success) {
            users = response.data;
            renderUsers();

            if (usersPagination && response.pagination) {
                usersPagination.update(response.pagination);
            }
        }
    } catch (error) {
        console.error('Error loading users:', error);
        toast.error('Failed to load users');
    }
}

function renderUsers() {
    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        const statusBadge = user.status === 'active'
            ? '<span style="color: var(--success); font-weight: 600;">Active</span>'
            : '<span style="color: var(--danger); font-weight: 600;">Inactive</span>';

        const roleLower = (user.role || '').toLowerCase();
        const roleBadge = roleLower === 'admin'
            ? '<span style="background: var(--primary-600); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">Admin</span>'
            : roleLower === 'coordinator'
                ? '<span style="background: var(--warning); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">Coordinator</span>'
                : '<span style="background: var(--gray-600); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">Cashier</span>';

        return `
            <tr>
                <td>${user.id}</td>
                <td><strong>${user.username}</strong></td>
                <td>${user.email || '-'}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>
                    <button class="btn btn-sm btn-secondary" onclick="window.editUser(${user.id})">Edit</button>
                    ${user.status === 'active'
                ? `<button class="btn btn-sm btn-danger" onclick="window.deactivateUser(${user.id}, '${user.username}')">Deactivate</button>`
                : `<button class="btn btn-sm btn-success" onclick="window.activateUser(${user.id}, '${user.username}')">Activate</button>`
            }
                </td>
            </tr>
        `;
    }).join('');
}

function openAddUserModal() {
    editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('passwordLabel').textContent = 'Password';
    document.getElementById('password').placeholder = 'Enter password';
    document.getElementById('password').required = true;
    document.getElementById('userStatus').value = 'active';
    document.getElementById('userModal').style.display = 'block';
}

window.editUser = function (id) {
    const user = users.find(u => u.id == id);
    if (!user) return;

    editingUserId = id;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user.id;
    document.getElementById('username').value = user.username;
    document.getElementById('email').value = user.email || '';

    const roleSelect = document.getElementById('role');
    if (roleSelect) {
        const matchedOption = Array.from(roleSelect.options).find(
            opt => opt.value === user.role || opt.value.toLowerCase() === (user.role || '').toLowerCase()
        );
        roleSelect.value = matchedOption ? matchedOption.value : (user.role || '');
    }

    document.getElementById('userStatus').value = user.status;

    // Show password field for edit (optional update)
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('passwordLabel').textContent = 'New Password';
    document.getElementById('password').placeholder = 'Leave blank to keep current';
    document.getElementById('password').required = false;

    document.getElementById('userModal').style.display = 'block';
};

function closeUserModal() {
    document.getElementById('userModal').style.display = 'none';
    document.getElementById('userForm').reset();
    editingUserId = null;
}

async function handleUserSubmit(e) {
    e.preventDefault();

    const userData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value || null,
        role: document.getElementById('role').value,
        status: document.getElementById('userStatus').value
    };

    // Handle password
    const password = document.getElementById('password').value;
    if (editingUserId) {
        // For edit: only include if provided
        if (password) {
            if (password.length < 6) {
                messageModal.warning('New password must be at least 6 characters long.', 'Validation Error');
                return;
            }
            userData.password = password;
        }
    } else {
        // For new user: required
        if (!password || password.length < 6) {
            messageModal.warning('Password must be at least 6 characters long.', 'Validation Error');
            return;
        }
        userData.password = password;
    }

    loadingScreen.show(editingUserId ? 'Updating user...' : 'Creating user...');

    try {
        let response;
        if (editingUserId) {
            response = await api.users.update(editingUserId, userData);
        } else {
            response = await api.users.create(userData);
        }

        if (response.success) {
            const isEdit = !!editingUserId;
            closeUserModal();
            messageModal.success(
                isEdit ? 'User details updated successfully!' : 'New user created successfully!',
                isEdit ? 'User Updated' : 'User Created'
            );
            await loadUsers();
        }
    } catch (error) {
        messageModal.error('Failed to save user: ' + (error.message || 'An error occurred'), 'Error');
    } finally {
        await loadingScreen.hide();
    }
}

window.deactivateUser = function (id, username) {
    // Prevent deactivating yourself
    const currentUser = auth.getCurrentUser();
    if (currentUser && currentUser.id === id) {
        messageModal.warning('You cannot deactivate your own account', 'Action Denied');
        return;
    }

    messageModal.confirm(
        'Confirm Deactivation',
        `Are you sure you want to deactivate user "<strong>${username}</strong>"?`,
        async () => {
            loadingScreen.show('Deactivating user...');
            try {
                // Calling delete API which performs soft-delete (sets status to inactive)
                const response = await api.users.delete(id);
                if (response.success) {
                    messageModal.success('User deactivated successfully!', 'User Deactivated');
                    await loadUsers();
                }
            } catch (error) {
                messageModal.error('Failed to deactivate user: ' + error.message, 'Error');
            } finally {
                await loadingScreen.hide();
            }
        }
    );
};

window.activateUser = function (id, username) {
    messageModal.confirm(
        'Confirm Activation',
        `Are you sure you want to activate user "<strong>${username}</strong>"?`,
        async () => {
            loadingScreen.show('Activating user...');
            try {
                const response = await api.users.update(id, { status: 'active' });
                if (response.success) {
                    messageModal.success('User activated successfully!', 'User Activated');
                    await loadUsers();
                }
            } catch (error) {
                messageModal.error('Failed to activate user: ' + error.message, 'Error');
            } finally {
                await loadingScreen.hide();
            }
        }
    );
};

// ==================== VOID PASSWORD FUNCTIONS ====================

async function loadVoidPassword() {
    try {
        const response = await fetch('/api/void/password', {
            credentials: 'include'
        });
        const data = await response.json();

        if (data.success) {
            currentVoidPasswordValue = data.password;
            document.getElementById('currentVoidPassword').value = '••••••••';
        }
    } catch (error) {
        console.error('Error loading void password:', error);
    }
}

function toggleVoidPasswordVisibility() {
    const input = document.getElementById('currentVoidPassword');
    const btn = document.getElementById('toggleVoidPasswordBtn');
    const icon = btn.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        input.value = currentVoidPasswordValue;
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        input.value = '••••••••';
        icon.className = 'fas fa-eye';
    }
}

function openVoidPasswordModal() {
    document.getElementById('voidPasswordForm').reset();
    document.getElementById('voidPasswordModal').style.display = 'block';
}

function closeVoidPasswordModal() {
    document.getElementById('voidPasswordModal').style.display = 'none';
    document.getElementById('voidPasswordForm').reset();
}

async function handleVoidPasswordSubmit(e) {
    e.preventDefault();

    const newPassword = document.getElementById('newVoidPassword').value;
    const confirmPassword = document.getElementById('confirmVoidPassword').value;

    if (newPassword !== confirmPassword) {
        messageModal.warning('Passwords do not match.', 'Validation Error');
        return;
    }

    if (newPassword.length < 4) {
        messageModal.warning('Password must be at least 4 characters long.', 'Validation Error');
        return;
    }

    loadingScreen.show('Updating void password...');

    try {
        const response = await fetch('/api/void/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ newPassword })
        });

        const data = await response.json();

        if (data.success) {
            closeVoidPasswordModal();
            messageModal.success('Void password updated successfully!', 'Password Updated');
            await loadVoidPassword();
        } else {
            messageModal.error(data.message || 'Failed to update password', 'Error');
        }
    } catch (error) {
        messageModal.error('Failed to update password: ' + error.message, 'Error');
    } finally {
        await loadingScreen.hide();
    }
}

async function loadRolesForDropdown() {
    try {
        const response = await fetch('/api/roles', { credentials: 'include' });
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('role');
            if (select) {
                // Clear existing (except the placeholder)
                select.innerHTML = '<option value="">Select role...</option>';
                // Populate from DB
                data.data.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role.name;
                    option.textContent = role.name;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Failed to load roles for dropdown', error);
    }
}
