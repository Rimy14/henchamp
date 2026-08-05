/**
 * Lazy Loading Utilities
 * Provides utilities for lazy loading images, modules, and components
 */

class LazyLoader {
    constructor() {
        this.imageObserver = null;
        this.loadedModules = new Map();
        this.initImageLazyLoading();
    }

    /**
     * Initialize Intersection Observer for lazy loading images
     */
    initImageLazyLoading() {
        // Check if IntersectionObserver is supported
        if (!('IntersectionObserver' in window)) {
            console.warn('IntersectionObserver not supported, loading all images immediately');
            this.loadAllImages();
            return;
        }

        const options = {
            root: null,
            rootMargin: '50px', // Start loading 50px before entering viewport
            threshold: 0.01
        };

        this.imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    this.loadImage(img);
                    observer.unobserve(img);
                }
            });
        }, options);

        // Observe all images with data-src attribute
        this.observeImages();
    }

    /**
     * Observe all lazy images on the page
     */
    observeImages() {
        const lazyImages = document.querySelectorAll('img[data-src]');
        lazyImages.forEach(img => {
            if (this.imageObserver) {
                this.imageObserver.observe(img);
            }
        });
    }

    /**
     * Load a single image
     */
    loadImage(img) {
        const src = img.getAttribute('data-src');
        if (!src) return;

        // Show loading state
        img.classList.add('loading');

        // Load image
        img.src = src;

        img.onload = () => {
            img.classList.remove('loading');
            img.classList.add('loaded');
            img.removeAttribute('data-src');
        };

        img.onerror = () => {
            img.classList.remove('loading');
            img.classList.add('error');
            console.error(`Failed to load image: ${src}`);
        };
    }

    /**
     * Fallback: Load all images immediately (for unsupported browsers)
     */
    loadAllImages() {
        const lazyImages = document.querySelectorAll('img[data-src]');
        lazyImages.forEach(img => this.loadImage(img));
    }

    /**
     * Dynamically import a JavaScript module
     * @param {string} modulePath - Path to the module
     * @returns {Promise<any>} - The imported module
     */
    async loadModule(modulePath) {
        // Check if already loaded
        if (this.loadedModules.has(modulePath)) {
            return this.loadedModules.get(modulePath);
        }

        try {
            const module = await import(modulePath);
            this.loadedModules.set(modulePath, module);
            return module;
        } catch (error) {
            console.error(`Failed to load module: ${modulePath}`, error);
            throw error;
        }
    }

    /**
     * Load a component dynamically
     * @param {string} componentPath - Path to component HTML
     * @param {HTMLElement} container - Container to inject component
     */
    async loadComponent(componentPath, container) {
        try {
            const response = await fetch(componentPath);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            container.innerHTML = html;

            // Observe any new lazy images in the component
            this.observeImages();
        } catch (error) {
            console.error(`Failed to load component: ${componentPath}`, error);
            throw error;
        }
    }

    /**
     * Lazy load scripts
     * @param {string} src - Script source URL
     * @param {boolean} isModule - Whether script is a module
     * @returns {Promise<void>}
     */
    loadScript(src, isModule = false) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            if (isModule) script.type = 'module';
            script.async = true;

            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

            document.head.appendChild(script);
        });
    }

    /**
     * Defer heavy operations until page is idle
     * @param {Function} callback - Function to execute when idle
     * @param {number} timeout - Fallback timeout in ms
     */
    whenIdle(callback, timeout = 2000) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(callback, { timeout });
        } else {
            // Fallback for browsers that don't support requestIdleCallback
            setTimeout(callback, timeout);
        }
    }
}

/**
 * Table Pagination Manager
 * Handles pagination for large data tables
 */
class TablePagination {
    constructor(options = {}) {
        this.currentPage = options.currentPage || 1;
        this.pageSize = options.pageSize || 5;
        this.totalItems = options.totalItems || 0;
        this.onChange = options.onChange || (() => { });
    }

    /**
     * Get current page info
     */
    getPageInfo() {
        const totalPages = Math.ceil(this.totalItems / this.pageSize);
        return {
            currentPage: this.currentPage,
            pageSize: this.pageSize,
            totalItems: this.totalItems,
            totalPages,
            startItem: (this.currentPage - 1) * this.pageSize + 1,
            endItem: Math.min(this.currentPage * this.pageSize, this.totalItems)
        };
    }

    /**
     * Go to specific page
     */
    goToPage(page) {
        const totalPages = Math.ceil(this.totalItems / this.pageSize);
        if (page < 1 || page > totalPages) return;

        this.currentPage = page;
        this.onChange(this.getPageInfo());
    }

    /**
     * Go to next page
     */
    nextPage() {
        this.goToPage(this.currentPage + 1);
    }

    /**
     * Go to previous page
     */
    previousPage() {
        this.goToPage(this.currentPage - 1);
    }

    /**
     * Render pagination controls
     */
    render(container) {
        const info = this.getPageInfo();

        container.innerHTML = `
            <div class="pagination-controls">
                <div class="pagination-info">
                    Showing ${info.startItem}-${info.endItem} of ${info.totalItems} items
                </div>
                <div class="pagination-buttons">
                    <button 
                        class="btn btn-sm btn-secondary" 
                        ${info.currentPage === 1 ? 'disabled' : ''}
                        onclick="window.tablePagination.previousPage()">
                        <i class="fas fa-chevron-left"></i> Previous
                    </button>
                    <span class="pagination-ellipsis">
                        Page ${info.currentPage} of ${info.totalPages}
                    </span>
                    <button 
                        class="btn btn-sm btn-secondary" 
                        ${info.currentPage === info.totalPages ? 'disabled' : ''}
                        onclick="window.tablePagination.nextPage()">
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Update total items count
     */
    setTotalItems(total) {
        this.totalItems = total;
    }
}

// Create and export singleton instance
const lazyLoader = new LazyLoader();

// Make available globally for easy access
window.lazyLoader = lazyLoader;
window.TablePagination = TablePagination;

export default lazyLoader;
export { TablePagination };
