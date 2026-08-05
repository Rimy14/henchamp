/**
 * Searchable Dropdown Component
 * Converts a regular select element into a searchable dropdown with filter capability
 */

class SearchableDropdown {
    constructor(selectElement, options = {}) {
        this.select = selectElement;
        this.options = options;
        this.asyncSource = options.asyncSource || null;
        this.minLength = options.minLength || 0;
        this.debounceTime = options.debounceTime || 300;
        this.debounceTimer = null;
        this.loading = false;

        this.wrapper = null;
        this.searchInput = null;
        this.dropdownList = null;
        this.isOpen = false;
        this.filteredOptions = [];
        this.selectedIndex = -1;

        this.init();
    }

    init() {
        // Create wrapper structure
        this.createWrapper();

        // Bind events
        this.bindEvents();
    }

    createWrapper() {
        // Hide original select
        this.select.style.display = 'none';

        // Create wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'searchable-dropdown';
        this.wrapper.style.position = 'relative';
        this.wrapper.style.width = '100%';

        // Create display button
        const displayBtn = document.createElement('button');
        displayBtn.type = 'button';
        displayBtn.className = 'form-control searchable-dropdown-btn';
        displayBtn.style.cssText = `
            text-align: left;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: white;
            transition: all 0.2s ease;
            font-weight: 400;
            color: var(--gray-700);
            padding: 0.75rem 1rem;
            font-size: 1rem;
            border: 1px solid var(--gray-400);
            border-radius: var(--radius-md);
        `;

        const dropdownIcon = document.createElement('span');
        dropdownIcon.style.cssText = `
            margin-left: 8px;
            color: var(--gray-500);
            transition: transform 0.2s ease;
            font-size: 0.75rem;
        `;
        dropdownIcon.textContent = '▼';

        const displayText = document.createElement('span');
        displayText.className = 'searchable-dropdown-text';
        displayText.style.cssText = `
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
        displayText.textContent = this.select.options[this.select.selectedIndex]?.text || 'Select item...';

        displayBtn.appendChild(displayText);
        displayBtn.appendChild(dropdownIcon);

        this.displayBtn = displayBtn;
        this.dropdownIcon = dropdownIcon;

        // Add hover effect
        displayBtn.addEventListener('mouseenter', () => {
            displayBtn.style.borderColor = 'var(--primary-400)';
            displayBtn.style.boxShadow = '0 0 0 3px rgba(132, 204, 22, 0.1)';
        });
        displayBtn.addEventListener('mouseleave', () => {
            if (!this.isOpen) {
                displayBtn.style.borderColor = '';
                displayBtn.style.boxShadow = '';
            }
        });

        // Add active/pressed effect
        displayBtn.addEventListener('mousedown', () => {
            displayBtn.style.transform = 'scale(0.98)';
        });
        displayBtn.addEventListener('mouseup', () => {
            displayBtn.style.transform = '';
        });

        // Create dropdown container
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'searchable-dropdown-container';
        dropdownContainer.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid var(--gray-300);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            max-height: 300px;
            display: none;
            z-index: var(--z-dropdown);
            margin-top: 4px;
        `;

        // Create search input
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.className = 'form-control searchable-dropdown-search';
        this.searchInput.placeholder = '🔍 Search items...';
        this.searchInput.style.cssText = `
            margin: 12px;
            width: calc(100% - 24px);
            border: 1px solid var(--gray-300);
            border-radius: var(--radius-md);
            padding: 0.625rem 1rem;
            font-size: var(--text-sm);
            background: var(--gray-50);
            transition: all 0.2s ease;
        `;

        // Create options list
        this.dropdownList = document.createElement('div');
        this.dropdownList.className = 'searchable-dropdown-list';
        this.dropdownList.style.cssText = `
            max-height: 250px;
            overflow-y: auto;
        `;

        dropdownContainer.appendChild(this.searchInput);
        dropdownContainer.appendChild(this.dropdownList);

        this.wrapper.appendChild(displayBtn);
        this.wrapper.appendChild(dropdownContainer);

        // Insert wrapper after select
        this.select.parentNode.insertBefore(this.wrapper, this.select.nextSibling);

        this.dropdownContainer = dropdownContainer;
    }

