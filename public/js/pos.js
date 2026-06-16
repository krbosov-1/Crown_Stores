document.addEventListener('DOMContentLoaded', () => {
    // State
    let cart = []; // Array of {productId, name, unitPrice, qty, stock}
    const branchId = document.getElementById('posBranchId').value;

    // DOM Elements
    const searchInput = document.getElementById('productSearch');
    const searchResults = document.getElementById('searchResults');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    const cartBody = document.getElementById('cartBody');
    const emptyCartState = document.getElementById('emptyCartState');
    const cartItemCount = document.getElementById('cartItemCount');
    
    const summaryLineItems = document.getElementById('summaryLineItems');
    const emptySummaryState = document.getElementById('emptySummaryState');
    const summarySubtotal = document.getElementById('summarySubtotal');
    const summaryTotal = document.getElementById('summaryTotal');
    
    const amountPaidInput = document.getElementById('amountPaid');
    const changeAmountDisplay = document.getElementById('changeAmount');
    
    const completeSaleBtn = document.getElementById('completeSaleBtn');
    const completeSpinner = document.getElementById('completeSpinner');
    const clearCartBtn = document.getElementById('clearCartBtn');
    
    const clearCartModalEl = document.getElementById('clearCartModal');
    let clearCartModal;
    if(typeof bootstrap !== 'undefined'){
        clearCartModal = new bootstrap.Modal(clearCartModalEl);
    }
    const confirmClearBtn = document.getElementById('confirmClearBtn');
    
    const toastContainer = document.getElementById('toastContainer');

    // Utility: Format UGX
    function formatUGX(amount) {
        return parseInt(amount, 10).toLocaleString('en-UG');
    }

    // Utility: Show Toast
    function showToast(message, type = 'success') {
        const toastId = 'toast' + Date.now();
        const icon = type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill';
        const bgClass = type === 'success' ? 'bg-success' : 'bg-danger';
        
        const html = `
            <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0 mb-2 shadow-sm" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body fw-medium d-flex align-items-center">
                        <i class="bi ${icon} me-2 fs-5"></i>
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        toastContainer.insertAdjacentHTML('beforeend', html);
        const toastEl = document.getElementById(toastId);
        const bsToast = new bootstrap.Toast(toastEl, { delay: 3000 });
        bsToast.show();
        
        toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
        });
    }

    // 1. Search Logic
    let searchTimeout = null;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        if (query.length > 0) {
            clearSearchBtn.classList.remove('d-none');
        } else {
            clearSearchBtn.classList.add('d-none');
            searchResults.classList.remove('active');
            return;
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(query);
        }, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(searchTimeout);
            const query = searchInput.value.trim();
            if (query.length > 0) {
                performSearch(query, true);
            }
        }
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.classList.add('d-none');
        searchResults.classList.remove('active');
        searchInput.focus();
    });

    async function performSearch(query, isEnter = false) {
        try {
            const res = await fetch(`/sales/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            
            if (isEnter && data.length === 1 && data[0].stock > 0) {
                // Auto add to cart if barcode scanner hits exactly 1 active product
                addToCart(data[0].id, data[0].name, data[0].price, data[0].stock);
                searchInput.value = '';
                clearSearchBtn.classList.add('d-none');
                searchResults.classList.remove('active');
            } else {
                renderSearchResults(data);
            }
        } catch (err) {
            console.error('Search error', err);
        }
    }

    function renderSearchResults(items) {
        searchResults.innerHTML = '';
        if (items.length === 0) {
            searchResults.innerHTML = '<div class="p-3 text-center text-muted fw-bold small">No products found</div>';
        } else {
            items.forEach(item => {
                const isOutOfStock = item.stock <= 0;
                const stockBadge = isOutOfStock 
                    ? '<span class="badge bg-danger-light text-danger border border-danger fw-bold"><i class="bi bi-x-circle me-1"></i>Out of Stock</span>'
                    : `<span class="badge bg-success-light text-success border border-success fw-bold"><i class="bi bi-check-circle me-1"></i>In Stock: ${item.stock}</span>`;
                
                const div = document.createElement('div');
                div.className = `p-3 border-bottom d-flex justify-content-between align-items-center ${isOutOfStock ? 'bg-light' : 'bg-white'}`;
                if (!isOutOfStock) {
                    div.style.cursor = 'pointer';
                    div.classList.add('search-result-item');
                    // Hover effect
                    div.addEventListener('mouseenter', () => div.style.backgroundColor = '#f1f5f9');
                    div.addEventListener('mouseleave', () => div.style.backgroundColor = '#ffffff');
                    
                    div.addEventListener('click', () => {
                        addToCart(item.id, item.name, item.price, item.stock);
                        searchInput.value = '';
                        clearSearchBtn.classList.add('d-none');
                        searchResults.classList.remove('active');
                        searchInput.focus();
                    });
                } else {
                    div.title = "No stock available";
                    div.style.opacity = '0.7';
                }

                div.innerHTML = `
                    <div>
                        <h6 class="fw-bold text-dark mb-1">${escapeHtml(item.name)}</h6>
                        <span class="badge bg-light text-muted border me-2">${escapeHtml(item.category_name || 'N/A')}</span>
                        ${item.barcode ? `<span class="small font-monospace text-muted"><i class="bi bi-upc"></i> ${escapeHtml(item.barcode)}</span>` : ''}
                    </div>
                    <div class="text-end">
                        <div class="fw-bold font-monospace text-primary fs-6 mb-1">UGX ${formatUGX(item.price)}</div>
                        ${stockBadge}
                    </div>
                `;
                searchResults.appendChild(div);
            });
        }
        searchResults.classList.add('active');
    }

    // Escape HTML to prevent XSS
    function escapeHtml(unsafe) {
        return (unsafe || "").toString()
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    // 2. Cart Logic
    function addToCart(productId, name, price, stock) {
        const pId = parseInt(productId, 10);
        const existing = cart.find(item => item.productId === pId);

        if (existing) {
            if (existing.qty < existing.stock) {
                existing.qty += 1;
            } else {
                showToast(`Cannot add more. Max stock for ${name} is ${stock}.`, 'error');
                return;
            }
        } else {
            cart.push({
                productId: pId,
                name: name,
                unitPrice: parseFloat(price),
                qty: 1,
                stock: parseInt(stock, 10)
            });
        }
        
        renderCart();
    }

    // Expose to window for inline onclicks in generated HTML
    window.updateQty = function(productId, delta) {
        const item = cart.find(i => i.productId === productId);
        if (!item) return;
        
        const newQty = item.qty + delta;
        if (newQty >= 1 && newQty <= item.stock) {
            item.qty = newQty;
            renderCart();
        }
    };

    window.manualQtyInput = function(productId, inputEl) {
        const item = cart.find(i => i.productId === productId);
        if (!item) return;

        let val = parseInt(inputEl.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > item.stock) {
            val = item.stock;
            showToast(`Max stock is ${item.stock}`, 'error');
        }
        
        item.qty = val;
        renderCart(); // Re-render to sanitize input box visually
    };

    window.removeFromCart = function(productId) {
        cart = cart.filter(i => i.productId !== productId);
        renderCart();
    };

    function renderCart() {
        // Clear current tr except empty state
        const trs = cartBody.querySelectorAll('tr:not(#emptyCartState)');
        trs.forEach(tr => tr.remove());

        if (cart.length === 0) {
            emptyCartState.style.display = 'table-row';
            cartItemCount.textContent = '0 items';
            clearCartBtn.disabled = true;
            emptySummaryState.style.display = 'block';
            summaryLineItems.querySelectorAll('.summary-item').forEach(el => el.remove());
        } else {
            emptyCartState.style.display = 'none';
            cartItemCount.textContent = `${cart.length} item(s)`;
            clearCartBtn.disabled = false;
            emptySummaryState.style.display = 'none';
            summaryLineItems.querySelectorAll('.summary-item').forEach(el => el.remove());

            cart.forEach(item => {
                const subtotal = item.qty * item.unitPrice;
                
                // --- CART TABLE ROW ---
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="ps-2 py-3 fw-bold text-dark w-25 border-bottom">${escapeHtml(item.name)}</td>
                    <td class="text-end py-3 font-monospace text-muted border-bottom w-25">UGX ${formatUGX(item.unitPrice)}</td>
                    <td class="py-3 border-bottom w-25">
                        <div class="qty-control mx-auto">
                            <button class="qty-btn" onclick="updateQty(${item.productId}, -1)" ${item.qty <= 1 ? 'disabled' : ''}>−</button>
                            <input type="number" class="qty-input" value="${item.qty}" min="1" max="${item.stock}" onchange="manualQtyInput(${item.productId}, this)">
                            <button class="qty-btn" onclick="updateQty(${item.productId}, 1)" ${item.qty >= item.stock ? 'disabled' : ''}>+</button>
                        </div>
                    </td>
                    <td class="text-end py-3 font-monospace fw-bold text-dark border-bottom w-25">UGX ${formatUGX(subtotal)}</td>
                    <td class="text-center py-3 border-bottom pe-2">
                        <button class="btn btn-sm btn-light text-danger rounded border" onclick="removeFromCart(${item.productId})" title="Remove"><i class="bi bi-trash3"></i></button>
                    </td>
                `;
                cartBody.appendChild(tr);

                // --- SUMMARY ROW ---
                const sumDiv = document.createElement('div');
                sumDiv.className = 'summary-item d-flex justify-content-between mb-2 text-dark';
                sumDiv.innerHTML = `
                    <div class="d-flex flex-column" style="max-width: 65%;">
                        <span class="fw-bold small text-truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                        <span class="text-muted" style="font-size: 0.75rem;">${item.qty} × UGX ${formatUGX(item.unitPrice)}</span>
                    </div>
                    <span class="fw-bold font-monospace small">UGX ${formatUGX(subtotal)}</span>
                `;
                summaryLineItems.appendChild(sumDiv);
            });
        }

        calculateTotals();
    }

    // 3. Totals and Payment
    let orderTotal = 0;

    function calculateTotals() {
        orderTotal = cart.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
        
        summarySubtotal.textContent = `UGX ${formatUGX(orderTotal)}`;
        summaryTotal.textContent = `UGX ${formatUGX(orderTotal)}`;
        
        handleAmountPaid();
    }

    amountPaidInput.addEventListener('input', handleAmountPaid);

    function handleAmountPaid() {
        if (cart.length === 0) {
            amountPaidInput.value = '';
            changeAmountDisplay.textContent = 'Awaiting payment...';
            changeAmountDisplay.className = 'fw-bold fs-4 font-monospace text-muted';
            completeSaleBtn.disabled = true;
            return;
        }

        const paid = parseFloat(amountPaidInput.value);
        if (isNaN(paid)) {
            changeAmountDisplay.textContent = 'Awaiting payment...';
            changeAmountDisplay.className = 'fw-bold fs-4 font-monospace text-muted';
            completeSaleBtn.disabled = true;
        } else {
            const change = paid - orderTotal;
            if (change >= 0) {
                changeAmountDisplay.textContent = `UGX ${formatUGX(change)}`;
                changeAmountDisplay.className = 'fw-bold fs-4 font-monospace text-success';
                completeSaleBtn.disabled = false;
            } else {
                changeAmountDisplay.textContent = `Short UGX ${formatUGX(Math.abs(change))}`;
                changeAmountDisplay.className = 'fw-bold fs-4 font-monospace text-danger';
                completeSaleBtn.disabled = true;
            }
        }
    }

    // 4. Actions
    clearCartBtn.addEventListener('click', () => {
        clearCartModal.show();
    });

    confirmClearBtn.addEventListener('click', () => {
        cart = [];
        amountPaidInput.value = '';
        renderCart();
        clearCartModal.hide();
    });

    completeSaleBtn.addEventListener('click', async () => {
        if (cart.length === 0) return;
        
        const paid = parseFloat(amountPaidInput.value);
        if (isNaN(paid) || paid < orderTotal) return;

        completeSaleBtn.disabled = true;
        completeSpinner.classList.remove('d-none');
        
        const payload = {
            items: cart.map(i => ({
                productId: i.productId,
                qty: i.qty,
                unitPrice: i.unitPrice
            })),
            amountPaid: paid
        };

        try {
            const res = await fetch('/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.success && data.saleId) {
                // Redirect to receipt
                window.location.href = `/receipts/${data.saleId}`;
            } else {
                showToast(data.error || 'Failed to complete sale', 'error');
                completeSaleBtn.disabled = false;
                completeSpinner.classList.add('d-none');
            }
        } catch (err) {
            console.error('Checkout error', err);
            showToast('Network error while completing sale', 'error');
            completeSaleBtn.disabled = false;
            completeSpinner.classList.add('d-none');
        }
    });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            e.preventDefault();
            amountPaidInput.focus();
            amountPaidInput.select();
        }
    });
});
