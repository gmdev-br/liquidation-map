// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Events Initialization
// ═══════════════════════════════════════════════════════════

console.log('init.js loaded');

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
    updateBubbleSize, updateBubbleOpacity, updateAggregation, setChartModeHandler, updateChartHeight,
    updateLiqChartHeight, onCurrencyChange, openColumnCombobox, closeColumnComboboxDelayed,
    renderColumnDropdown as renderColumnDropdownFn, toggleColumn as toggleColumnFn, showAllColumns as showAllColumnsFn, hideAllColumns as hideAllColumnsFn, updateColumnSelectDisplay, applyColumnOrder,
    applyColumnWidths, applyColumnVisibility, toggleShowSymbols, updatePriceInterval, updateDecimalPlaces, updateFontSize, updateFontSizeKnown, updateLeverageColors
} from './handlers.js';
import { initColumnWidthControl, applyColumnWidth } from '../ui/columnWidth.js';
import { setWindow, setStatus, setProgress } from '../ui/status.js';
import { sortBy } from '../ui/filters.js';
import { CURRENCY_META } from '../config.js';

// ── Swipe Gestures for Navigation ──
function setupSwipeGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    const swipeThreshold = 50;
    
    function handleTouchStart(e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
    
    function handleTouchEnd(e) {
        if (!touchStartX || !touchStartY) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        
        // Only handle horizontal swipes
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > swipeThreshold) {
            // Check if we're on a tab element
            const target = e.target;
            const tab = target.closest('.tab');
            
            if (tab) {
                const tabs = Array.from(tab.parentElement.querySelectorAll('.tab'));
                const currentIndex = tabs.indexOf(tab);
                
                if (diffX > 0 && currentIndex > 0) {
                    // Swipe right - go to previous tab
                    tabs[currentIndex - 1].click();
                } else if (diffX < 0 && currentIndex < tabs.length - 1) {
                    // Swipe left - go to next tab
                    tabs[currentIndex + 1].click();
                }
            }
        }
        
        touchStartX = 0;
        touchStartY = 0;
    }
    
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);
}

// ── Pull-to-Refresh ──
function setupPullToRefresh() {
    let startY = 0;
    let isPulling = false;
    const pullThreshold = 100;
    const pullToRefresh = document.getElementById('pullToRefresh');
    
    if (!pullToRefresh) return;

    function handleTouchStart(e) {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
        }
    }

    function handleTouchMove(e) {
        if (window.scrollY !== 0) return;

        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0 && !isPulling) {
            isPulling = true;
        }

        if (isPulling && diff > 0) {
            e.preventDefault();
            const progress = Math.min(diff / pullThreshold, 1);
            pullToRefresh.style.transform = `translateY(${diff}px)`;
            
            if (progress >= 1) {
                pullToRefresh.classList.add('active');
            } else {
                pullToRefresh.classList.remove('active');
            }
        }
    }

    function handleTouchEnd() {
        if (!isPulling) return;

        const isActive = pullToRefresh.classList.contains('active');
        
        if (isActive) {
            // Trigger refresh
            window.location.reload();
        } else {
            // Reset
            pullToRefresh.style.transform = 'translateY(-100%)';
            pullToRefresh.classList.remove('active');
        }

        isPulling = false;
        startY = 0;
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
}

// ── Splash Screen ──
function setupSplashScreen() {
    const splashScreen = document.getElementById('splashScreen');
    if (!splashScreen) return;

    // Hide splash screen after page loads
    window.addEventListener('load', () => {
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 300);
        }, 1000);
    });
}

