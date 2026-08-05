// Multi-payment modal for receiving credit invoice payments
function showMultiPaymentModal(totalAmount) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.zIndex = '10000';
        modal.innerHTML = `
            <div class="modal-container" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Receive Payment - KSh ${parseFloat(totalAmount).toFixed(2)}</h3>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Payment Method</label>
                        <select id="multiPaymentMethod" class="form-control">
                            <option value="">Select Payment Method</option>
                            <option value="Cash">Cash</option>
                            <option value="Card">Card</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Amount</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="number" id="multiPaymentAmount" class="form-control" 
                                   placeholder="0.00" step="0.01" min="0">
                            <button type="button" class="btn btn-secondary" id="exactAmountBtnMulti">Exact</button>
                        </div>
                    </div>
                    
                    <div id="multiPaymentsList" style="margin-top: 1rem; display: none;">
                        <strong>Payments Added:</strong>
                        <div id="multiPaymentsListItems" style="margin-top: 0.5rem; max-height: 150px; overflow-y: auto;"></div>
                        <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #ddd;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Total Paid:</span>
                                <span id="totalPaidAmountMulti" style="font-weight: bold;">KSh 0.00</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Balance:</span>
                                <span id="balanceAmountMulti" style="font-weight: bold; color: var(--danger);">KSh ${parseFloat(totalAmount).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" id="cancelPaymentBtnMulti">Cancel</button>
                    <button type="button" class="btn btn-primary" id="addPaymentBtnMulti">Add Payment</button>
                    <button type="button" class="btn btn-success" id="confirmPaymentBtnMulti" style="display: none;">Complete Payment</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const selectEl = modal.querySelector('#multiPaymentMethod');
        const amountEl = modal.querySelector('#multiPaymentAmount');
        const addBtn = modal.querySelector('#addPaymentBtnMulti');
        const confirmBtn = modal.querySelector('#confirmPaymentBtnMulti');
        const cancelBtn = modal.querySelector('#cancelPaymentBtnMulti');
        const exactBtn = modal.querySelector('#exactAmountBtnMulti');

        let payments = [];
        let remaining = parseFloat(totalAmount);

        // Update display
        function updateDisplay() {
            const listContainer = modal.querySelector('#multiPaymentsList');
            const itemsContainer = modal.querySelector('#multiPaymentsListItems');
            const totalPaidEl = modal.querySelector('#totalPaidAmountMulti');
            const balanceEl = modal.querySelector('#balanceAmountMulti');

            if (payments.length > 0) {
                listContainer.style.display = 'block';
                itemsContainer.innerHTML = payments.map((p, i) => `
                    <div style="display: flex; justify-content: space-between; padding: 0.25rem 0; align-items: center;">
                        <span>${p.method}: KSh ${p.amount.toFixed(2)}</span>
                        <button type="button" class="remove-payment-btn" data-index="${i}"
                                style="background: var(--danger); color: white; border: none; border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 14px;">×</button>
                    </div>
                `).join('');

                // Add remove listeners
                itemsContainer.querySelectorAll('.remove-payment-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        if (e) e.preventDefault();
                        const index = parseInt(btn.dataset.index);
                        payments.splice(index, 1);
                        updateDisplay();
                    });
                });

                const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                remaining = totalAmount - totalPaid;

                totalPaidEl.textContent = `KSh ${totalPaid.toFixed(2)}`;
                balanceEl.textContent = `KSh ${Math.max(0, remaining).toFixed(2)}`;
                balanceEl.style.color = remaining <= 0.01 ? 'var(--success)' : 'var(--danger)';

                // Allow saving if at least one payment is added
                confirmBtn.style.display = 'inline-block';

                if (remaining <= 0.01) {
                    confirmBtn.textContent = 'Complete Payment';
                    confirmBtn.className = 'btn btn-success';
                    addBtn.textContent = 'Add More';
                } else {
                    confirmBtn.textContent = 'Save Partial Payment';
                    confirmBtn.className = 'btn btn-primary';
                    addBtn.textContent = 'Add Payment';
                }
            } else {
                listContainer.style.display = 'none';
                confirmBtn.style.display = 'none';
                addBtn.textContent = 'Add Payment';
            }
        }

        // Exact amount
        exactBtn.addEventListener('click', (e) => {
            if (e) e.preventDefault();
            amountEl.value = Math.max(0, remaining).toFixed(2);
            if (!selectEl.value) {
                selectEl.value = 'Cash';
            }
            amountEl.focus();
        });


        // Add payment
        addBtn.addEventListener('click', (e) => {
            if (e) e.preventDefault();
            const method = selectEl.value;
            const amount = parseFloat(amountEl.value);


            if (!method) {
                alert('Please select a payment method');
                selectEl.focus();
                return;
            }

            if (!amount || amount <= 0) {
                alert('Please enter a valid amount');
                amountEl.focus();
                return;
            }

            if (amount > remaining + 0.01) {
                if (window.messageModal) {
                    window.messageModal.confirm(
                        'Overpayment Warning',
                        `Amount KSh ${amount.toFixed(2)} exceeds remaining balance KSh ${remaining.toFixed(2)}. Add anyway?`,
                        () => {
                            addAndProceed();
                        }
                    );
                    return;
                } else if (!confirm(`Amount KSh ${amount.toFixed(2)} exceeds remaining balance KSh ${remaining.toFixed(2)}. Add anyway?`)) {
                    return;
                }
            }

            addAndProceed();

            function addAndProceed() {
                payments.push({ method, amount });
                selectEl.value = '';
                amountEl.value = '';
                updateDisplay();
                selectEl.focus();
            }
        });

        // Enter key to add payment
        amountEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addBtn.click();
            }
        });

        confirmBtn.addEventListener('click', () => {
            if (remaining > 0.01) {
                if (window.messageModal) {
                    window.messageModal.confirm(
                        'Partial Payment Confirmation',
                        `An outstanding balance of <strong style="color: var(--danger);">KSh ${remaining.toFixed(2)}</strong> will remain. Proceed with partial payment?`,
                        () => {
                            document.body.removeChild(modal);
                            resolve(payments);
                        }
                    );
                    return;
                } else if (!confirm(`An outstanding balance of KSh ${remaining.toFixed(2)} will remain. Proceed with partial payment?`)) {
                    return;
                }
            }
            document.body.removeChild(modal);
            resolve(payments);
        });

        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(null);
        });

        // Focus on select
        setTimeout(() => selectEl.focus(), 100);
    });
}

// Export for use in invoices.js
if (typeof window !== 'undefined') {
    window.showMultiPaymentModal = showMultiPaymentModal;
}
