// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Storage Settings
// ═══════════════════════════════════════════════════════════

import {
    getSortKey, getSortDir, getShowSymbols, getChartMode, getBubbleScale, getBubbleOpacity,
    getAggregationFactor, getSelectedCoins, getPriceMode, getPriceUpdateInterval, getActiveWindow,
    getVisibleColumns, getColumnOrder, getRankingLimit, getColorMaxLev,
    getChartHighLevSplit, getChartHeight, getLiqChartHeight, getSavedScatterState,
    getSavedLiqState, getColumnWidths, getColumnWidth, getActiveCurrency, getActiveEntryCurrency, getDecimalPlaces, getLeverageColors, getFontSize, getFontSizeKnown, getGridSpacing,
    setSortKey, setSortDir, setSavedScatterState, setSavedLiqState,
    setColumnOrder, setVisibleColumns, setSelectedCoins, setRankingLimit, setColorMaxLev, setChartHighLevSplit, setChartMode, setBubbleScale, setBubbleOpacity, setAggregationFactor, setPriceMode, setShowSymbols, setPriceUpdateInterval, setDecimalPlaces, setFontSize, setFontSizeKnown, setLeverageColors, setColumnWidth, setGridSpacing
} from '../state.js';
import { COLUMN_DEFS } from '../config.js';
import { cbSetValue, updateCoinSearchLabel } from '../ui/combobox.js';
import { 
    applyColumnVisibility, 
    updateColumnSelectDisplay 
} from '../events/handlers.js';
import { renderQuotesPanel, updatePriceModeUI } from '../ui/panels.js';

const STORAGE_KEY = 'whaleWatcherSettings';

