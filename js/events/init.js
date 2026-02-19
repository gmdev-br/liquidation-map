// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Events Initialization
// ═══════════════════════════════════════════════════════════

import {
    getShowSymbols, getRankingLimit, getColorMaxLev, getChartHighLevSplit,
    getBubbleScale, getAggregationFactor, getDecimalPlaces, setAllRows, setActiveWindow, getActiveWindow, getChartMode
} from '../state.js';
import { loadTableData } from '../storage/data.js';
import { chartPlugins, chartOptions, chartMechanics } from '../charts/config.js';
import { saveSettings, loadSettings } from '../storage/settings.js';
import { updateRankingPanel, renderQuotesPanel, removeCoin as removeCoinFn, handlePriceModeClick, updatePriceModeUI } from '../ui/panels.js';
import { renderScatterPlot, getScatterChart } from '../charts/scatter.js';
import { renderLiqScatterPlot, getLiqChartInstance } from '../charts/liquidation.js';
import { updateStats, renderTable } from '../ui/table.js';
import { startScan, stopScan, togglePause, finishScan } from '../api/leaderboard.js';
import { updateCoinFilter, cbOpen, openCombobox, cbSelect as cbSelectFn, selectCoin as selectCoinFn, cbInit, setupClickOutsideHandler } from '../ui/combobox.js';
import { saveTableData } from '../storage/data.js';
import { setLastSaveTime, setRenderPending } from '../state.js';
import { fetchAllMids } from '../api/exchangeRates.js';
import {
    updateSpeed, updateRankingLimit, updateColorSettings, updateChartFilters,
    updateBubbleSize, updateAggregation, setChartModeHandler, updateChartHeight,
    updateLiqChartHeight, onCurrencyChange, openColumnCombobox, closeColumnComboboxDelayed,
    renderColumnDropdown as renderColumnDropdownFn, toggleColumn as toggleColumnFn, showAllColumns as showAllColumnsFn, hideAllColumns as hideAllColumnsFn, updateColumnSelectDisplay, applyColumnOrder,
    applyColumnWidths, applyColumnVisibility, toggleShowSymbols, updatePriceInterval, updateDecimalPlaces
} from './handlers.js';
import { setWindow, setStatus, setProgress } from '../ui/status.js';
import { sortBy } from '../ui/filters.js';
import { CURRENCY_META } from '../config.js';