function setupEventListeners() {
    console.log('setupEventListeners called');
    // Setup click outside handler for comboboxes
    setupClickOutsideHandler();

    // Setup pull-to-refresh
    setupPullToRefresh();

    // Setup splash screen
    setupSplashScreen();

    // Setup swipe gestures
    setupSwipeGestures();

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
    const mobileMenuClose = document.getElementById('mobileMenuClose');

    function openMobileMenu() {
        mobileMenu.classList.add('active');
        mobileMenuOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
        mobileMenu.classList.remove('active');
        mobileMenuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', openMobileMenu);
    }

    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }

    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', closeMobileMenu);
    }

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileMenu();
        }
    });

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
            
            // Also add input event listener for number inputs to save as user types
            if (el.type === 'number') {
                el.addEventListener('input', () => {
                    saveSettings();
                });
            }
        }
    });

    // Show symbols toggle
    const btnShowSymMobile = document.getElementById('btnShowSymMobile');
    const btnShowSymDesktop = document.getElementById('btnShowSymDesktop');
    if (btnShowSymMobile) {
        btnShowSymMobile.addEventListener('click', toggleShowSymbols);
    }
    if (btnShowSymDesktop) {
        btnShowSymDesktop.addEventListener('click', toggleShowSymbols);
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
        bubbleSizeRange.addEventListener('input', (e) => {
            updateBubbleSize(e.target.value);
        });
    }

    // Bubble opacity
    const bubbleOpacityRange = document.getElementById('bubbleOpacityRange');
    if (bubbleOpacityRange) {
        bubbleOpacityRange.addEventListener('input', (e) => {
            updateBubbleOpacity(e.target.value);
        });
    }

    // Aggregation
    const aggregationRange = document.getElementById('aggregationRange');
    if (aggregationRange) {
        aggregationRange.addEventListener('input', (e) => {
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

    // Font size control
    console.log('Looking for fontSizeRange element...');
    const fontSizeRange = document.getElementById('fontSizeRange');
    console.log('fontSizeRange element:', fontSizeRange);
    if (fontSizeRange) {
        console.log('Adding event listeners to fontSizeRange (mobile)');
        fontSizeRange.addEventListener('input', (e) => {
            console.log('fontSize INPUT event fired:', e.target.value);
            updateFontSize(e.target.value);
        });
        fontSizeRange.addEventListener('change', (e) => {
            console.log('fontSize CHANGE event fired:', e.target.value);
            updateFontSize(e.target.value);
        });
        fontSizeRange.addEventListener('keyup', (e) => {
            console.log('fontSize KEYUP event fired:', e.target.value);
            updateFontSize(e.target.value);
        });
    } else {
        console.error('fontSizeRange element not found!');
    }

    // Font size control (desktop)
    const fontSizeRangeDesktop = document.getElementById('fontSizeRangeDesktop');
    console.log('fontSizeRangeDesktop element:', fontSizeRangeDesktop);
    if (fontSizeRangeDesktop) {
        console.log('Adding event listeners to fontSizeRangeDesktop');
        fontSizeRangeDesktop.addEventListener('input', (e) => {
            console.log('fontSizeDesktop INPUT event fired:', e.target.value);
            updateFontSize(e.target.value);
        });
        fontSizeRangeDesktop.addEventListener('change', (e) => {
            console.log('fontSizeDesktop CHANGE event fired:', e.target.value);
            updateFontSize(e.target.value);
        });
        fontSizeRangeDesktop.addEventListener('keyup', (e) => {
            console.log('fontSizeDesktop KEYUP event fired:', e.target.value);
            updateFontSize(e.target.value);
        });
    } else {
        console.error('fontSizeRangeDesktop element not found!');
    }

    // Font size for known addresses control
    console.log('Looking for fontSizeKnownRange element...');
    const fontSizeKnownRange = document.getElementById('fontSizeKnownRange');
    console.log('fontSizeKnownRange element:', fontSizeKnownRange);
    if (fontSizeKnownRange) {
        console.log('Adding event listeners to fontSizeKnownRange (mobile)');
        fontSizeKnownRange.addEventListener('input', (e) => {
            console.log('fontSizeKnown INPUT event fired:', e.target.value);
            updateFontSizeKnown(e.target.value);
        });
        fontSizeKnownRange.addEventListener('change', (e) => {
            console.log('fontSizeKnown CHANGE event fired:', e.target.value);
            updateFontSizeKnown(e.target.value);
        });
        fontSizeKnownRange.addEventListener('keyup', (e) => {
            console.log('fontSizeKnown KEYUP event fired:', e.target.value);
            updateFontSizeKnown(e.target.value);
        });
    } else {
        console.error('fontSizeKnownRange element not found!');
    }

    // Font size for known addresses control (desktop)
    const fontSizeKnownRangeDesktop = document.getElementById('fontSizeKnownRangeDesktop');
    console.log('fontSizeKnownRangeDesktop element:', fontSizeKnownRangeDesktop);
    if (fontSizeKnownRangeDesktop) {
        console.log('Adding event listeners to fontSizeKnownRangeDesktop');
        fontSizeKnownRangeDesktop.addEventListener('input', (e) => {
            console.log('fontSizeKnownDesktop INPUT event fired:', e.target.value);
            updateFontSizeKnown(e.target.value);
        });
        fontSizeKnownRangeDesktop.addEventListener('change', (e) => {
            console.log('fontSizeKnownDesktop CHANGE event fired:', e.target.value);
            updateFontSizeKnown(e.target.value);
        });
        fontSizeKnownRangeDesktop.addEventListener('keyup', (e) => {
            console.log('fontSizeKnownDesktop KEYUP event fired:', e.target.value);
            updateFontSizeKnown(e.target.value);
        });
    } else {
        console.error('fontSizeKnownRangeDesktop element not found!');
    }

    // Leverage color inputs
    const colorInputs = ['colorLongLow', 'colorLongHigh', 'colorShortLow', 'colorShortHigh'];
    colorInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', updateLeverageColors);
        }
    });

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

