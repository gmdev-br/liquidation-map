// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Aggregation Table
// ═══════════════════════════════════════════════════════════

import { getDisplayedRows, getCurrentPrices, getFxRates, getActiveEntryCurrency, getAggInterval, getAggVolumeUnit, getShowAggSymbols, getAggZoneColors, getAggHighlightColor } from '../state.js';
import { getCorrelatedEntry } from '../utils/currency.js';
import { fmtUSD, fmtCcy } from '../utils/formatters.js';
import { enableVirtualScroll } from '../utils/virtualScroll.js';

let lastRenderedBand = null;
let lastRenderedUnit = null;
let lastRenderedInterval = null;
let lastRenderedRowCount = 0;
let lastRenderedColorsStr = '';
let aggVirtualScrollManager = null;
let currentPriceRangeIndex = -1; // Track index for the floating button

export function renderAggregationTable(force = false) {
    const aggSection = document.getElementById('aggSectionWrapper');
    const isCollapsed = aggSection?.classList.contains('collapsed');

    // Optimization: Skip rendering if collapsed, unless forced (e.g. initial load or search)
    if (isCollapsed && !force) {
        return;
    }

    const rows = getDisplayedRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeEntryCurrency = getActiveEntryCurrency();
    const aggVolumeUnit = getAggVolumeUnit();
    const showAggSymbols = getShowAggSymbols();
    const aggZoneColors = getAggZoneColors();
    const aggHighlightColor = getAggHighlightColor();
    const bandSize = getAggInterval();
    const btcPrice = currentPrices['BTC'] ? parseFloat(currentPrices['BTC']) : 0;

    // Build current band identity
    const currentBand = btcPrice > 0 ? Math.floor(btcPrice / bandSize) * bandSize : 0;
    const colorsStr = JSON.stringify(aggZoneColors || {});

    // Optimization: Skip rendering if data hasn't significantly changed
    if (!force &&
        lastRenderedBand === currentBand &&
        lastRenderedUnit === aggVolumeUnit &&
        lastRenderedInterval === bandSize &&
        lastRenderedRowCount === rows.length &&
        lastRenderedColorsStr === colorsStr) {
        return;
    }

    if (!rows || rows.length === 0) {
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="13" class="empty-cell">Sem dados disponíveis.</td></tr>';
        document.getElementById('aggStatsBar').innerHTML = '';
        lastRenderedRowCount = 0;
        return;
    }

    // Update state tracking
    lastRenderedBand = currentBand;
    lastRenderedUnit = aggVolumeUnit;
    lastRenderedInterval = bandSize;
    lastRenderedRowCount = rows.length;
    lastRenderedColorsStr = colorsStr;

    const bands = {};

    let totalLongNotional = 0;
    let totalShortNotional = 0;
    let posCount = rows.length;
    let bandsWithPosCount = 0;

    // Build bands map
    for (const r of rows) {
        // Calculate correlated entry price
        const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);

        if (isNaN(entryCcy) || entryCcy <= 0) continue;

        // Determine band
        const bandDown = Math.floor(entryCcy / bandSize) * bandSize;

        if (!bands[bandDown]) {
            bands[bandDown] = {
                faixaDe: bandDown,
                faixaAte: bandDown + bandSize,
                qtdLong: 0,
                notionalLong: 0,
                qtdShort: 0,
                notionalShort: 0,
                ativosLong: new Set(),
                ativosShort: new Set()
            };
        }

        const b = bands[bandDown];
        const val = r.positionValue; // USD value

        if (r.side === 'long') {
            b.qtdLong++;
            b.notionalLong += val;
            b.ativosLong.add(r.coin);
            totalLongNotional += val;
        } else if (r.side === 'short') {
            b.qtdShort++;
            b.notionalShort += val;
            b.ativosShort.add(r.coin);
            totalShortNotional += val;
        }
    }

    // Convert bands to array and sort descending
    const bandArray = Object.values(bands).sort((a, b) => b.faixaDe - a.faixaDe);
    bandsWithPosCount = bandArray.length;

    // Calculate max and min bands to fill "vacuos" (empty bands)
    if (bandArray.length > 0) {
        const maxBand = bandArray[0].faixaDe;
        const minBand = bandArray[bandArray.length - 1].faixaDe;
        const totalBands = Math.floor((maxBand - minBand) / bandSize) + 1;

        // Create full array including vacuos
        const fullBandArray = [];
        let vacuosCount = 0;

        for (let base = maxBand; base >= minBand; base -= bandSize) {
            fullBandArray.push(bands[base] || {
                faixaDe: base,
                faixaAte: base + bandSize,
                qtdLong: 0,
                notionalLong: 0,
                qtdShort: 0,
                notionalShort: 0,
                ativosLong: new Set(),
                ativosShort: new Set(),
                isEmpty: true
            });
            if (!bands[base]) vacuosCount++;
        }

        // Top Stats
        const ratioLS = totalShortNotional > 0 ? (totalLongNotional / totalShortNotional).toFixed(3) : '∞';
        const statsHtml = `
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Long Total <span style="color:#22c55e;font-weight:700;font-family:monospace">${fmtUsdCompact(totalLongNotional)}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Short Total <span style="color:#ef4444;font-weight:700;font-family:monospace">${fmtUsdCompact(totalShortNotional)}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Ratio L/S <span style="color:#60a5fa;font-weight:700">${ratioLS}x</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Posições <span style="font-weight:700">${posCount}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">c/ Posições <span style="color:#22c55e;font-weight:700">${bandsWithPosCount}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Vácuos <span style="color:#6b7280;font-weight:700">${vacuosCount}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Total faixas <span style="font-weight:700">${totalBands}</span></div>
        `;
        document.getElementById('aggStatsBar').innerHTML = statsHtml;

        // Render rows
        // Render rows using Virtual Scroll
        const currentBtcPos = btcPrice > 0 ? btcPrice : 0;

        if (!aggVirtualScrollManager) {
            // Threshold is low because aggregation rows have heavy styling
            // Row height is ~36px instead of 52px
            aggVirtualScrollManager = enableVirtualScroll('aggTableBody', { threshold: 40, rowHeight: 36 });
        }

        const rowRenderer = (b, index) => {
            const totalNotional = b.notionalLong + b.notionalShort;
            const isEmpty = b.isEmpty;

            const isCurrentPriceRange = currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte;

            let domType = 'VACUO';
            let domPct = 0;
            let domBg = '';
            let domColor = '#6b7280';
            let colorLong = '#4b5563';
            let colorShort = '#4b5563';

            if (totalNotional > 0) {
                if (b.notionalLong > b.notionalShort) {
                    domType = 'COMPRA';
                    const isForte = b.notionalLong >= 30_000_000;
                    domColor = isForte ? aggZoneColors.buyStrong : aggZoneColors.buyNormal;
                    domBg = isForte ? `rgba(${hexToRgb(aggZoneColors.buyStrong)}, 0.1)` : `rgba(${hexToRgb(aggZoneColors.buyNormal)}, 0.05)`;
                    domPct = (b.notionalLong / totalNotional) * 100;
                } else if (b.notionalShort > b.notionalLong) {
                    domType = 'VENDA';
                    const isForte = b.notionalShort >= 30_000_000;
                    domColor = isForte ? aggZoneColors.sellStrong : aggZoneColors.sellNormal;
                    domBg = isForte ? `rgba(${hexToRgb(aggZoneColors.sellStrong)}, 0.1)` : `rgba(${hexToRgb(aggZoneColors.sellNormal)}, 0.05)`;
                    domPct = (b.notionalShort / totalNotional) * 100;
                } else {
                    domType = 'NEUTRO';
                    domColor = '#9ca3af';
                    domPct = 50;
                }
            }

            let intType = '—';
            let intColor = '#6b7280';
            const isWeakIntensity = totalNotional < 10_000_000; // FRACA ou MUITO FRACA
            if (totalNotional >= 100_000_000) { intType = 'EXTREMA >100M'; intColor = '#f59e0b'; } // Orange
            else if (totalNotional >= 30_000_000) { intType = 'FORTE >30M'; intColor = '#22c55e'; }   // Green
            else if (totalNotional >= 10_000_000) { intType = 'MEDIA >10M'; intColor = '#60a5fa'; }  // Blue
            else if (totalNotional > 3_000_000) { intType = 'FRACA >3M'; intColor = '#9ca3af'; }  // Gray/light blue
            else if (totalNotional > 0) { intType = 'MUITO FRACA'; intColor = '#4b5563'; }

            let zoneType = isEmpty ? 'Zona Vazia' : '—';
            let zoneColor = '#4b5563';
            if (!isEmpty) {
                const isForteLong = b.notionalLong >= 30_000_000;
                const isForteShort = b.notionalShort >= 30_000_000;
                const isForteTotal = totalNotional >= 30_000_000;
                // Strong Buy/Sell only if intensity is NOT weak (Total Notional >= 10M)
                const isForteZone = (domPct === 100 || isForteTotal) && totalNotional >= 10_000_000;
                const baseStr = domType === 'COMPRA' ? 'Compra' : domType === 'VENDA' ? 'Venda' : 'Neutro';

                if (domPct === 50) {
                    zoneType = 'Indecisão';
                    zoneColor = '#9ca3af';
                } else {
                    if (isForteZone) {
                        zoneType = baseStr + ' Forte';
                        zoneColor = domType === 'COMPRA' ? aggZoneColors.buyStrong : aggZoneColors.sellStrong;
                    } else {
                        zoneType = baseStr + ' Normal';
                        zoneColor = domType === 'COMPRA' ? aggZoneColors.buyNormal : aggZoneColors.sellNormal;
                    }
                }

                // Apply colors consistently to all directional cells based on row-level Forte status
                colorLong = b.notionalLong > 0 ? (isForteZone ? aggZoneColors.buyStrong : aggZoneColors.buyNormal) : '#4b5563';
                colorShort = b.notionalShort > 0 ? (isForteZone ? aggZoneColors.sellStrong : aggZoneColors.sellNormal) : '#4b5563';

                // Update DOM color to match row-level Forte status
                domColor = domType === 'COMPRA' ? (isForteZone ? aggZoneColors.buyStrong : aggZoneColors.buyNormal) :
                    domType === 'VENDA' ? (isForteZone ? aggZoneColors.sellStrong : aggZoneColors.sellNormal) : '#6b7280';
                domBg = isForteZone ? `rgba(${hexToRgb(domColor)}, 0.1)` : `rgba(${hexToRgb(domColor)}, 0.05)`;
            } else {
                colorLong = '#4b5563';
                colorShort = '#4b5563';
                domBg = '';
                domColor = '#6b7280';
            }

            // Remove all highlights for weak intensity (FRACA or MUITO FRACA)
            let totalNotionalColor = '#bfdbfe';
            let fwBold = '700';
            let fwSemi = '600';

            // Apply Strong Highlight to all columns if it is a strong zone
            // or if it has Medium/Strong/Extreme Intensity (>= 10M)
            if (!isEmpty && (domPct === 100 || totalNotional >= 10_000_000)) {
                // We use isForteZone just for reference if needed, but apply style based on intensity
                // The condition totalNotional >= 10M covers Medium (10-30), Strong (30-100), Extreme (100+)
                if (totalNotional >= 10_000_000 && domType !== 'NEUTRO') {
                    // Use the dominant color for all key metrics
                    totalNotionalColor = domColor;
                    intColor = domColor;
                    // Ensure bold weight
                    fwBold = '700';
                    fwSemi = '700';
                }
            }

            if (isWeakIntensity && !isEmpty) {
                colorLong = '#4b5563';
                colorShort = '#4b5563';
                domColor = '#6b7280';
                zoneColor = '#4b5563';
                intColor = '#4b5563';
                totalNotionalColor = '#6b7280';
                domBg = '';
                fwBold = '400';
                fwSemi = '400';
            }

            const formatVal = (v) => {
                if (v === 0) return '—';
                if (aggVolumeUnit === 'BTC' && btcPrice > 0) {
                    const btcVal = v / btcPrice;
                    const sym = showAggSymbols ? '₿' : '';
                    return sym + (btcVal >= 1000 ? (btcVal / 1000).toFixed(1) + 'K' : btcVal.toFixed(2));
                }
                return fmtUsdCompact(v, showAggSymbols);
            };
            const formatQty = (v) => v > 0 ? v : '—';

            const longCol = colorLong;
            const shortCol = colorShort;

            const trStyle = isEmpty ? 'opacity:0.6;background:transparent' : '';
            const valBg = (totalNotional >= 10_000_000 && !isWeakIntensity) ? 'background:rgba(59,130,246,0.1)' : '';

            let highlightStyle = '';
            if (isCurrentPriceRange) {
                // Convert hex to rgba with 0.2 opacity for background
                const hexColor = aggHighlightColor || '#facc15';
                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);
                highlightStyle = `background:rgba(${r},${g},${b},0.2); border:1px solid ${hexColor}; box-shadow:inset 0 0 10px rgba(${r},${g},${b},0.2)`;
            }

            const trClass = isCurrentPriceRange ? 'active-price-range' : '';
            const expectedStyle = `${trStyle}; ${highlightStyle}`.trim().replace(/^; | ;$/g, '');

            const newContent = `
                <td style="font-family:monospace; font-weight:700; color:${isCurrentPriceRange ? '#fff' : '#d1d5db'}">
                    ${isCurrentPriceRange ? `<div style="font-size:10px; color:${aggHighlightColor}; margin-bottom:2px">BTC $${btcPrice.toLocaleString()}</div>` : ''}
                    $${b.faixaDe.toLocaleString()}
                </td>
                <td style="font-family:monospace; color:#9ca3af">$${b.faixaAte.toLocaleString()}</td>
                <td style="color:${longCol}; text-align:center">${formatQty(b.qtdLong)}</td>
                <td style="color:${longCol}; font-family:monospace; font-weight:${b.notionalLong > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalLong)}</td>
                <td style="color:${shortCol}; text-align:center">${formatQty(b.qtdShort)}</td>
                <td style="color:${shortCol}; font-family:monospace; font-weight:${b.notionalShort > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalShort)}</td>
                <td style="font-family:monospace; color:${totalNotionalColor}; font-weight:${fwSemi}; ${valBg}">${formatVal(totalNotional)}</td>
                <td style="color:${domColor}; font-weight:${fwBold}; background:${domBg}">${domType}</td>
                <td style="color:${domColor}; font-weight:${fwBold}; background:${domBg}">${domPct > 0 ? domPct.toFixed(1) + '%' : '—'}</td>
                <td style="color:${intColor}; font-size:11px; font-weight:${fwSemi}">${intType}</td>
                <td style="color:${zoneColor}; font-weight:${fwSemi}">${zoneType}</td>
                <td style="color:${longCol}; font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosLong).join(', ')}">${Array.from(b.ativosLong).join(', ')}</td>
                <td style="color:${shortCol}; font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosShort).join(', ')}">${Array.from(b.ativosShort).join(', ')}</td>
            `;

            return `<tr class="${trClass}" style="${expectedStyle}">${newContent}</tr>`;
        };

        // Update current price range index for the scroll button
        currentPriceRangeIndex = fullBandArray.findIndex(b => currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte);

        aggVirtualScrollManager.render(fullBandArray, rowRenderer);
    } else {
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="13" class="empty-cell">Sem dados disponíveis.</td></tr>';
    }
}

/**
 * Scrolls the aggregation table to the current price range row
 */
export function scrollToCurrentPriceRange() {
    if (aggVirtualScrollManager && currentPriceRangeIndex !== -1) {
        aggVirtualScrollManager.scrollToIndex(currentPriceRangeIndex);
    }
}

function fmtUsdCompact(val, showSymbol = true) {
    if (val === 0) return showSymbol ? '$0' : '0';
    const sym = showSymbol ? '$' : '';
    if (val >= 1_000_000_000) return sym + (val / 1_000_000_000).toFixed(2) + 'B';
    if (val >= 1_000_000) return sym + (val / 1_000_000).toFixed(2) + 'M';
    if (val >= 1_000) return sym + (val / 1_000).toFixed(2) + 'K';
    return sym + val.toFixed(2);
}

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return '128,128,128';
    try {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b} `;
    } catch (e) {
        return '128,128,128';
    }
}
