// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Events Handlers
// ═══════════════════════════════════════════════════════════

import {
    setShowSymbols, setChartMode, setBubbleScale, setBubbleOpacity, setAggregationFactor,
    setRankingLimit, setColorMaxLev, setChartHighLevSplit, setChartHeight,
    setLiqChartHeight, setSortKey, setSortDir, setActiveWindow, getSortKey,
    getSortDir, getShowSymbols, getChartMode, getBubbleScale, getAggregationFactor,
    getRankingLimit, getColorMaxLev, getChartHighLevSplit, getChartHeight,
    getLiqChartHeight, getActiveWindow, setColumnOrder, setVisibleColumns,
    getColumnOrder, getVisibleColumns, setPriceUpdateInterval, setActiveCurrency,
    setActiveEntryCurrency, setDecimalPlaces, setLeverageColors
} from '../state.js';
import { renderTable, updateStats } from '../ui/table.js';
import { renderQuotesPanel, updateRankingPanel } from '../ui/panels.js';
import { saveSettings } from '../storage/settings.js';
import { startPriceTicker, stopPriceTicker } from '../ui/panels.js';
import { sortBy } from '../ui/filters.js';
import { selectCoin, updateCoinSearchLabel } from '../ui/combobox.js';

export function toggleShowSymbols() {
    setShowSymbols(!getShowSymbols());
    const isActive = getShowSymbols();
    const btnMobile = document.getElementById('btnShowSymMobile');
    const btnDesktop = document.getElementById('btnShowSymDesktop');
    if (btnMobile) {
        btnMobile.textContent = isActive ? 'Sim' : 'Não';
        btnMobile.classList.toggle('active', isActive);
    }
    if (btnDesktop) {
        btnDesktop.textContent = isActive ? 'On' : 'Off';
        btnDesktop.classList.toggle('active', isActive);
    }
    saveSettings();
    renderTable();
}

export function updateSpeed(val) {
    const v = parseInt(val, 10);
    if (v >= 1 && v <= 20) {
        document.getElementById('speedVal').textContent = v;
        saveSettings();
    }
}

export function updatePriceInterval(val) {
    const v = parseInt(val, 10);
    if (v >= 1 && v <= 30) {
        document.getElementById('priceIntervalVal').textContent = v + 's';
        setPriceUpdateInterval(v * 1000); // Convert seconds to milliseconds
        saveSettings();
        // Restart price ticker with new interval
        stopPriceTicker();
        startPriceTicker();
    }
}

export function updateRankingLimit() {
    const val = document.getElementById('rankingLimit').value;
    setRankingLimit(parseInt(val, 10));
    saveSettings();
    // Trigger ranking panel update
    updateRankingPanel();
}

export function updateColorSettings() {
    const val = document.getElementById('colorMaxLev').value;
    setColorMaxLev(parseInt(val, 10));
    saveSettings();
    // Trigger chart update by re-rendering the table
    renderTable();
}

