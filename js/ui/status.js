// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — UI Status
// ═══════════════════════════════════════════════════════════

export function setStatus(msg, type = 'idle') {
    document.getElementById('statusText').textContent = msg;
    document.getElementById('dot').className = 'dot ' + type;
}

export function setProgress(pct) {
    document.getElementById('progressFill').style.width = pct + '%';
}

export function setWindow(el, activeWindow, setActiveWindow, saveSettings, renderTable) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    setActiveWindow(el.dataset.window);
    saveSettings();
    renderTable();
}
