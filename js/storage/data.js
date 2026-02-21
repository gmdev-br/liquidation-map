// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Storage Data
// ═══════════════════════════════════════════════════════════

import { getAllRows } from '../state.js';
import { showToast } from '../ui/toast.js';

const DATA_KEY = 'whaleWatcherData';

export function saveTableData() {
    try {
        const allRows = getAllRows();
        if (allRows.length === 0) {
            console.warn('Skipping save: no data to save');
            return;
        }

        const data = JSON.stringify(allRows);
        localStorage.setItem(DATA_KEY, data);
        console.log(`Saved ${allRows.length} rows (${(data.length / 1024).toFixed(1)} KB)`);
    } catch (e) {
        console.error('Failed to save table data:', e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            showToast('Warning: Local storage quota exceeded. Some data may not persist.', 'error', 5000);
        }
    }
}

export function loadTableData(setAllRows) {
    try {
        const saved = localStorage.getItem(DATA_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`Loaded ${parsed.length} rows from storage`);
                setAllRows(parsed);
            } else {
                console.log('Stored data is empty or invalid format');
            }
        } else {
            console.log('No saved data found');
        }
    } catch (e) {
        console.error('Failed to parse saved table data:', e);
        // If data is corrupted, clear it to prevent future errors
        localStorage.removeItem(DATA_KEY);
    }
}
