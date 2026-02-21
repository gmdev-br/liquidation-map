// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — UI Table
// ═══════════════════════════════════════════════════════════

import {
    getAllRows, getDisplayedRows, getSelectedCoins, getActiveCurrency,
    getActiveEntryCurrency, getShowSymbols, getSortKey, getSortDir,
    getVisibleColumns, getColumnOrder, setDisplayedRows, getCurrentPrices, getFxRates, getChartHighLevSplit, getFontSize, getFontSizeKnown, getDecimalPlaces, getMinBtcVolume, getScanning,
    getWhaleMeta
} from '../state.js';
import { convertToActiveCcy } from '../utils/currency.js';
import { fmt, fmtUSD, fmtAddr, fmtCcy } from '../utils/formatters.js';
import { getCorrelatedPrice, getCorrelatedEntry } from '../utils/currency.js';
import { CURRENCY_META } from '../config.js';
import { saveSettings } from '../storage/settings.js';
import { renderScatterPlot } from '../charts/scatter.js';
import { renderLiqScatterPlot } from '../charts/liquidation.js';
import { setupColumnDragAndDrop } from '../events/handlers.js';
import { updateRankingPanel } from './panels.js';
import { debounce, Cache } from '../utils/performance.js';
import { enableVirtualScroll } from '../utils/virtualScroll.js';
import { renderAggregationTable } from './aggregation.js';

// Cache for filtered data to avoid recomputing
const filterCache = new Cache(5000);

// Debounced render function to reduce DOM updates
const debouncedRenderTable = debounce(() => {
    _renderTableInternal();
}, 300);

// Virtual scroll instance
let virtualScrollManager = null;

function reorderTableHeadersAndFilters(columnOrder) {
    const headerRow = document.querySelector('thead tr');
    if (!headerRow) return;

    // Get all header cells
    const headers = Array.from(headerRow.querySelectorAll('th'));
    const filterRow = document.querySelector('.filter-row');
    const filterHeaders = filterRow ? Array.from(filterRow.querySelectorAll('th')) : [];

    // Create a map of column key to header element
    const headerMap = {};
    const filterHeaderMap = {};

    headers.forEach(th => {
        const colKey = th.id.replace('th-', '');
        headerMap[`col-${colKey}`] = th;
    });

    filterHeaders.forEach(th => {
        const classes = Array.from(th.classList);
        const colClass = classes.find(cls => cls.startsWith('col-'));
        if (colClass) {
            filterHeaderMap[colClass] = th;
        }
    });

    // Clear header row
    headerRow.innerHTML = '';
    if (filterRow) {
        filterRow.innerHTML = '';
    }

    // Reorder headers based on columnOrder
    columnOrder.forEach(colKey => {
        if (headerMap[colKey]) {
            headerRow.appendChild(headerMap[colKey]);
        }
        if (filterRow && filterHeaderMap[colKey]) {
            filterRow.appendChild(filterHeaderMap[colKey]);
        }
    });
}

