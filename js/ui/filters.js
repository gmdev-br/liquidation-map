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

export function getPnlForWindow(leaderRow, window) {
    if (!leaderRow?.windowPerformances) return 0;
    const wp = leaderRow.windowPerformances.find(w => w[0] === window);
    return wp ? parseFloat(wp[1].pnl || 0) : 0;
}
