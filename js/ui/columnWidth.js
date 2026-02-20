// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Column Width Control
// ═══════════════════════════════════════════════════════════

import { getColumnWidth, setColumnWidth } from '../state.js';
import { saveSettings } from '../storage/settings.js';

export function initColumnWidthControl() {
    const columnWidthInput = document.getElementById('columnWidthInput');
    const columnWidthVal = document.getElementById('columnWidthVal');

    if (!columnWidthInput || !columnWidthVal) {
        console.error('Column width input elements not found');
        return;
    }

    // Initialize with saved value or default
    const initialWidth = getColumnWidth();
    columnWidthInput.value = initialWidth;
    columnWidthVal.textContent = initialWidth;

    console.log('Column width control initialized with width:', initialWidth);

    // Apply initial column width after a delay to ensure table is rendered
    setTimeout(() => applyColumnWidth(initialWidth), 500);

    // Event listener for column width changes
    columnWidthInput.addEventListener('input', (e) => {
        let width = parseInt(e.target.value, 10);

        // Validate and clamp the value
        if (isNaN(width)) width = 100;
        if (width < 60) width = 60;
        if (width > 500) width = 500;

        columnWidthVal.textContent = width;
        setColumnWidth(width);
        applyColumnWidth(width);
    });

    // Save settings when user stops typing
    columnWidthInput.addEventListener('change', () => {
        saveSettings();
    });
}

export function applyColumnWidth(width) {
    console.log('applyColumnWidth called with width:', width);

    const table = document.querySelector('table');
    if (!table) {
        console.warn('Table not found for column width adjustment - will retry in 100ms');
        setTimeout(() => applyColumnWidth(width), 100);
        return;
    }

    // Set the CSS variable on the document root or table
    document.documentElement.style.setProperty('--column-width', width + 'px');

    console.log('Column width variable --column-width set to:', width + 'px');
}
