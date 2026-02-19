// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Storage Data
// ═══════════════════════════════════════════════════════════

import { getAllRows } from '../state.js';

const DATA_KEY = 'whaleWatcherData';

export function saveTableData() {
    try {
        const allRows = getAllRows();
        localStorage.setItem(DATA_KEY, JSON.stringify(allRows));
    } catch (e) {
        console.warn('Failed to save table data (quota exceeded?)', e);
    }
}

export function loadTableData(setAllRows) {
    try {
        const saved = localStorage.getItem(DATA_KEY);
        if (saved) {
            setAllRows(JSON.parse(saved));
        }
    } catch (e) {
        console.warn('Failed to parse saved table data', e);
    }
}