function applyColumnWidthAfterRender() {
    const width = document.getElementById('columnWidthInput')?.value || 100;
    console.log('applyColumnWidthAfterRender called with width:', width);
    applyColumnWidth(parseInt(width, 10));
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
    initColumnWidthControl();
}

async function loadInitialState() {
    console.log('loadInitialState: Starting...');
    loadTableData(setAllRows);

    // Initialize currency comboboxes FIRST before loading settings
    const currencyOptions = Object.keys(CURRENCY_META).map(ccy => ({
        value: ccy,
        label: ccy
    }));

    console.log('Initializing currency comboboxes with options:', currencyOptions);
    cbInit('currencySelect', currencyOptions, onCurrencyChange);
    cbInit('entryCurrencySelect', currencyOptions, onCurrencyChange);
    
    console.log('loadInitialState: Loading settings...');
    loadSettings();
    
    // Carregar preços atuais e taxas de câmbio antes de renderizar a tabela
    try {
        await Promise.all([
            fetchAllMids(),
            // Import fetchExchangeRates dynamically since it's not imported at the top
            import('../api/exchangeRates.js').then(m => m.fetchExchangeRates())
        ]);
    } catch (e) {
        console.error('Error fetching initial data:', e);
    }
    
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
    
    console.log('loadInitialState: Rendering table...');
    renderTable();

    // Apply column width after table is rendered
    setTimeout(applyColumnWidthAfterRender, 100);

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

    // Currency comboboxes already initialized above in loadInitialState()

    // Set initial values from state
    const btnShowSymMobile = document.getElementById('btnShowSymMobile');
    const btnShowSymDesktop = document.getElementById('btnShowSymDesktop');
    const showSymbols = getShowSymbols();
    if (btnShowSymMobile) {
        btnShowSymMobile.textContent = showSymbols ? 'Sim' : 'Não';
        btnShowSymMobile.classList.toggle('active', showSymbols);
    }
    if (btnShowSymDesktop) {
        btnShowSymDesktop.textContent = showSymbols ? 'On' : 'Off';
        btnShowSymDesktop.classList.toggle('active', showSymbols);
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
