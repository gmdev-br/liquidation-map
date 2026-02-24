// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — UI Filters
// ═══════════════════════════════════════════════════════════

import { setSortKey, setSortDir, getSortKey, getSortDir } from '../state.js';
import { saveSettings } from '../storage/settings.js';

export function sortBy(key, renderTable) {
    const sortKey = getSortKey();
    const sortDir = getSortDir();

    if (sortKey === key) {
        setSortDir(sortDir * -1);
    } else {
        setSortKey(key);
        setSortDir(-1);
    }

    updateSortIndicators();
    saveSettings(null, null, null, null, null, true); // Save immediately for sort changes
    renderTable();
}

// Função para atualizar os indicadores visuais de ordenação nos cabeçalhos
export function updateSortIndicators() {
    const sortKey = getSortKey();
    const sortDir = getSortDir();

    // Remove all sort classes from all headers
    document.querySelectorAll('th[id^="th-"]').forEach(th => {
        th.classList.remove('sorted', 'sorted-asc', 'sorted-desc');
    });

    // Add sort class to the current sort column
    const th = document.getElementById(`th-${sortKey}`);
    if (th) {
        th.classList.add('sorted');
        th.classList.add(sortDir === 1 ? 'sorted-asc' : 'sorted-desc');
    }
}

export function getPnlForWindow(row, window) {
    if (!row) return 0;

    // Check for windowPerformances directly on the row (new format)
    if (row.windowPerformances) {
        const wp = row.windowPerformances.find(w => w[0] === window);
        return wp ? parseFloat(wp[1].pnl || 0) : 0;
    }

    // Fallback for old format (leaderRow property)
    if (row.leaderRow?.windowPerformances) {
        const wp = row.leaderRow.windowPerformances.find(w => w[0] === window);
        return wp ? parseFloat(wp[1].pnl || 0) : 0;
    }

    return 0;
}
