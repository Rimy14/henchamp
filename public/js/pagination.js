/**
 * Pagination Utility Component
 * Provides reusable pagination functionality for tables
 */

class Pagination {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.currentPage = 1;
        this.totalPages = 1;
        this.totalItems = 0;
        this.itemsPerPage = options.itemsPerPage || 10;
        this.onPageChange = options.onPageChange || (() => { });
        this.maxVisiblePages = options.maxVisiblePages || 5;
    }

    /**
     * Update pagination state
     */
    update(pagination) {
        this.currentPage = pagination.page || 1;
        this.totalPages = pagination.totalPages || 1;
        this.totalItems = pagination.total || pagination.totalItems || 0;
        this.itemsPerPage = pagination.limit || this.itemsPerPage;
        this.render();
    }

    /**
     * Render pagination UI
     */
    render() {
        if (!this.container) return;

        // Always show at least the info bar
        if (this.totalPages <= 1) {
            this.container.innerHTML = `
                <div class="pagination-container">
                    ${this.renderInfo()}
                </div>
            `;
            return;
        }

        const html = `
            <div class="pagination-container">
                ${this.renderInfo()}
                <div class="pagination-controls">
                    ${this.renderButtons()}
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEventListeners();
    }


    /**
     * Render pagination info
     */
    renderInfo() {
        const start = (this.currentPage - 1) * this.itemsPerPage + 1;
        const end = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);

        return `
            <div class="pagination-info">
                Showing ${start} to ${end} of ${this.totalItems} entries
            </div>
        `;
    }

    /**
     * Render pagination buttons
     */
    renderButtons() {
        let buttons = '';

        // First button
        buttons += this.renderButton('first', '«', 1, this.currentPage === 1);

        // Previous button
        buttons += this.renderButton('prev', '‹', this.currentPage - 1, this.currentPage === 1);

        // Page numbers
        buttons += this.renderPageNumbers();

        // Next button
        buttons += this.renderButton('next', '›', this.currentPage + 1, this.currentPage === this.totalPages);

        // Last button
        buttons += this.renderButton('last', '»', this.totalPages, this.currentPage === this.totalPages);

        return buttons;
    }

    /**
     * Render page number buttons
     */
    renderPageNumbers() {
        let buttons = '';
        const range = this.getPageRange();

        // Add first page and ellipsis if needed
        if (range[0] > 1) {
            buttons += this.renderButton('page', '1', 1, false);
            if (range[0] > 2) {
                buttons += '<span class="pagination-ellipsis">...</span>';
            }
        }

        // Add page numbers in range
        range.forEach(page => {
            buttons += this.renderButton(
                'page',
                page.toString(),
                page,
                false,
                page === this.currentPage
            );
        });

        // Add last page and ellipsis if needed
        if (range[range.length - 1] < this.totalPages) {
            if (range[range.length - 1] < this.totalPages - 1) {
                buttons += '<span class="pagination-ellipsis">...</span>';
            }
            buttons += this.renderButton('page', this.totalPages.toString(), this.totalPages, false);
        }

        return buttons;
    }

    /**
     * Get range of page numbers to display
     */
    getPageRange() {
        const halfVisible = Math.floor(this.maxVisiblePages / 2);
        let start = Math.max(1, this.currentPage - halfVisible);
        let end = Math.min(this.totalPages, start + this.maxVisiblePages - 1);

        // Adjust start if we're near the end
        if (end - start + 1 < this.maxVisiblePages) {
            start = Math.max(1, end - this.maxVisiblePages + 1);
        }

        const range = [];
        for (let i = start; i <= end; i++) {
            range.push(i);
        }

        return range;
    }

    /**
     * Render a single button
     */
    renderButton(type, text, page, disabled, active = false) {
        const disabledClass = disabled ? 'disabled' : '';
        const activeClass = active ? 'active' : '';
        const dataPage = !disabled ? `data-page="${page}"` : '';

        return `
            <button 
                class="pagination-btn ${disabledClass} ${activeClass}" 
                ${dataPage}
                ${disabled ? 'disabled' : ''}
            >
                ${text}
            </button>
        `;
    }

    /**
     * Attach event listeners to buttons
     */
    attachEventListeners() {
        const buttons = this.container.querySelectorAll('.pagination-btn[data-page]');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                if (page !== this.currentPage) {
                    this.goToPage(page);
                }
            });
        });
    }

    /**
     * Navigate to a specific page
     */
    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.currentPage) {
            return;
        }

        this.currentPage = page;
        this.onPageChange(page);
    }

    /**
     * Get current pagination state
     */
    getState() {
        return {
            page: this.currentPage,
            limit: this.itemsPerPage,
            offset: (this.currentPage - 1) * this.itemsPerPage
        };
    }

    /**
     * Reset to first page
     */
    reset() {
        this.currentPage = 1;
    }
}

export default Pagination;