function setupEventListeners() {
    // Setup click outside handler for comboboxes
    setupClickOutsideHandler();

    // Scan controls
    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) {
        scanBtn.addEventListener('click', () => startScan({
            setStatus,
            setProgress,
            fetchAllMids,
            updateStats,
            updateCoinFilter,
            renderTable,
            saveTableData,
            finishScan,
            setLastSaveTime,
            setRenderPending
        }));
    }

    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', () => stopScan(setStatus));
    }

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => togglePause(setStatus));
    }

    // Speed control
    const speedRange = document.getElementById('speedRange');
    if (speedRange) {
        speedRange.addEventListener('input', (e) => {
            updateSpeed(e.target.value);
        });
    }

    // Price update interval control
    const priceIntervalRange = document.getElementById('priceIntervalRange');
    if (priceIntervalRange) {
        priceIntervalRange.addEventListener('input', (e) => {
            updatePriceInterval(e.target.value);
        });
    }

    // Window tabs
    document.querySelectorAll('.tab[data-window]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            setWindow(e.target, getActiveWindow(), setActiveWindow, saveSettings, renderTable);
        });
    });

    // Price mode tabs
    document.querySelectorAll('#priceModeToggle .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            handlePriceModeClick(e.target);
        });
    });

    // Column sorting
    document.querySelectorAll('th[id^="th-"]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.id.replace('th-', '');
            sortBy(key, renderTable);
        });
    });

    // Filter inputs
    const filterInputs = ['minValue', 'coinFilter', 'sideFilter', 'minLev', 'maxLev', 'minSize',
                          'minSzi', 'maxSzi', 'minValueCcy', 'maxValueCcy', 'minEntryCcy', 'maxEntryCcy',
                          'minUpnl', 'maxUpnl', 'minFunding', 'levTypeFilter', 'addressFilter'];

    filterInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                saveSettings();
                renderTable();
            });
        }
    });

    // Show symbols toggle
    const btnShowSym = document.getElementById('btnShowSym');
    if (btnShowSym) {
        btnShowSym.addEventListener('click', toggleShowSymbols);
    }

    // Ranking limit
    const rankingLimit = document.getElementById('rankingLimit');
    if (rankingLimit) {
        rankingLimit.addEventListener('change', updateRankingLimit);
    }

    // Color settings
    const colorMaxLev = document.getElementById('colorMaxLev');
    if (colorMaxLev) {
        colorMaxLev.addEventListener('change', updateColorSettings);
    }

    const chartHighLevSplit = document.getElementById('chartHighLevSplit');
    if (chartHighLevSplit) {
        chartHighLevSplit.addEventListener('change', updateChartFilters);
    }

    // Bubble size
    const bubbleSizeRange = document.getElementById('bubbleSizeRange');
    if (bubbleSizeRange) {
        bubbleSizeRange.addEventListener('change', (e) => {
            updateBubbleSize(e.target.value);
        });
    }

    // Aggregation
    const aggregationRange = document.getElementById('aggregationRange');
    if (aggregationRange) {
        aggregationRange.addEventListener('change', (e) => {
            updateAggregation(e.target.value);
        });
    }

    // Decimal places control
    const decimalPlacesRange = document.getElementById('decimalPlacesRange');
    if (decimalPlacesRange) {
        decimalPlacesRange.addEventListener('input', (e) => {
            updateDecimalPlaces(e.target.value);
        });
    }

    // Chart mode tabs
    document.querySelectorAll('.tab[data-chart]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            setChartModeHandler(e.target.dataset.chart);
        });
    });

    // Chart height controls
    const chartSection = document.getElementById('chart-section');
    if (chartSection) {
        setupResizable(chartSection, updateChartHeight);
    }

    const liqChartSection = document.getElementById('liq-chart-section');
    if (liqChartSection) {
        setupResizable(liqChartSection, updateLiqChartHeight);
    }

    // Grid spacing control
    const gridSpacingRange = document.getElementById('gridSpacingRange');
    if (gridSpacingRange) {
        gridSpacingRange.addEventListener('input', (e) => {
            document.getElementById('gridSpacingVal').textContent = e.target.value;
            // Force chart redraw to update grid
            const scatterChart = window.getScatterChart ? window.getScatterChart() : null;
            const liqChart = window.getLiqChartInstance ? window.getLiqChartInstance() : null;
            if (scatterChart) scatterChart.update('none');
            if (liqChart) liqChart.update('none');
        });
    }

    // Price filter controls for chart scale
    const minEntryCcy = document.getElementById('minEntryCcy');
    const maxEntryCcy = document.getElementById('maxEntryCcy');
    
    if (minEntryCcy) {
        minEntryCcy.addEventListener('input', () => {
            // Re-render charts to update scale
            const scatterChart = window.getScatterChart ? window.getScatterChart() : null;
            const liqChart = window.getLiqChartInstance ? window.getLiqChartInstance() : null;
            if (scatterChart) {
                scatterChart.destroy();
                renderScatterPlot();
            }
            if (liqChart) {
                liqChart.destroy();
                renderLiqScatterPlot();
            }
        });
    }
    
    if (maxEntryCcy) {
        maxEntryCcy.addEventListener('input', () => {
            // Re-render charts to update scale
            const scatterChart = window.getScatterChart ? window.getScatterChart() : null;
            const liqChart = window.getLiqChartInstance ? window.getLiqChartInstance() : null;
            if (scatterChart) {
                scatterChart.destroy();
                renderScatterPlot();
            }
            if (liqChart) {
                liqChart.destroy();
                renderLiqScatterPlot();
            }
        });
    }

    // Currency selectors
    const currencySelect = document.getElementById('currencySelect');
    const entryCurrencySelect = document.getElementById('entryCurrencySelect');
    if (currencySelect) {
        currencySelect.addEventListener('change', onCurrencyChange);
    }
    if (entryCurrencySelect) {
        entryCurrencySelect.addEventListener('change', onCurrencyChange);
    }

    // Column combobox
    const columnSelectDisplay = document.getElementById('columnSelectDisplay');
    if (columnSelectDisplay) {
        columnSelectDisplay.addEventListener('focus', openColumnCombobox);
        columnSelectDisplay.addEventListener('blur', (e) => {
            // Only close if the related target is not within the combobox
            const combobox = document.getElementById('columnCombobox');
            if (!combobox || !combobox.contains(e.relatedTarget)) {
                closeColumnComboboxDelayed();
            }
        });
        columnSelectDisplay.addEventListener('input', (e) => {
            renderColumnDropdown(e.target.value);
        });
    }

    // Generic comboboxes - click to open
    const comboboxIds = ['cb-sideFilter', 'cb-levTypeFilter', 'cb-currencySelect', 'cb-entryCurrencySelect'];

    // Use DOMContentLoaded to ensure elements exist
    function setupComboboxListeners() {
        console.log('Setting up combobox listeners, readyState:', document.readyState);
        comboboxIds.forEach(fullId => {
            const combobox = document.getElementById(fullId);
            console.log(`Combobox ${fullId} found:`, !!combobox);
            if (combobox) {
                combobox.addEventListener('click', (e) => {
                    console.log('Combobox clicked:', fullId);
                    e.preventDefault();
                    e.stopPropagation();
                    // Extract base ID (remove 'cb-' prefix)
                    const baseId = fullId.replace('cb-', '');
                    cbOpen(baseId);
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupComboboxListeners);
    } else {
        setupComboboxListeners();
    }

    // Coin combobox
    const coinSearch = document.getElementById('coinSearch');
    if (coinSearch) {
        coinSearch.addEventListener('click', openCombobox);
    }

    // Reset zoom buttons
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', resetScatterZoom);
    }

    const resetLiqZoomBtn = document.getElementById('resetLiqZoomBtn');
    if (resetLiqZoomBtn) {
        resetLiqZoomBtn.addEventListener('click', resetLiqZoom);
    }

    // Make cbSelect, selectCoin, and toggleColumn globally accessible for inline onmousedown handlers
    window.cbSelect = (id, value, label, onChangeFn, renderTableFn) => {
        // For currency selectors, use onCurrencyChange, otherwise use renderTable
        if (id === 'currencySelect' || id === 'entryCurrencySelect') {
            cbSelectFn(id, value, label, onCurrencyChange, renderTable);
        } else {
            cbSelectFn(id, value, label, null, renderTable);
        }
    };
    
    // Make onCurrencyChange globally accessible
    window.onCurrencyChange = onCurrencyChange;
    window.selectCoin = (value, label) => {
        selectCoinFn(value, label);
    };
    window.toggleColumn = (key) => {
        toggleColumnFn(key);
    };
    window.showAllColumns = () => {
        showAllColumnsFn();
    };
    window.hideAllColumns = () => {
        hideAllColumnsFn();
    };
    window.renderColumnDropdown = (query) => {
        renderColumnDropdownFn(query);
    };
    window.removeCoin = (coin) => {
        removeCoinFn(coin);
    };

    // Make chart functions globally accessible for zoom events
    window.getScatterChart = getScatterChart;
    window.getLiqChartInstance = getLiqChartInstance;
}

function resetScatterZoom() {
    const chart = getScatterChart();
    if (chart) {
        chart.resetZoom();
        chart.isZoomed = false;
        const btn = document.getElementById('resetZoomBtn');
        if (btn) btn.style.display = 'none';
        saveSettings(null, null, null, chart, null);
    }
}

function resetLiqZoom() {
    const chart = getLiqChartInstance();
    if (chart) {
        chart.resetZoom();
        chart.isZoomed = false;
        const btn = document.getElementById('resetLiqZoomBtn');
        if (btn) btn.style.display = 'none';
        saveSettings(null, null, null, null, chart);
    }
}

function setupResizable(element, callback) {
    const resizer = element.querySelector('.chart-resizer');
    if (!resizer) return;

    let isResizing = false;
    let startY, startHeight;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = element.offsetHeight;
        resizer.classList.add('active');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(200, startHeight + deltaY);
        callback(newHeight);
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        resizer.classList.remove('active');
    });
}