    bindEvents() {
        // Toggle dropdown
        this.displayBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        // Search input
        this.searchInput.addEventListener('input', (e) => {
            this.filterOptions(e.target.value);
        });

        // Keyboard navigation
        this.searchInput.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.close();
            }
        });

        // Search input focus effects
        this.searchInput.addEventListener('focus', () => {
            this.searchInput.style.borderColor = 'var(--primary-500)';
            this.searchInput.style.boxShadow = '0 0 0 3px rgba(132, 204, 22, 0.1)';
            this.searchInput.style.background = 'white';
        });

        this.searchInput.addEventListener('blur', () => {
            this.searchInput.style.borderColor = '';
            this.searchInput.style.boxShadow = '';
            this.searchInput.style.background = '';
        });
    }

    handleKeydown(e) {
        const options = Array.from(this.dropdownList.children);
        if (options.length === 0) return;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex > 0) ? this.selectedIndex - 1 : options.length - 1;
            this.highlightOption(options);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex < options.length - 1) ? this.selectedIndex + 1 : 0;
            this.highlightOption(options);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.selectedIndex !== -1) {
                options[this.selectedIndex].click();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        }
    }

    highlightOption(options) {
        options.forEach((option, index) => {
            if (index === this.selectedIndex) {
                option.classList.add('selected');
                option.style.backgroundColor = 'var(--primary-100)';
                option.style.color = 'var(--primary-800)';
                option.style.paddingLeft = '1.25rem';
                option.scrollIntoView({ block: 'nearest' });
            } else {
                option.classList.remove('selected');
                option.style.backgroundColor = '';
                option.style.color = '';
                option.style.paddingLeft = '';
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.dropdownContainer.style.display = 'block';
        this.isOpen = true;
        this.searchInput.value = '';
        this.searchInput.focus();
        this.filterOptions('');

        // Rotate icon and keep button highlighted
        if (this.dropdownIcon) {
            this.dropdownIcon.style.transform = 'rotate(180deg)';
        }
        this.displayBtn.style.borderColor = 'var(--primary-500)';
        this.displayBtn.style.boxShadow = '0 0 0 3px rgba(132, 204, 22, 0.1)';
    }

    close() {
        this.dropdownContainer.style.display = 'none';
        this.isOpen = false;
        this.selectedIndex = -1;

        // Reset icon and button state
        if (this.dropdownIcon) {
            this.dropdownIcon.style.transform = '';
        }
        this.displayBtn.style.borderColor = '';
        this.displayBtn.style.boxShadow = '';
    }

    filterOptions(searchTerm) {
        const term = searchTerm.toLowerCase();

        if (this.asyncSource) {
            this.handleAsyncFilter(term);
        } else {
            this.handleLocalFilter(term);
        }
    }

    handleLocalFilter(term) {
        this.filteredOptions = [];
        this.dropdownList.innerHTML = '';

        // Get all options except the first placeholder
        const options = Array.from(this.select.options).slice(1);

        options.forEach((option, index) => {
            const text = option.text.toLowerCase();
            const value = option.value;

            if (text.includes(term)) {
                this.renderOption(option, index + 1);
            }
        });

        if (this.filteredOptions.length === 0) {
            this.renderNoResults();
        }

        this.selectedIndex = -1;
    }

    async handleAsyncFilter(term) {
        if (term.length < this.minLength && term.length > 0) {
            return;
        }

        clearTimeout(this.debounceTimer);

        this.dropdownList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--gray-500); font-size: var(--text-sm);"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

        this.debounceTimer = setTimeout(async () => {
            try {
                this.loading = true;
                const results = await this.asyncSource(term);
                this.loading = false;

                this.filteredOptions = [];
                this.dropdownList.innerHTML = '';

                if (!results || results.length === 0) {
                    this.renderNoResults();
                    return;
                }

                results.forEach((item, index) => {
                    // Normalize item format if needed (expecting text and value)
                    const option = {
                        text: item.text || item.name || item.label,
                        value: item.value || item.id
                    };

                    this.renderOption(option, index);
                });

                this.selectedIndex = -1;
            } catch (error) {
                console.error('Async search error:', error);
                this.dropdownList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--danger); font-size: var(--text-sm);">Error searching. Try again.</div>';
                this.loading = false;
            }
        }, this.debounceTime);
    }

    renderOption(option, originalIndex) {
        this.filteredOptions.push({ option, originalIndex });

        const optionDiv = document.createElement('div');
        optionDiv.className = 'searchable-dropdown-option';
        optionDiv.textContent = option.text;
        optionDiv.dataset.value = option.value;
        optionDiv.style.cssText = `
            padding: 0.75rem 1rem;
            cursor: pointer;
            transition: all 0.15s ease;
            font-size: var(--text-sm);
            color: var(--gray-700);
            border-bottom: 1px solid var(--gray-100);
        `;

        optionDiv.addEventListener('mouseenter', () => {
            optionDiv.style.backgroundColor = 'var(--primary-50)';
            optionDiv.style.color = 'var(--primary-700)';
            optionDiv.style.paddingLeft = '1.25rem';
        });

        optionDiv.addEventListener('mouseleave', () => {
            if (!optionDiv.classList.contains('selected')) {
                optionDiv.style.backgroundColor = '';
                optionDiv.style.color = '';
                optionDiv.style.paddingLeft = '';
            }
        });

        optionDiv.addEventListener('click', () => {
            this.selectOption(option.value, option.text);
        });

        this.dropdownList.appendChild(optionDiv);
    }

    renderNoResults() {
        this.dropdownList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--gray-500); font-size: var(--text-sm);">No items found</div>';
    }

    selectOption(value, text) {
        let selectedOptionData = null;

        // If async, find the full item data from filteredOptions
        if (this.asyncSource) {
            const found = this.filteredOptions.find(opt => String(opt.option.value) === String(value));
            if (found) {
                selectedOptionData = found.option;
            }

            // Ensure the option exists in the native select, adding if necessary
            let nativeOption = Array.from(this.select.options).find(opt => String(opt.value) === String(value));
            if (!nativeOption) {
                nativeOption = new Option(text, value);
                this.select.add(nativeOption);
            }

            // Set data attributes on the native option
            if (selectedOptionData) {
                nativeOption.dataset.price = String(selectedOptionData.price || '');
                nativeOption.dataset.name = String(selectedOptionData.name || '');
                nativeOption.dataset.uom = String(selectedOptionData.uom || '');
            }
        }

        // Update original select
        this.select.value = value;

        // Update display text
        const displayText = this.wrapper.querySelector('.searchable-dropdown-text');
        if (displayText) {
            displayText.textContent = text;
        }

        // Trigger change event on original select
        const event = new Event('change', { bubbles: true });
        this.select.dispatchEvent(event);

        // Close dropdown
        this.close();
    }

    setValue(value, text) {
        this.selectOption(value, text);
    }

    destroy() {
        if (this.wrapper) {
            this.wrapper.remove();
        }
        this.select.style.display = '';
    }

    refresh() {
        // Refresh the dropdown options when the select is updated
        if (this.isOpen) {
            this.filterOptions(this.searchInput.value);
        }
    }
}

// Export for ES6 modules
export default SearchableDropdown;

// Also make available globally for non-module scripts
window.SearchableDropdown = SearchableDropdown;