export function updateStats(showSymbols, allRows) {
    const whaleMeta = getWhaleMeta();

    const whalesWithPos = new Set();
    const whalesLong = new Set();
    const whalesShort = new Set();
    let totalUpnl = 0;
    let upnlLong = 0;
    let upnlShort = 0;
    let positionsLongCount = 0;
    let positionsShortCount = 0;

    for (let i = 0; i < allRows.length; i++) {
        const r = allRows[i];
        whalesWithPos.add(r.address);
        totalUpnl += r.unrealizedPnl;
        if (r.side === 'long') {
            whalesLong.add(r.address);
            upnlLong += r.unrealizedPnl;
            positionsLongCount++;
        } else if (r.side === 'short') {
            whalesShort.add(r.address);
            upnlShort += r.unrealizedPnl;
            positionsShortCount++;
        }
    }

    let totalCap = 0;
    let capLong = 0;
    let capShort = 0;
    let largest = 0;

    whalesWithPos.forEach(addr => {
        const meta = whaleMeta[addr];
        const val = meta?.accountValue || 0;
        totalCap += val;
        if (val > largest) largest = val;
        if (whalesLong.has(addr)) capLong += val;
        if (whalesShort.has(addr)) capShort += val;
    });

    // Update Overall Stats
    document.getElementById('sWhales').textContent = new Intl.NumberFormat('en-US').format(whalesWithPos.size);
    document.getElementById('sPositions').textContent = new Intl.NumberFormat('en-US').format(allRows.length);
    const sym = showSymbols ? '$' : '';
    document.getElementById('sCapital').textContent = sym + fmt(totalCap);
    const upnlEl = document.getElementById('sUpnl');
    upnlEl.textContent = fmtUSD(totalUpnl);
    upnlEl.className = 'stat-value ' + (totalUpnl >= 0 ? 'green' : 'red');
    document.getElementById('sLargest').textContent = sym + fmt(largest);

    // Update Long/Short Breakdowns
    document.getElementById('sWhalesLong').textContent = `L: ${whalesLong.size}`;
    document.getElementById('sWhalesShort').textContent = `S: ${whalesShort.size}`;
    document.getElementById('sPositionsLong').textContent = `L: ${positionsLongCount}`;
    document.getElementById('sPositionsShort').textContent = `S: ${positionsShortCount}`;
    document.getElementById('sCapitalLong').textContent = `L: ${sym}${fmt(capLong)}`;
    document.getElementById('sCapitalShort').textContent = `S: ${sym}${fmt(capShort)}`;
    document.getElementById('sUpnlLong').textContent = `L: ${fmtUSD(upnlLong)}`;
    document.getElementById('sUpnlShort').textContent = `S: ${fmtUSD(upnlShort)}`;
}

