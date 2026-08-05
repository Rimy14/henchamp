/**
 * API Client for making HTTP requests to the backend
 */

const API_BASE_URL = '/api';

class APIClient {
    constructor() {
        this.baseURL = API_BASE_URL;
    }

    /**
     * Make HTTP request with timeout
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const timeout = options.timeout || 30000; // 30 second default timeout

        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'include', // Include cookies for auth
            ...options
        };

        // Add body if present
        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        // Show loading screen if requested
        const showLoading = options.showLoading;
        const loadingMessage = options.loadingMessage || 'Loading...';

        if (showLoading && window.loadingScreen) {
            window.loadingScreen.show(loadingMessage);
        }

        try {
            // Create AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            config.signal = controller.signal;

            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            const data = await response.json();

            if (!response.ok) {
                // Handle 401 Unauthorized (token expired/invalid)
                if (response.status === 401) {
                    console.warn('Unauthorized: Token expired or invalid');

                    // Don't redirect if we're already on the login page to avoid infinite loop
                    const isLoginPage = window.location.pathname === '/' || window.location.pathname === '/index.html';
                    if (!isLoginPage) {
                        // Clear any stored user data
                        sessionStorage.clear();
                        // Redirect to login page
                        window.location.href = '/?expired=true';
                    }

                    const error = new Error(data.message || 'Session expired. Please login again.');
                    error.status = response.status;
                    throw error;
                }

                const error = new Error(data.message || 'Request failed');
                error.status = response.status;
                throw error;
            }

            return data;
        } catch (error) {
            // Handle timeout/abort errors
            if (error.name === 'AbortError') {
                console.error('Request timeout:', url);
                const message = 'The server is taking too long to respond. Please check your connection.';
                if (window.loadingScreen) window.loadingScreen.showError('Request Timeout', message);
                throw new Error(message);
            }

            // Handle network/connection errors (Fetch failed)
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                console.error('Network error:', url);
                if (window.loadingScreen) {
                    const title = navigator.onLine ? 'Server Down' : 'No Internet';
                    const message = navigator.onLine
                        ? 'The system cannot reach the server. It might be undergoing maintenance or the server is down.'
                        : 'You are currently offline. Please check your internet connection.';
                    window.loadingScreen.showError(title, message);
                }
                throw new Error('Connection failed - check your internet');
            }

            // Don't log expected 401 errors on login page
            const isLoginPage = window.location.pathname === '/' || window.location.pathname === '/index.html';
            const is401Error = error.message && error.message.includes('Session expired');

            if (!isLoginPage || !is401Error) {
                console.error('API Error:', error);
            }
            throw error;
        } finally {
            // Hide loading screen if it was shown
            if (showLoading && window.loadingScreen) {
                await window.loadingScreen.hide();
            }
        }
    }

    // GET request
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    // POST request
    async post(endpoint, body) {
        return this.request(endpoint, { method: 'POST', body });
    }

    // PUT request
    async put(endpoint, body) {
        return this.request(endpoint, { method: 'PUT', body });
    }

    // PATCH request
    async patch(endpoint, body) {
        return this.request(endpoint, { method: 'PATCH', body });
    }

    // DELETE request
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // FormData POST request
    async postFormData(endpoint, formData) {
        const url = `${this.baseURL}${endpoint}`;
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Upload failed');
        }
        return data;
    }


    // Authentication endpoints
    auth = {
        login: (credentials) => this.post('/auth/login', credentials),
        logout: () => this.post('/auth/logout'),
        getMe: () => this.get('/auth/me'),
        changePassword: (passwordData) => this.post('/auth/change-password', passwordData)
    };

    // User endpoints
    users = {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/users${query ? `?${query}` : ''}`);
        },
        getById: (id) => this.get(`/users/${id}`),
        create: (userData) => this.post('/users', userData),
        update: (id, userData) => this.put(`/users/${id}`, userData),
        delete: (id) => this.delete(`/users/${id}`)
    };

    // Category endpoints
    categories = {
        getAll: () => this.get('/categories'),
        getById: (id) => this.get(`/categories/${id}`),
        getBase: () => this.get('/categories/base'),
        create: (categoryData) => this.post('/categories', categoryData),
        update: (id, categoryData) => this.put(`/categories/${id}`, categoryData),
        delete: (id) => this.delete(`/categories/${id}`)
    };


    // Supplier endpoints
    suppliers = {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/suppliers${query ? `?${query}` : ''}`);
        },
        create: (supplierData) => this.post('/suppliers', supplierData),
        update: (id, supplierData) => this.put(`/suppliers/${id}`, supplierData),
        delete: (id) => this.delete(`/suppliers/${id}`)
    };

    // Unit of Measure endpoints
    uom = {
        getAll: () => this.get('/uom'),
        create: (uomData) => this.post('/uom', uomData),
        update: (id, uomData) => this.put(`/uom/${id}`, uomData),
        delete: (id) => this.delete(`/uom/${id}`)
    };

    // Customer endpoints
    customers = {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/customers${query ? `?${query}` : ''}`);
        },
        create: (customerData) => this.post('/customers', customerData),
        update: (id, customerData) => this.put(`/customers/${id}`, customerData),
        delete: (id) => this.delete(`/customers/${id}`),
        getHistory: (id) => this.get(`/customers/${id}/history`)
    };

    // Item endpoints
    items = {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/items${query ? `?${query}` : ''}`);
        },
        getByBarcode: (barcode) => this.get(`/items/by-barcode/${barcode}`),
        create: (itemData) => this.post('/items', itemData),
        update: (id, itemData) => this.put(`/items/${id}`, itemData)
    };

    // Purchase Order endpoints
    purchaseOrders = {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/purchase-orders${query ? `?${query}` : ''}`);
        },
        getById: (id) => this.get(`/purchase-orders/${id}`),
        create: (poData) => this.post('/purchase-orders', poData),
        updateStatus: (id, status) => this.request(`/purchase-orders/${id}/status`, {
            method: 'PATCH',
            body: { status }
        }),
        getPayments: (id) => this.get(`/purchase-orders/${id}/payments`),
        addPayment: (id, paymentData) => this.post(`/purchase-orders/${id}/payments`, paymentData)
    };

    // GRN (Goods Receipt Note) endpoints
    grn = {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/grn${query ? `?${query}` : ''}`);
        },
        getById: (id) => this.get(`/grn/${id}`),
        create: (grnData) => this.post('/grn', grnData),
        approve: (id) => this.request(`/grn/${id}/approve`, { method: 'PATCH' }),
        reject: (id, reason) => this.request(`/grn/${id}/reject`, {
            method: 'PATCH',
            body: { reason }
        }),
        delete: (id) => this.delete(`/grn/${id}`)
    };

    // BOM (Bill of Materials) endpoints
    bom = {
        getAll: () => this.get('/bom'),
        getById: (id) => this.get(`/bom/${id}`),
        getByFinishedGood: (itemId) => this.get(`/bom/finished-good/${itemId}`),
        getFinishedGoods: () => this.get('/bom/finished-goods'),
        getRawMaterials: () => this.get('/bom/raw-materials'),
        create: (bomData) => this.post('/bom', bomData),
        update: (id, bomData) => this.put(`/bom/${id}`, bomData),
        delete: (id) => this.delete(`/bom/${id}`)
    };

    // Production endpoints
    production = {
        getAll: () => this.get('/production'),
        getById: (id) => this.get(`/production/${id}`),
        create: (productionData) => this.post('/production', productionData),
        updateStatus: (id, status) => this.put(`/production/${id}/status`, { status })
    };

    // Inventory Batch endpoints
    batches = {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/batches${query ? `?${query}` : ''}`);
        },
        getByItem: (itemId) => this.get(`/batches/item/${itemId}`),
        getById: (id) => this.get(`/batches/${id}`),
        getItemSummary: (itemId) => this.get(`/batches/item/${itemId}/summary`)
    };

    // Sales endpoints
    sales = {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/sales${query ? `?${query}` : ''}`);
        },
        getById: (id) => this.get(`/sales/${id}`),
        create: (saleData) => this.post('/sales', saleData),
        cancel: (id, reason) => this.put(`/sales/${id}/cancel`, { reason })
    };

    // Report endpoints
    reports = {
        dashboard: () => this.get('/reports/dashboard'),
        sales: (params) => {
            const query = new URLSearchParams(params).toString();
            return this.get(`/reports/sales?${query}`);
        },
        inventory: () => this.get('/reports/inventory')
    };

    // Notification endpoints
    notifications = {
        get: () => this.get('/notifications')
    };
}

// Create and export singleton instance
const api = new APIClient();
export default api;