export function saveSettings(getChartState = null, savedScatterState = null, savedLiqState = null, scatterChart = null, liqChartInstance = null) {
    // Helper to get chart state
    function getChartStateHelper(chart) {
        if (!chart) return null;
        if (chart.isZoomed) {
            return {
                x: { min: chart.scales.x.min, max: chart.scales.x.max },
                y: { min: chart.scales.y.min, max: chart.scales.y.max }
            };
        }
        return null; // Return null if not zoomed (user wants default view)
    }

    const currencySelectEl = document.getElementById('currencySelect');
    const entryCurrencySelectEl = document.getElementById('entryCurrencySelect');
    const minValueCcyEl = document.getElementById('minValueCcy');
    const maxValueCcyEl = document.getElementById('maxValueCcy');
    
    const settings = {
        scatterChartState: getChartStateHelper(scatterChart) || savedScatterState,
        liqChartState: getChartStateHelper(liqChartInstance) || savedLiqState,
        minValue: document.getElementById('minValue').value,
        sideFilter: document.getElementById('sideFilter').value,
        minLev: document.getElementById('minLev').value,
        maxLev: document.getElementById('maxLev').value,
        minSize: document.getElementById('minSize').value,
        minSzi: document.getElementById('minSzi').value,
        maxSzi: document.getElementById('maxSzi').value,
        minValueCcy: minValueCcyEl ? minValueCcyEl.value : '',
        maxValueCcy: maxValueCcyEl ? maxValueCcyEl.value : '',
        minEntryCcy: document.getElementById('minEntryCcy').value,
        maxEntryCcy: document.getElementById('maxEntryCcy').value,
        minUpnl: document.getElementById('minUpnl').value,
        maxUpnl: document.getElementById('maxUpnl').value,
        minFunding: document.getElementById('minFunding').value,
        levTypeFilter: document.getElementById('levTypeFilter').value,
        currencySelect: currencySelectEl ? currencySelectEl.value : '',
        entryCurrencySelect: entryCurrencySelectEl ? entryCurrencySelectEl.value : '',
        addressFilter: document.getElementById('addressFilter').value,
        selectedCoins: getSelectedCoins(),
        priceMode: getPriceMode(),
        priceUpdateInterval: getPriceUpdateInterval(),
        activeWindow: getActiveWindow(),
        columnWidths: getColumnWidths(),
        rankingLimit: getRankingLimit(),
        colorMaxLev: getColorMaxLev(),
        chartHighLevSplit: getChartHighLevSplit(),
        sortKey: getSortKey(),
        sortDir: getSortDir(),
        showSymbols: getShowSymbols(),
        chartHeight: getChartHeight(),
        chartMode: getChartMode(),
        bubbleScale: getBubbleScale(),
        bubbleOpacity: getBubbleOpacity(),
        aggregationFactor: getAggregationFactor(),
        decimalPlaces: getDecimalPlaces(),
        fontSize: getFontSize(),
        fontSizeKnown: getFontSizeKnown(),
        visibleColumns: getVisibleColumns(),
        columnOrder: getColumnOrder(),
        leverageColors: getLeverageColors(),
        columnWidth: getColumnWidth(),
        gridSpacing: getGridSpacing()
    };
    
    console.log('Saving currency settings:', {
        currencySelect: settings.currencySelect,
        entryCurrencySelect: settings.entryCurrencySelect
    });
    
    console.log('Saving VALUE column data:', {
        minValueCcy: settings.minValueCcy,
        maxValueCcy: settings.maxValueCcy
    });
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEY);
    let s = null;
    
    if (saved) {
        try {
            s = JSON.parse(saved);
        } catch (e) { 
            console.warn('Failed to parse saved settings', e); 
        }
    }
    
    // Initialize column order
    if (s && s.columnOrder && s.columnOrder.length > 0) {
        // Merge new columns from COLUMN_DEFS that are missing in saved order
        const currentKeys = COLUMN_DEFS.map(c => c.key);
        const savedKeys = new Set(s.columnOrder);
        currentKeys.forEach(key => {
            if (!savedKeys.has(key)) {
                // Insert before col-distToLiq if possible, else append
                if (key === 'col-liqPx') {
                    const idx = s.columnOrder.indexOf('col-distToLiq');
                    if (idx > -1) s.columnOrder.splice(idx, 0, key);
                    else s.columnOrder.push(key);
                } else {
                    s.columnOrder.push(key);
                }
            }
        });
        console.log('Setting columnOrder from saved:', s.columnOrder);
        setColumnOrder(s.columnOrder);
    } else {
        // Initialize with default column order
        const defaultOrder = COLUMN_DEFS.map(c => c.key);
        console.log('Setting default columnOrder:', defaultOrder);
        setColumnOrder(defaultOrder);
        s = s || {};
        s.columnOrder = defaultOrder;
    }
    
    // Initialize visible columns
    if (s && s.visibleColumns && s.visibleColumns.length > 0) {
        // Merge new columns
        const currentKeys = COLUMN_DEFS.map(c => c.key);
        const savedKeys = new Set(s.visibleColumns);
        currentKeys.forEach(key => {
            if (!savedKeys.has(key)) {
                s.visibleColumns.push(key);
            }
        });
        console.log('Setting visibleColumns from saved:', s.visibleColumns);
        setVisibleColumns(s.visibleColumns);
        applyColumnVisibility();
        updateColumnSelectDisplay();
    } else {
        // Initialize with all columns visible
        const defaultVisible = COLUMN_DEFS.map(c => c.key);
        console.log('Setting default visibleColumns:', defaultVisible);
        setVisibleColumns(defaultVisible);
        s = s || {};
        s.visibleColumns = defaultVisible;
    }
    
    // ENSURE SYNCHRONIZATION: Make sure columnOrder and visibleColumns are identical
    // This prevents persistence issues where columns get out of sync
    const finalColumnOrder = getColumnOrder();
    const finalVisibleColumns = getVisibleColumns();
    
    if (JSON.stringify(finalColumnOrder) !== JSON.stringify(finalVisibleColumns)) {
        console.warn('Column order mismatch detected, synchronizing...');
        console.warn('columnOrder:', finalColumnOrder);
        console.warn('visibleColumns:', finalVisibleColumns);
        
        // Use columnOrder as the source of truth and update visibleColumns to match
        setVisibleColumns([...finalColumnOrder]);
        applyColumnVisibility();
        updateColumnSelectDisplay();
        
        console.log('Synchronized columnOrder and visibleColumns:', finalColumnOrder);
    }
    
    // Load other settings if they exist
    if (!s) return;
    
    if (s.showSymbols !== undefined) {
        setShowSymbols(s.showSymbols);
        const btnMobile = document.getElementById('btnShowSymMobile');
        const btnDesktop = document.getElementById('btnShowSymDesktop');
        if (btnMobile) {
            btnMobile.textContent = s.showSymbols ? 'Sim' : 'Não';
            btnMobile.classList.toggle('active', s.showSymbols);
        }
        if (btnDesktop) {
            btnDesktop.textContent = s.showSymbols ? 'On' : 'Off';
            btnDesktop.classList.toggle('active', s.showSymbols);
        }
    }
    if (s.chartMode) {
        setChartMode(s.chartMode);
        document.querySelectorAll('.tab[data-chart]').forEach(t => {
            t.classList.toggle('active', t.dataset.chart === s.chartMode);
        });
        const bubbleCtrls = document.querySelectorAll('#bubbleSizeCtrl');
        bubbleCtrls.forEach(ctrl => ctrl.style.display = (s.chartMode === 'scatter') ? 'block' : 'none');
        const aggCtrls = document.querySelectorAll('#aggregationCtrl');
        aggCtrls.forEach(ctrl => ctrl.style.display = (s.chartMode === 'column') ? 'block' : 'none');
    }
    if (s.bubbleScale) {
        setBubbleScale(s.bubbleScale);
        const bubbleSizeVals = document.querySelectorAll('#bubbleSizeVal');
        const bubbleSizeRanges = document.querySelectorAll('#bubbleSizeRange');
        bubbleSizeVals.forEach(el => el.textContent = s.bubbleScale.toFixed(1));
        bubbleSizeRanges.forEach(el => el.value = s.bubbleScale);
    }
    if (s.bubbleOpacity) {
        setBubbleOpacity(s.bubbleOpacity);
        const bubbleOpacityVals = document.querySelectorAll('#bubbleOpacityVal');
        const bubbleOpacityRanges = document.querySelectorAll('#bubbleOpacityRange');
        bubbleOpacityVals.forEach(el => el.textContent = s.bubbleOpacity.toFixed(2));
        bubbleOpacityRanges.forEach(el => el.value = s.bubbleOpacity);
    }
    if (s.aggregationFactor) {
        setAggregationFactor(s.aggregationFactor);
        const aggregationVals = document.querySelectorAll('#aggregationVal');
        const aggregationRanges = document.querySelectorAll('#aggregationRange');
        aggregationVals.forEach(el => el.textContent = s.aggregationFactor);
        aggregationRanges.forEach(el => el.value = s.aggregationFactor);
    }
    if (s.decimalPlaces !== undefined) {
        setDecimalPlaces(s.decimalPlaces);
        const decimalPlacesVals = document.querySelectorAll('#decimalPlacesVal');
        const decimalPlacesRanges = document.querySelectorAll('#decimalPlacesRange');
        decimalPlacesVals.forEach(el => el.textContent = s.decimalPlaces);
        decimalPlacesRanges.forEach(el => el.value = s.decimalPlaces);
    }
    if (s.fontSize !== undefined) {
        setFontSize(s.fontSize);
        const fontSizeVals = document.querySelectorAll('#fontSizeVal, #fontSizeValDesktop');
        const fontSizeRanges = document.querySelectorAll('#fontSizeRange, #fontSizeRangeDesktop');
        fontSizeVals.forEach(el => el.textContent = s.fontSize);
        fontSizeRanges.forEach(el => el.value = s.fontSize);
    }
    if (s.fontSizeKnown !== undefined) {
        setFontSizeKnown(s.fontSizeKnown);
        const fontSizeKnownVals = document.querySelectorAll('#fontSizeKnownVal, #fontSizeKnownValDesktop');
        const fontSizeKnownRanges = document.querySelectorAll('#fontSizeKnownRange, #fontSizeKnownRangeDesktop');
        fontSizeKnownVals.forEach(el => el.textContent = s.fontSizeKnown);
        fontSizeKnownRanges.forEach(el => el.value = s.fontSizeKnown);
    }
    if (s.minValue) document.getElementById('minValue').value = s.minValue;
    if (s.coinFilter) {
        document.getElementById('coinFilter').value = s.coinFilter;
        document.getElementById('coinSearch').value = s.coinFilter;
    }
    if (s.sideFilter) cbSetValue('sideFilter', s.sideFilter);
    if (s.minLev) document.getElementById('minLev').value = s.minLev;
    if (s.maxLev) document.getElementById('maxLev').value = s.maxLev;
    if (s.minSize) document.getElementById('minSize').value = s.minSize;
    if (s.minSzi) document.getElementById('minSzi').value = s.minSzi;
    if (s.maxSzi) document.getElementById('maxSzi').value = s.maxSzi;
    if (s.minValueCcy) document.getElementById('minValueCcy').value = s.minValueCcy;
    if (s.maxValueCcy) document.getElementById('maxValueCcy').value = s.maxValueCcy;
    
    console.log('Loading VALUE column data:', {
        minValueCcy: s.minValueCcy,
        maxValueCcy: s.maxValueCcy
    });
    if (s.minEntryCcy) document.getElementById('minEntryCcy').value = s.minEntryCcy;
    if (s.maxEntryCcy) document.getElementById('maxEntryCcy').value = s.maxEntryCcy;
    if (s.minUpnl) document.getElementById('minUpnl').value = s.minUpnl;
    if (s.maxUpnl) document.getElementById('maxUpnl').value = s.maxUpnl;
    if (s.minFunding) document.getElementById('minFunding').value = s.minFunding;
    if (s.levTypeFilter) cbSetValue('levTypeFilter', s.levTypeFilter);
    if (s.currencySelect) cbSetValue('currencySelect', s.currencySelect);
    if (s.entryCurrencySelect) cbSetValue('entryCurrencySelect', s.entryCurrencySelect);
    
    console.log('Loading currency settings:', {
        currencySelect: s.currencySelect,
        entryCurrencySelect: s.entryCurrencySelect
    });
    
    // Trigger currency change handler to update state and headers
    if (s.currencySelect || s.entryCurrencySelect) {
        console.log('Triggering onCurrencyChange after loading settings');
        // Import and call onCurrencyChange
        import('../events/handlers.js').then(({ onCurrencyChange }) => {
            onCurrencyChange();
        });
    }
    if (s.coinFilter) {
        document.getElementById('coinFilter').value = s.coinFilter;
    }
    if (s.selectedCoins) {
        console.log('Loading selectedCoins from settings:', s.selectedCoins);
        setSelectedCoins(s.selectedCoins);
        updateCoinSearchLabel();
        renderQuotesPanel();
    } else if (s.coinFilter) {
        // Fallback for old coinFilter format
        console.log('Using fallback coinFilter:', s.coinFilter);
        document.getElementById('coinSearch').value = s.coinFilter;
    }
    if (s.priceMode) {
        setPriceMode(s.priceMode);
        updatePriceModeUI();
    }
    if (s.priceUpdateInterval) {
        setPriceUpdateInterval(s.priceUpdateInterval);
        const priceIntervalVals = document.querySelectorAll('#priceIntervalVal');
        const priceIntervalRanges = document.querySelectorAll('#priceIntervalRange');
        priceIntervalVals.forEach(el => el.textContent = (s.priceUpdateInterval / 1000) + 's');
        priceIntervalRanges.forEach(el => el.value = s.priceUpdateInterval / 1000);
    }
    if (s.columnWidths) {
        // columnWidths = s.columnWidths;
        // applyColumnWidths();
    }
    if (s.rankingLimit) {
        const rankingLimits = document.querySelectorAll('#rankingLimit');
        rankingLimits.forEach(el => el.value = s.rankingLimit);
        setRankingLimit(s.rankingLimit);
    }
    if (s.colorMaxLev) {
        const colorMaxLevs = document.querySelectorAll('#colorMaxLev');
        colorMaxLevs.forEach(el => el.value = s.colorMaxLev);
        setColorMaxLev(s.colorMaxLev);
    }
    if (s.chartHighLevSplit !== undefined) {
        const chartHighLevSplits = document.querySelectorAll('#chartHighLevSplit');
        chartHighLevSplits.forEach(el => el.value = s.chartHighLevSplit);
        setChartHighLevSplit(s.chartHighLevSplit);
    }
    if (s.activeWindow) {
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.window === s.activeWindow);
        });
    }
    if (s.sortKey) setSortKey(s.sortKey);
    if (s.sortDir) setSortDir(s.sortDir);
    if (s.chartHeight) {
        const section = document.getElementById('chart-section');
        if (section) {
            section.style.height = s.chartHeight + 'px';
        }
    }
    if (s.liqChartHeight) {
        const section = document.getElementById('liq-chart-section');
        if (section) {
            section.style.height = s.liqChartHeight + 'px';
        }
    }
    if (s.scatterChartState) setSavedScatterState(s.scatterChartState);
    if (s.liqChartState) setSavedLiqState(s.liqChartState);
    if (s.leverageColors) {
        setLeverageColors(s.leverageColors);
        const colorLongLow = document.querySelectorAll('#colorLongLow');
        const colorLongHigh = document.querySelectorAll('#colorLongHigh');
        const colorShortLow = document.querySelectorAll('#colorShortLow');
        const colorShortHigh = document.querySelectorAll('#colorShortHigh');
        colorLongLow.forEach(el => el.value = s.leverageColors.longLow || '#22c55e');
        colorLongHigh.forEach(el => el.value = s.leverageColors.longHigh || '#16a34a');
        colorShortLow.forEach(el => el.value = s.leverageColors.shortLow || '#ef4444');
        colorShortHigh.forEach(el => el.value = s.leverageColors.shortHigh || '#dc2626');
        
        // Update CSS variables with loaded colors
        document.documentElement.style.setProperty('--long-low-color', s.leverageColors.longLow || '#22c55e');
        document.documentElement.style.setProperty('--long-high-color', s.leverageColors.longHigh || '#16a34a');
        document.documentElement.style.setProperty('--short-low-color', s.leverageColors.shortLow || '#ef4444');
        document.documentElement.style.setProperty('--short-high-color', s.leverageColors.shortHigh || '#dc2626');
    } else {
        // Initialize CSS variables with default colors
        document.documentElement.style.setProperty('--long-low-color', '#22c55e');
        document.documentElement.style.setProperty('--long-high-color', '#16a34a');
        document.documentElement.style.setProperty('--short-low-color', '#ef4444');
        document.documentElement.style.setProperty('--short-high-color', '#dc2626');
    }
    if (s.columnWidth !== undefined) {
        setColumnWidth(s.columnWidth);
        // Sync both mobile and desktop controls
        const columnWidthInputs = document.querySelectorAll('#columnWidthInput');
        const columnWidthVals = document.querySelectorAll('#columnWidthVal');
        columnWidthInputs.forEach(el => el.value = s.columnWidth);
        columnWidthVals.forEach(el => el.textContent = s.columnWidth);
    }
    if (s.gridSpacing !== undefined) {
        setGridSpacing(s.gridSpacing);
        // Sync both mobile and desktop controls
        const gridSpacingRanges = document.querySelectorAll('#gridSpacingRange');
        const gridSpacingVals = document.querySelectorAll('#gridSpacingVal');
        gridSpacingRanges.forEach(el => el.value = s.gridSpacing);
        gridSpacingVals.forEach(el => el.textContent = s.gridSpacing);
    }
}