export function updateChartFilters() {
    const val = document.getElementById('chartHighLevSplit').value;
    setChartHighLevSplit(parseInt(val, 10));
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateBubbleSize(val) {
    setBubbleScale(parseFloat(val));
    document.getElementById('bubbleSizeVal').textContent = val;
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateBubbleOpacity(val) {
    setBubbleOpacity(parseFloat(val));
    document.getElementById('bubbleOpacityVal').textContent = val;
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateAggregation(val) {
    setAggregationFactor(parseInt(val, 10));
    document.getElementById('aggregationVal').textContent = val;
    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function updateDecimalPlaces(val) {
    const v = parseInt(val, 10);
    if (v >= 0 && v <= 8) {
        setDecimalPlaces(v);
        document.getElementById('decimalPlacesVal').textContent = v;
        saveSettings();
        // Trigger table re-render to apply new formatting
        renderTable();
    }
}

export function updateLeverageColors() {
    const longLow = document.getElementById('colorLongLow').value;
    const longHigh = document.getElementById('colorLongHigh').value;
    const shortLow = document.getElementById('colorShortLow').value;
    const shortHigh = document.getElementById('colorShortHigh').value;
    
    setLeverageColors({
        longLow,
        longHigh,
        shortLow,
        shortHigh
    });

    // Update CSS variables
    document.documentElement.style.setProperty('--long-low-color', longLow);
    document.documentElement.style.setProperty('--long-high-color', longHigh);
    document.documentElement.style.setProperty('--short-low-color', shortLow);
    document.documentElement.style.setProperty('--short-high-color', shortHigh);

    saveSettings();
    // Trigger chart update by re-rendering table
    renderTable();
}

export function setChartModeHandler(mode) {
    setChartMode(mode);
    saveSettings();
    
    // Update active tab styling
    document.querySelectorAll('.tab[data-chart]').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.chart === mode);
    });
    
    // Update control visibility
    const bubbleCtrl = document.getElementById('bubbleSizeCtrl');
    const aggCtrl = document.getElementById('aggregationCtrl');
    
    if (bubbleCtrl) {
        bubbleCtrl.style.display = (mode === 'scatter') ? 'block' : 'none';
    }
    if (aggCtrl) {
        aggCtrl.style.display = (mode === 'column') ? 'block' : 'none';
    }
    
    // Trigger chart update
    renderTable();
}

export function updateChartHeight(height) {
    setChartHeight(height);
    saveSettings();
    const section = document.getElementById('chart-section');
    if (section) {
        section.style.height = height + 'px';
    }
}

export function updateLiqChartHeight(height) {
    setLiqChartHeight(height);
    saveSettings();
    const section = document.getElementById('liq-chart-section');
    if (section) {
        section.style.height = height + 'px';
    }
}

export function onCurrencyChange() {
    console.log('onCurrencyChange called');
    const activeCurrency = document.getElementById('currencySelect').value;
    const activeEntryCurrency = document.getElementById('entryCurrencySelect').value;
    
    console.log('Currency changed to:', activeCurrency, 'Entry currency:', activeEntryCurrency);
    
    // Update global state
    setActiveCurrency(activeCurrency);
    setActiveEntryCurrency(activeEntryCurrency);
    
    console.log('Updated global state:', {
        activeCurrency: activeCurrency,
        activeEntryCurrency: activeEntryCurrency
    });
    
    // Update column headers
    const thVal = document.getElementById('th-valueCcy');
    if (thVal) thVal.textContent = `Value (${activeCurrency}) ↕`;
    const thEntry = document.getElementById('th-entryCcy');
    if (thEntry) thEntry.textContent = `Entry Corr (${activeEntryCurrency}) ↕`;
    const thLiq = document.getElementById('th-liqPx');
    if (thLiq) thLiq.textContent = `Liq. Price Corr (${activeEntryCurrency}) ↕`;

    saveSettings();
    console.log('Calling renderTable after currency change');
    renderTable();
}

export function openColumnCombobox() {
    const cb = document.getElementById('columnCombobox');
    if (cb) cb.classList.add('open');
    renderColumnDropdown(document.getElementById('columnSelectDisplay').value);
}

export function closeColumnComboboxDelayed() {
    setTimeout(() => {
        const cb = document.getElementById('columnCombobox');
        if (cb) cb.classList.remove('open');
    }, 180);
}

export function renderColumnDropdown(query = '') {
    const dd = document.getElementById('columnDropdown');
    if (!dd) return;
    
    const columns = [
        { key: 'col-num', label: '#' },
        { key: 'col-address', label: 'Address' },
        { key: 'col-coin', label: 'Coin' },
        { key: 'col-szi', label: 'Size' },
        { key: 'col-leverage', label: 'Leverage' },
        { key: 'col-positionValue', label: 'Value' },
        { key: 'col-valueCcy', label: 'Value (CCY)' },
        { key: 'col-entryPx', label: 'Avg Entry' },
        { key: 'col-entryCcy', label: 'Avg Entry (Corr)' },
        { key: 'col-unrealizedPnl', label: 'UPNL' },
        { key: 'col-funding', label: 'Funding' },
        { key: 'col-liqPx', label: 'Liq. Price' },
        { key: 'col-distToLiq', label: 'Dist. to Liq.' },
        { key: 'col-accountValue', label: 'Acct. Value' }
    ];

    const q = query.trim().toUpperCase();
    const filtered = q ? columns.filter(c => c.label.toUpperCase().includes(q)) : columns;
    const visibleColumns = getVisibleColumns();

    let html = '';
    
    // Add Show All / Hide All buttons
    html += `<div class="combobox-action-buttons">
        <div class="combobox-action-btn" onmousedown="event.preventDefault(); showAllColumns()">Show All</div>
        <div class="combobox-action-btn" onmousedown="event.preventDefault(); hideAllColumns()">Hide All</div>
    </div>`;
    
    // Add column items with checkboxes
    html += filtered.map(col => {
        const isVisible = visibleColumns.length === 0 || visibleColumns.includes(col.key);
        return `<div class="combobox-item${isVisible ? ' selected' : ''}" onmousedown="event.preventDefault(); event.stopPropagation(); toggleColumn('${col.key}')">
            <input type="checkbox" ${isVisible ? 'checked' : ''} onchange="event.stopPropagation(); toggleColumn('${col.key}')" style="margin-right: 8px;">
            <span class="item-label">${col.label}</span>
        </div>`;
    }).join('');

    dd.innerHTML = html || `<div class="combobox-empty">No match</div>`;
}

export function toggleColumn(key) {
    const visibleColumns = getVisibleColumns();
    const allColumns = [
        'col-num', 'col-address', 'col-coin', 'col-szi', 'col-leverage',
        'col-positionValue', 'col-valueCcy', 'col-entryPx', 'col-entryCcy',
        'col-unrealizedPnl', 'col-funding', 'col-liqPx', 'col-distToLiq', 'col-accountValue'
    ];
    
    let newVisibleColumns;
    if (visibleColumns.length === 0) {
        // Currently all visible, remove the specified column
        newVisibleColumns = allColumns.filter(col => col !== key);
    } else {
        // Some columns hidden, toggle the specified column
        if (visibleColumns.includes(key)) {
            newVisibleColumns = visibleColumns.filter(col => col !== key);
            // If no columns left visible, show all
            if (newVisibleColumns.length === 0) {
                newVisibleColumns = [];
            }
        } else {
            newVisibleColumns = [...visibleColumns, key];
            // If all columns are visible, reset to empty array
            if (newVisibleColumns.length === allColumns.length) {
                newVisibleColumns = [];
            }
        }
    }
    
    setVisibleColumns(newVisibleColumns);
    saveSettings();
    applyColumnVisibility();
    renderTable();
    updateColumnSelectDisplay();
    
    // Keep dropdown open to show updated state
    const cb = document.getElementById('columnCombobox');
    if (cb) cb.classList.add('open');
    renderColumnDropdown(document.getElementById('columnSelectDisplay').value);
}

export function showAllColumns() {
    setVisibleColumns([]);
    saveSettings();
    applyColumnVisibility();
    renderTable();
    updateColumnSelectDisplay();
    
    // Keep dropdown open to show updated state
    const cb = document.getElementById('columnCombobox');
    if (cb) cb.classList.add('open');
    renderColumnDropdown(document.getElementById('columnSelectDisplay').value);
}

export function hideAllColumns() {
    setVisibleColumns(['col-address', 'col-coin']); // Keep address and coin visible
    saveSettings();
    applyColumnVisibility();
    renderTable();
    updateColumnSelectDisplay();
    
    // Keep dropdown open to show updated state
    const cb = document.getElementById('columnCombobox');
    if (cb) cb.classList.add('open');
    renderColumnDropdown(document.getElementById('columnSelectDisplay').value);
}

export function updateColumnSelectDisplay() {
    const visibleColumns = getVisibleColumns();
    const allColumns = [
        'col-num', 'col-address', 'col-coin', 'col-szi', 'col-leverage',
        'col-positionValue', 'col-valueCcy', 'col-entryPx', 'col-entryCcy',
        'col-unrealizedPnl', 'col-funding', 'col-liqPx', 'col-distToLiq', 'col-accountValue'
    ];
    
    const display = document.getElementById('columnSelectDisplay');
    if (!display) return;
    
    if (visibleColumns.length === 0) {
        display.value = `All ${allColumns.length} columns`;
    } else {
        const hiddenCount = allColumns.length - visibleColumns.length;
        display.value = `${visibleColumns.length} visible, ${hiddenCount} hidden`;
    }
}

export function applyColumnOrder() {
    // Apply column order to table
    // This function is called after loading settings
    // The actual application will be handled by renderTable()
    // which reads from getColumnOrder()
    
    // Setup drag and drop for column reordering
    setupColumnDragAndDrop();
}

export function setupColumnDragAndDrop() {
    if (document.querySelector('.dragging-initialized')) {
        console.log('Drag and drop already initialized');
        return;
    }

    console.log('Setting up column drag and drop...');
    const tableHeaders = document.querySelectorAll('th[id^="th-"]');
    console.log('Found table headers:', tableHeaders.length);

    // Track drag state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let draggedTh = null;

    // Remove draggable from all headers (we handle manually)
    tableHeaders.forEach(th => {
        th.draggable = false;
    });

    // Global mouse event delegation for drag start (no capture to run after resize)
    document.addEventListener('mousedown', (e) => {
        // Skip if resizing
        if (document.body.classList.contains('resizing')) return;

        const th = e.target.closest('th[id^="th-"]');
        if (!th) return;

        // Skip if clicking on resizer
        const resizer = th.querySelector('.resizer');
        if (resizer && (e.target === resizer || resizer.contains(e.target))) return;

        // Start drag
        isDragging = true;
        draggedTh = th;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        th.classList.add('dragging');
    }, false); // No capture to run after resize handler

    // Global mouse move for drag feedback
    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !draggedTh) return;

        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        // Only show dragging state after moving a bit
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            draggedTh.style.opacity = '0.5';
        }

        // Find potential drop target
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        const targetTh = targetElement?.closest('th[id^="th-"]');
        
        if (targetTh && targetTh !== draggedTh) {
            // Remove drag-over from all headers
            document.querySelectorAll('th').forEach(header => {
                header.classList.remove('drag-over');
            });
            // Add drag-over to current target
            targetTh.classList.add('drag-over');
        }
    });

    // Global mouse up for drop
    document.addEventListener('mouseup', (e) => {
        if (!isDragging || !draggedTh) return;

        // Find drop target
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        const targetTh = targetElement?.closest('th[id^="th-"]');
        
        if (targetTh && targetTh !== draggedTh) {
            console.log('Drop completed:', draggedTh.id, '->', targetTh.id);
            
            const draggedColumnId = draggedTh.id.replace('th-', '');
            const targetColumnId = targetTh.id.replace('th-', '');
            console.log('Dragged:', draggedColumnId, 'Target:', targetColumnId);

            // Get current column order
            const currentOrder = getColumnOrder();
            console.log('Current order:', currentOrder);

            const draggedIndex = currentOrder.indexOf(`col-${draggedColumnId}`);
            const targetIndex = currentOrder.indexOf(`col-${targetColumnId}`);
            console.log('Indices - Dragged:', draggedIndex, 'Target:', targetIndex);

            if (draggedIndex !== -1 && targetIndex !== -1) {
                // Reorder columns
                const newOrder = [...currentOrder];
                const [draggedColumn] = newOrder.splice(draggedIndex, 1);
                newOrder.splice(targetIndex, 0, draggedColumn);
                console.log('New order:', newOrder);

                // Update state and save
                setColumnOrder(newOrder);
                saveSettings();
                console.log('Order saved');

                // Re-render table to apply new column order
                renderTable();
                console.log('Table re-rendered');
            }
        }

        // Clean up
        isDragging = false;
        if (draggedTh) {
            draggedTh.classList.remove('dragging');
            draggedTh.style.opacity = '';
            draggedTh = null;
        }
        document.querySelectorAll('th').forEach(header => {
            header.classList.remove('drag-over');
        });
    });

    // Prevent default dragstart (we're handling it manually)
    document.addEventListener('dragstart', (e) => {
        if (e.target.closest('th[id^="th-"]')) {
            e.preventDefault();
        }
    });

    // Mark as initialized
    const marker = document.createElement('div');
    marker.className = 'dragging-initialized';
    marker.style.display = 'none';
    document.body.appendChild(marker);
}

export function applyColumnVisibility() {
    const visibleColumns = getVisibleColumns();
    const allColumns = [
        'col-num', 'col-address', 'col-coin', 'col-szi', 'col-leverage',
        'col-positionValue', 'col-valueCcy', 'col-entryPx', 'col-entryCcy',
        'col-unrealizedPnl', 'col-funding', 'col-liqPx', 'col-distToLiq', 'col-accountValue'
    ];
    
    // Update table header visibility
    allColumns.forEach(colKey => {
        const thElement = document.getElementById(`th-${colKey.replace('col-', '')}`);
        if (thElement) {
            const isVisible = visibleColumns.length === 0 || visibleColumns.includes(colKey);
            thElement.style.display = isVisible ? '' : 'none';
        }
    });
    
    // Update filter row visibility
    allColumns.forEach(colKey => {
        const filterCells = document.querySelectorAll(`.filter-cell.${colKey}`);
        filterCells.forEach(cell => {
            const isVisible = visibleColumns.length === 0 || visibleColumns.includes(colKey);
            cell.style.display = isVisible ? '' : 'none';
        });
    });
}

export function applyColumnWidths() {
    // Apply column widths to table
    // This would need columnWidths from state
}
