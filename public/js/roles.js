import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import messageModal from './message-modal.js';

let currentRoles = [];

export default async function init() {
    await loadRoles();
}

export async function initRoles() {
    await loadRoles();
}

async function loadRoles() {
    loadingScreen.show('Loading roles...');
    try {
        const response = await fetch('/api/roles', { credentials: 'include' });
        const data = await response.json();
        
        if (data.success) {
            currentRoles = data.data;
            updateKPIs();
            renderRoles();
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Error loading roles:', error);
        toast.error('Failed to load roles: ' + error.message);
    } finally {
        await loadingScreen.hide();
    }
}

function updateKPIs() {
    const totalEl = document.getElementById('totalRolesCount');
    const systemEl = document.getElementById('systemRolesCount');
    const customEl = document.getElementById('customRolesCount');

    if (totalEl) totalEl.textContent = currentRoles.length;
    if (systemEl) systemEl.textContent = currentRoles.filter(r => r.is_system).length;
    if (customEl) customEl.textContent = currentRoles.filter(r => !r.is_system).length;
}

function renderRoles() {
    const tbody = document.getElementById('rolesTableBody');
    if (!tbody) return;

    if (currentRoles.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 2.5rem; text-align: center; color: #64748b;">
                    <i class="fas fa-folder-open" style="font-size: 2rem; color: #cbd5e1; margin-bottom: 0.5rem; display: block;"></i>
                    No roles found
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = currentRoles.map(role => {
        const isSystem = !!role.is_system;
        const permCount = role.permissions ? role.permissions.length : 0;
        const permTooltip = role.permissions ? role.permissions.join(', ') : 'None';

        return `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding: 1rem 1.25rem; font-weight: 600; color: #64748b; font-size: 0.85rem;">#${role.id}</td>
                <td style="padding: 1rem 1.25rem;">
                    <span style="font-weight: 700; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas ${isSystem ? 'fa-shield-alt' : 'fa-user-tag'}" style="color: ${isSystem ? '#0e4a35' : '#16a34a'}; font-size: 0.85rem;"></i>
                        ${role.name}
                    </span>
                </td>
                <td style="padding: 1rem 1.25rem; color: #475569; font-size: 0.85rem;">
                    ${role.description || '<span style="color: #cbd5e1; font-style: italic;">No description provided</span>'}
                </td>
                <td style="padding: 1rem 1.25rem;">
                    <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.75rem; border-radius: 20px; background: #eef2ff; color: #0e4a35; font-size: 0.775rem; font-weight: 700; border: 1px solid rgba(14, 74, 53, 0.15);" title="${permTooltip}">
                        <i class="fas fa-key" style="font-size: 0.7rem;"></i> ${permCount} permissions
                    </span>
                </td>
                <td style="padding: 1rem 1.25rem;">
                    ${isSystem 
                        ? '<span style="display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.65rem; border-radius: 6px; background: #e0e7ff; color: #0a3d2c; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-lock"></i> System</span>' 
                        : '<span style="display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.65rem; border-radius: 6px; background: #f1f5f9; color: #475569; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-user-edit"></i> Custom</span>'}
                </td>
                <td style="padding: 1rem 1.25rem; text-align: right;">
                    <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                        <button class="btn btn-sm" onclick="editRole(${role.id})" title="Edit Permissions & Details" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; border-radius: 7px; padding: 0.4rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                            <i class="fas fa-edit" style="color: #0e4a35;"></i> Edit
                        </button>
                        ${!isSystem ? `
                        <button class="btn btn-sm" onclick="deleteRole(${role.id})" title="Delete Role" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 7px; padding: 0.4rem 0.75rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                            <i class="fas fa-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.openRoleModal = () => {
    document.getElementById('roleModalTitle').textContent = 'Create New Role';
    document.getElementById('roleForm').reset();
    document.getElementById('roleId').value = '';
    
    // Enable name field for new roles
    const nameInput = document.getElementById('roleName');
    nameInput.disabled = false;
    
    const checkboxes = document.querySelectorAll('input[name="permissions"]');
    checkboxes.forEach(cb => cb.checked = false);

    document.getElementById('roleModal').style.display = 'flex';
};

window.closeRoleModal = () => {
    document.getElementById('roleModal').style.display = 'none';
    document.getElementById('roleForm').reset();
};

window.editRole = (id) => {
    const role = currentRoles.find(r => r.id == id);
    if (!role) {
        console.error('Role not found for ID:', id);
        return;
    }

    document.getElementById('roleModalTitle').textContent = `Edit ${role.name}`;
    document.getElementById('roleId').value = role.id;
    
    const nameInput = document.getElementById('roleName');
    nameInput.value = role.name;
    document.getElementById('roleDescription').value = role.description || '';
    
    // If it's a system role, don't allow changing the name
    nameInput.disabled = !!role.is_system;

    // Check permissions
    const checkboxes = document.querySelectorAll('input[name="permissions"]');
    checkboxes.forEach(cb => {
        cb.checked = role.permissions ? role.permissions.includes(cb.value) : false;
    });

    document.getElementById('roleModal').style.display = 'flex';
};

window.handleRoleSubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('saveRoleBtn');
    
    const id = document.getElementById('roleId').value;
    const existingRole = id ? currentRoles.find(r => r.id == id) : null;
    const roleName = document.getElementById('roleName').value || (existingRole ? existingRole.name : '');

    if (!roleName) {
        messageModal.warning('Role name is required.', 'Validation Error');
        return;
    }

    // Gather checked permissions
    const permissionCheckboxes = document.querySelectorAll('input[name="permissions"]:checked');
    const permissions = Array.from(permissionCheckboxes).map(cb => cb.value);

    const payload = {
        name: roleName,
        description: document.getElementById('roleDescription').value,
        permissions: permissions
    };

    if (submitBtn) submitBtn.disabled = true;

    try {
        let response;
        if (id) {
            response = await fetch(`/api/roles/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });
        } else {
            response = await fetch('/api/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });
        }

        const data = await response.json();
        
        if (data.success) {
            closeRoleModal();
            messageModal.success(
                id ? `Role "${roleName}" updated successfully!` : `Role "${roleName}" created successfully!`,
                id ? 'Role Updated' : 'Role Created'
            );
            await loadRoles();
        } else {
            throw new Error(data.message || 'Failed to save role');
        }
    } catch (error) {
        messageModal.error(error.message || 'An error occurred while saving the role', 'Role Save Error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
};

window.deleteRole = async (id) => {
    const role = currentRoles.find(r => r.id == id);
    if (!role) return;

    messageModal.confirm(
        'Confirm Role Deletion',
        `Are you sure you want to delete the role "<strong>${role.name}</strong>"?<br><small style="color: #64748b;">This action cannot be undone.</small>`,
        async () => {
            loadingScreen.show('Deleting role...');
            try {
                const response = await fetch(`/api/roles/${id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                const data = await response.json();
                
                if (data.success) {
                    messageModal.success(`Role "${role.name}" deleted successfully`, 'Role Deleted');
                    await loadRoles();
                } else {
                    throw new Error(data.message || 'Failed to delete role');
                }
            } catch (error) {
                messageModal.error(error.message || 'Failed to delete role', 'Deletion Error');
            } finally {
                await loadingScreen.hide();
            }
        }
    );
};

window.toggleAllPermissions = (checkAll) => {
    const checkboxes = document.querySelectorAll('input[name="permissions"]');
    checkboxes.forEach(cb => cb.checked = !!checkAll);
};

window.toggleGroupPermissions = (headerCheckbox, groupClass) => {
    const checkboxes = document.querySelectorAll(`.perm-${groupClass}`);
    checkboxes.forEach(cb => cb.checked = headerCheckbox.checked);
};
