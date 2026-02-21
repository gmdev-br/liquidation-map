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
    
    document.querySelectorAll('th[id^="th-"]').forEach(th => {
        th.classList.remove('sorted');
    });
    const th = document.getElementById(`th-${key}`);
    if (th) th.classList.add('sorted');
    
    saveSettings();
    renderTable();
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