// Internal render function - does the actual work
function _renderTableInternal() {
    console.log('renderTable: Starting...');
    function renderCharts() {
        renderScatterPlot();
        renderLiqScatterPlot();
    }
    const allRows = getAllRows();
    const whaleMeta = getWhaleMeta();
    console.log('renderTable: allRows count:', allRows.length);
    const selectedCoins = getSelectedCoins();
    console.log('renderTable: selectedCoins:', selectedCoins);
    const activeCurrency = getActiveCurrency();
    const activeEntryCurrency = getActiveEntryCurrency();
    const showSymbols = getShowSymbols();
    const sortKey = getSortKey();
    const sortDir = getSortDir();
    const visibleColumns = getVisibleColumns();
    const columnOrder = getColumnOrder();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const decimalPlaces = getDecimalPlaces();

    // Reorder table headers first
    reorderTableHeadersAndFilters(columnOrder);

    const sideFilter = document.getElementById('sideFilter').value;
    const addressFilter = document.getElementById('addressFilter').value.trim().toLowerCase();
    const addressFilterRegex = addressFilter ? new RegExp(addressFilter, 'i') : null;
    const minLev = parseFloat(document.getElementById('minLev').value);
    const maxLev = parseFloat(document.getElementById('maxLev').value);
    const minSize = parseFloat(document.getElementById('minSize').value);
    const minFunding = parseFloat(document.getElementById('minFunding').value);
    const levTypeFilter = document.getElementById('levTypeFilter').value;

    const minSzi = parseFloat(document.getElementById('minSzi').value);
    const maxSzi = parseFloat(document.getElementById('maxSzi').value);
    const minValueCcy = parseFloat(document.getElementById('minValueCcy').value);
    const maxValueCcy = parseFloat(document.getElementById('maxValueCcy').value);
    const minEntryCcy = parseFloat(document.getElementById('minEntryCcy').value);
    const maxEntryCcy = parseFloat(document.getElementById('maxEntryCcy').value);
    const minUpnl = parseFloat(document.getElementById('minUpnl').value);
    const maxUpnl = parseFloat(document.getElementById('maxUpnl').value);

    // Create cache key for filter state
    // NOTE: allRows.length is included so the cache is invalidated when data loads after an
    // initial empty render (e.g., loadSettings triggering renderTable before loadTableData).
    const cacheKey = JSON.stringify({
        dataLen: allRows.length,
        selectedCoins,
        addressFilter,
        sideFilter,
        minLev,
        maxLev,
        minSize,
        minFunding,
        levTypeFilter,
        minSzi,
        maxSzi,
        minValueCcy,
        maxValueCcy,
        minEntryCcy,
        maxEntryCcy,
        minUpnl,
        maxUpnl,
        sortKey: getSortKey(),
        sortDir: getSortDir()
    });

    // Check cache first
    let rows;
    if (filterCache.has(cacheKey)) {
        rows = filterCache.get(cacheKey);
        console.log('Using cached filtered rows:', rows.length);
    } else {
        // Filter rows
        rows = allRows.filter(r => {
            if (selectedCoins.length > 0 && !selectedCoins.includes(r.coin)) return false;
            if (addressFilterRegex) {
                const addr = r.address;
                const meta = whaleMeta[addr];
                const disp = meta?.displayName || '';
                if (!addressFilterRegex.test(addr) && !addressFilterRegex.test(disp)) return false;
            }
            if (sideFilter && r.side !== sideFilter) return false;
            if (!isNaN(minLev) && r.leverageValue < minLev) return false;
            if (!isNaN(maxLev) && r.leverageValue > maxLev) return false;
            if (!isNaN(minSize) && r.positionValue < minSize) return false;
            if (!isNaN(minFunding) && Math.abs(r.funding) < minFunding) return false;
            if (levTypeFilter && r.leverageType !== levTypeFilter) return false;

            if (!isNaN(minSzi) && Math.abs(r.szi) < minSzi) return false;
            if (!isNaN(maxSzi) && Math.abs(r.szi) > maxSzi) return false;

            const valCcy = convertToActiveCcy(r.positionValue, null, activeCurrency, fxRates);
            if (!isNaN(minValueCcy) && valCcy < minValueCcy) return false;
            if (!isNaN(maxValueCcy) && valCcy > maxValueCcy) return false;

            const entCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
            if (!isNaN(minEntryCcy) && entCcy < minEntryCcy) return false;
            if (!isNaN(maxEntryCcy) && entCcy > maxEntryCcy) return false;

            if (!isNaN(minUpnl) && r.unrealizedPnl < minUpnl) return false;
            if (!isNaN(maxUpnl) && r.unrealizedPnl > maxUpnl) return false;

            return true;
        });

        // Sort
        const sortKey = getSortKey();
        const sortDir = getSortDir();
        rows.sort((a, b) => {
            let va, vb;
            if (sortKey === 'coin') {
                return sortDir * a.coin.localeCompare(b.coin);
            } else if (sortKey === 'funding') {
                va = a.funding; vb = b.funding;
            } else if (sortKey === 'valueCcy') {
                va = convertToActiveCcy(a.positionValue, null, activeCurrency, fxRates);
                vb = convertToActiveCcy(b.positionValue, null, activeCurrency, fxRates);
            } else if (sortKey === 'entryCcy') {
                va = getCorrelatedEntry(a, activeEntryCurrency, currentPrices, fxRates);
                vb = getCorrelatedEntry(b, activeEntryCurrency, currentPrices, fxRates);
            } else if (sortKey === 'liqPx') {
                va = a.liquidationPx > 0 ? getCorrelatedPrice(a, a.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;
                vb = b.liquidationPx > 0 ? getCorrelatedPrice(b, b.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;
            } else {
                va = a[sortKey] ?? 0;
                vb = b[sortKey] ?? 0;
            }
            return sortDir * (vb - va);
        });

        // Cache the result
        filterCache.set(cacheKey, rows);
    }

    setDisplayedRows(rows);

    // Only update charts if not scanning
    if (!getScanning()) {
        try {
            renderCharts(); // Update chart with filtered rows
        } catch (err) {
            console.error('renderCharts error (non-fatal):', err);
        }
    }

    // Update statistics with filtered rows
    try {
        updateStats(showSymbols, rows);
    } catch (err) {
        console.error('updateStats error (non-fatal):', err);
    }

    const tbody = document.getElementById('tableBody');

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="empty-cell"><div class="empty-icon">🔍</div><div>No positions match the current filters.</div></td></tr>`;
        return;
    }

    // Use virtual scrolling for large datasets
    if (!virtualScrollManager) {
        virtualScrollManager = enableVirtualScroll(100);
    }

    // Row renderer function
    const rowRenderer = (r, i) => {
        const meta = whaleMeta[r.address] || {};
        const side = r.side;
        const pnlClass = r.unrealizedPnl >= 0 ? 'green' : 'red';
        const fundClass = r.funding >= 0 ? 'green' : 'red';

        // Calculate BTC volume (Value BTC = positionValue / btcPrice)
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        const volBTC = btcPrice > 0 ? r.positionValue / btcPrice : 0;

        // Get min BTC volume setting from state
        const minBtcVolume = getMinBtcVolume();

        // Check if wallet should be highlighted (either displayName or high BTC volume)
        const isHighlighted = meta.displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume);

        // Get font sizes
        const fontSize = getFontSize();
        const fontSizeKnown = getFontSizeKnown();
        const rowFontSize = isHighlighted ? fontSizeKnown : fontSize;
        const rowFontStyle = `font-size: ${rowFontSize}px`;

        // Leverage label
        const levType = r.leverageType === 'isolated' ? 'Isolated' : 'Cross';
        const levLabel = `${r.leverageValue}x ${levType}`;

        // Determine leverage badge color class
        const highLevSplit = getChartHighLevSplit();
        const isHighLev = Math.abs(r.leverageValue) >= highLevSplit;
        const levClass = `${side}-${isHighLev ? 'high' : 'low'}`;

        // Liquidation Price (Correlated)
        const liqPrice = r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;
        let liqPriceFormatted = '—';
        if (r.liquidationPx > 0) {
            const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
            const sym = showSymbols ? entMeta.symbol : '';
            liqPriceFormatted = sym + liqPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // Distance to liq
        let distHtml = '<span class="muted">—</span>';
        if (r.distPct !== null) {
            const pct = r.distPct;
            const barClass = pct > 30 ? 'safe' : pct > 10 ? 'warn' : 'danger';
            const barW = Math.min(pct, 100).toFixed(0);
            const liqStr = r.liquidationPx > 0 ? (showSymbols ? '$' : '') + r.liquidationPx.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
            distHtml = `
            <div class="liq-cell">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                    <span class="liq-pct ${barClass === 'safe' ? 'green' : barClass === 'warn' ? '' : 'red'}" style="${barClass === 'warn' ? 'color:var(--orange)' : ''}">${pct.toFixed(0)}%</span>
                    <span class="liq-price">${liqStr}</span>
                </div>
                <div class="liq-bar-wrap"><div class="liq-bar ${barClass}" style="width:${barW}%"></div></div>
            </div>`;
        }

        // Size display: show absolute value + coin
        const absSzi = Math.abs(r.szi);
        const sziStr = absSzi.toFixed(decimalPlaces);

        const ccyVal = convertToActiveCcy(r.positionValue, null, activeCurrency, fxRates);
        const ccyStr = fmtCcy(ccyVal, null, activeCurrency, showSymbols);

        const entVal = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
        let entStr = '';
        const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
        const sym = showSymbols ? entMeta.symbol : '';
        entStr = sym + entVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const usdSym = showSymbols ? '$' : '';

        // Cell Renderers Map
        const cells = {
            'col-num': `<td class="muted col-num" style="font-size:11px">${i + 1}</td>`,
            'col-address': `<td class="col-address ${levClass}" style="${rowFontStyle}">
                <div class="addr-cell">
                    ${isHighlighted ? `<span class="addr-avatar-star ${levClass}">★</span>` : `<div class="addr-avatar">${(meta.displayName || r.address).slice(0, 2).toUpperCase()}</div>`}
                    <div>
                        <a class="addr-link" href="https://app.hyperliquid.xyz/explorer/address/${r.address}" target="_blank">
                            <div class="addr-text">${fmtAddr(r.address)}</div>
                        </a>
                        ${meta.displayName ? `<div class="addr-name">${meta.displayName}</div>` : ''}
                    </div>
                </div>
            </td>`,
            'col-coin': `<td class="col-coin" style="${rowFontStyle}">
                <span class="coin-badge ${levClass}">${r.coin} ${side === 'long' ? '▲' : '▼'}</span>
            </td>`,
            'col-szi': `<td class="mono col-szi ${levClass}" style="${rowFontStyle}">${sziStr}</td>`,
            'col-leverage': `<td class="col-leverage" style="${rowFontStyle}"><span class="lev-badge ${levClass}">${levLabel}</span></td>`,
            'col-positionValue': `<td class="mono col-positionValue ${levClass}" style="${rowFontStyle}">${usdSym}${fmt(r.positionValue)}</td>`,
            'col-valueCcy': `<td class="mono col-valueCcy ${levClass}" style="${isHighlighted ? 'font-weight:600;' : ''}${rowFontStyle}">${ccyStr}</td>`,
            'col-entryPx': `<td class="mono col-entryPx ${levClass}" style="${rowFontStyle}">${r.entryPx.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>`,
            'col-entryCcy': `<td class="mono col-entryCcy ${levClass}" style="${isHighlighted ? 'font-weight:600;' : ''}${rowFontStyle}">${entStr}</td>`,
            'col-unrealizedPnl': `<td class="mono col-unrealizedPnl ${pnlClass}" style="${isHighlighted ? 'font-weight:600;' : ''}${rowFontStyle}">${fmtUSD(r.unrealizedPnl)}</td>`,
            'col-funding': `<td class="mono col-funding ${fundClass}" style="${rowFontStyle}">${fmtUSD(r.funding)}</td>`,
            'col-liqPx': `<td class="mono col-liqPx ${levClass}" style="${isHighlighted ? 'font-weight:600;' : ''}${rowFontStyle}">${liqPriceFormatted}</td>`,
            'col-distToLiq': `<td class="col-distToLiq ${levClass}" style="${rowFontStyle}">${distHtml}</td>`,
            'col-accountValue': `<td class="mono col-accountValue ${levClass}" style="${rowFontStyle}">${usdSym}${fmt(meta.accountValue || 0)}</td>`
        };

        // Filter cells based on visible columns
        const visibleColumns = getVisibleColumns();
        let filteredCells = {};

        if (visibleColumns.length === 0) {
            // All columns visible
            filteredCells = cells;
        } else {
            // Only specified columns visible
            visibleColumns.forEach(colKey => {
                if (cells[colKey]) {
                    filteredCells[colKey] = cells[colKey];
                }
            });
        }

        return `<tr class="${meta.displayName ? 'row-known-address' : ''}">
            ${columnOrder.filter(Key => filteredCells[Key]).map(Key => filteredCells[Key]).join('')}
        </tr>`;
    };

    // Render using virtual scroll or traditional method
    virtualScrollManager.render(rows, rowRenderer);

    // Update ranking panel after rendering table (async)
    updateRankingPanel();

    // Render aggregation table based on filtered rows
    renderAggregationTable();

    // Apply column widths after table is rendered
    applyColumnWidthAfterRender();

    // Setup drag and drop for column reordering only once
    if (!document.querySelector('.dragging-initialized')) {
        setTimeout(() => {
            setupColumnDragAndDrop();
        }, 100);
    }
}

// Public renderTable function - debounced version
export function renderTable() {
    debouncedRenderTable();
}

// Force immediate render (for cases where debouncing is not desired)
export function renderTableImmediate() {
    _renderTableInternal();
}

// Apply column widths after table is rendered
function applyColumnWidthAfterRender() {
    const table = document.querySelector('table');
    if (table) {
        table.style.tableLayout = 'auto';
    }

    const headers = document.querySelectorAll('th[id^="th-"]');
    headers.forEach(th => {
        const savedWidth = localStorage.getItem(`col-width-${th.id}`);
        if (savedWidth) {
            th.style.width = savedWidth + 'px';
            th.style.minWidth = savedWidth + 'px';
            th.style.maxWidth = savedWidth + 'px';
        }
    });
}