function initializeCharts() {
    renderScatterPlot();
    renderLiqScatterPlot();
    chartMechanics.setupColumnResizing();
}

function initializePanels() {
    updateRankingPanel();
    renderQuotesPanel();
    updatePriceModeUI();
}

function loadInitialState() {
    loadTableData(setAllRows);
    loadSettings();
    
    // Carregar preços atuais antes de renderizar a tabela
    fetchAllMids();
    
    // Apply column visibility first
    applyColumnVisibility();
    updateColumnSelectDisplay();
    
    // Update chart control visibility based on current mode
    const chartMode = getChartMode();
    const bubbleCtrl = document.getElementById('bubbleSizeCtrl');
    const aggCtrl = document.getElementById('aggregationCtrl');
    
    if (bubbleCtrl) {
        bubbleCtrl.style.display = (chartMode === 'scatter') ? 'block' : 'none';
    }
    if (aggCtrl) {
        aggCtrl.style.display = (chartMode === 'column') ? 'block' : 'none';
    }
    
    renderTable();

    // Initialize generic comboboxes with options
    cbInit('sideFilter', [
        { value: '', label: 'All' },
        { value: 'long', label: 'Long' },
        { value: 'short', label: 'Short' }
    ], renderTable);

    cbInit('levTypeFilter', [
        { value: '', label: 'All' },
        { value: 'isolated', label: 'Isolated' },
        { value: 'cross', label: 'Cross' }
    ], renderTable);

    const currencyOptions = Object.keys(CURRENCY_META).map(ccy => ({
        value: ccy,
        label: ccy
    }));

    cbInit('currencySelect', currencyOptions, onCurrencyChange);
    cbInit('entryCurrencySelect', currencyOptions, onCurrencyChange);

    // Set initial values from state
    const btnShowSym = document.getElementById('btnShowSym');
    if (btnShowSym) {
        btnShowSym.textContent = getShowSymbols() ? 'On' : 'Off';
        btnShowSym.classList.toggle('active', getShowSymbols());
    }

    const speedVal = document.getElementById('speedVal');
    if (speedVal) {
        speedVal.textContent = '8'; // Default value
    }

    const priceIntervalVal = document.getElementById('priceIntervalVal');
    if (priceIntervalVal) {
        priceIntervalVal.textContent = '3s'; // Default value
    }

    const rankingLimit = document.getElementById('rankingLimit');
    if (rankingLimit) {
        rankingLimit.value = getRankingLimit();
    }

    const colorMaxLev = document.getElementById('colorMaxLev');
    if (colorMaxLev) {
        colorMaxLev.value = getColorMaxLev();
    }

    const chartHighLevSplit = document.getElementById('chartHighLevSplit');
    if (chartHighLevSplit) {
        chartHighLevSplit.value = getChartHighLevSplit();
    }

    const bubbleSizeRange = document.getElementById('bubbleSizeRange');
    if (bubbleSizeRange) {
        bubbleSizeRange.value = getBubbleScale();
        document.getElementById('bubbleSizeVal').textContent = getBubbleScale().toFixed(1);
    }

    const aggregationRange = document.getElementById('aggregationRange');
    if (aggregationRange) {
        aggregationRange.value = getAggregationFactor();
        document.getElementById('aggregationVal').textContent = getAggregationFactor();
    }

    const decimalPlacesRange = document.getElementById('decimalPlacesRange');
    if (decimalPlacesRange) {
        decimalPlacesRange.value = getDecimalPlaces();
        document.getElementById('decimalPlacesVal').textContent = getDecimalPlaces();
    }
}

export { setupEventListeners, initializeCharts, initializePanels, loadInitialState };
