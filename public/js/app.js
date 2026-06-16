document.addEventListener('DOMContentLoaded', () => {
    /* 1. Sidebar toggle on mobile */
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('show');
            sidebar.classList.toggle('collapsed');
        });
    }

    /* 4. Delete confirmation modal */
    const confirmModalEl = document.getElementById('confirmModal');
    let confirmModal;
    if (confirmModalEl) {
        confirmModal = new bootstrap.Modal(confirmModalEl);
    }
    
    let currentFormToSubmit = null;

    document.querySelectorAll('[data-confirm]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const message = this.getAttribute('data-confirm');
            const targetForm = this.closest('form');
            
            if (confirmModal && targetForm) {
                document.getElementById('confirmModalText').textContent = message;
                currentFormToSubmit = targetForm;
                confirmModal.show();
            } else if (confirm(message)) {
                targetForm.submit();
            }
        });
    });

    if (document.getElementById('confirmModalBtn')) {
        document.getElementById('confirmModalBtn').addEventListener('click', () => {
            if (currentFormToSubmit) {
                showLoading();
                currentFormToSubmit.submit();
            }
            if (confirmModal) confirmModal.hide();
        });
    }

    /* 5. Auto-dismiss flash alerts after 5 seconds */
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 150); // wait for fade out
        }, 5000);
    });

    /* 6 & 7. Fetch unread notification count every 60s */
    const fetchNotificationCount = async () => {
        try {
            const res = await fetch('/api/notifications/count');
            if (res.ok) {
                const data = await res.json();
                const badges = document.querySelectorAll('.notif-badge');
                badges.forEach(badge => {
                    if (data.count > 0) {
                        badge.textContent = data.count > 99 ? '99+' : data.count;
                        badge.style.display = 'block';
                    } else {
                        badge.style.display = 'none';
                    }
                });
            }
        } catch (error) {
            console.error('Failed to fetch notifications count:', error);
        }
    };

    // Only run if user is logged in (bell icon exists)
    if (document.getElementById('notifDropdown')) {
        // Initial fetch then every 60s
        setTimeout(fetchNotificationCount, 1000);
        setInterval(fetchNotificationCount, 60000);
        
        // Mark as read when clicking dropdown (simulated)
        document.getElementById('notifDropdown').addEventListener('click', () => {
            // Can add API call to mark as read here
        });
    }
});

/* Global Helper Functions */

/* 2. showToast(message, type) */
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    let iconClass = 'bi-info-circle-fill';
    let toastClass = 'toast-info';

    if (type === 'success') {
        iconClass = 'bi-check-circle-fill';
        toastClass = 'toast-success';
    } else if (type === 'danger') {
        iconClass = 'bi-exclamation-triangle-fill';
        toastClass = 'toast-danger';
    } else if (type === 'warning') {
        iconClass = 'bi-exclamation-circle-fill';
        toastClass = 'toast-warning';
    }

    const toastId = 'toast-' + Date.now();
    const html = `
        <div id="${toastId}" class="toast-custom ${toastClass}">
            <i class="bi ${iconClass} toast-icon"></i>
            <div class="toast-content">
                <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="document.getElementById('${toastId}').style.animation='slideOutRight 0.3s forwards'; setTimeout(()=>document.getElementById('${toastId}').remove(), 300);"><i class="bi bi-x-lg"></i></button>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    // Auto remove after 4s
    setTimeout(() => {
        const el = document.getElementById(toastId);
        if (el) {
            el.style.animation = 'slideOutRight 0.3s forwards';
            setTimeout(() => el.remove(), 300);
        }
    }, 4000);
};

/* 3. showLoading() / hideLoading() */
window.showLoading = function() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('active');
};

window.hideLoading = function() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('active');
};
