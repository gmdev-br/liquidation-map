// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Toast Notifications (Phase 5 Feedback)
// ═══════════════════════════════════════════════════════════

let toastContainer = null;

function initToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }
}

export function showToast(message, type = 'info', durationMs = 3000) {
    initToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message">${message}</div>
    `;

    toastContainer.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Automatically remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode === toastContainer) {
                toastContainer.removeChild(toast);
            }
        }, 400); // Wait for transition out
    }, durationMs);
}
