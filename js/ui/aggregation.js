// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Aggregation Table
// ═══════════════════════════════════════════════════════════

import {
    getDisplayedRows, getCurrentPrices, getFxRates, getActiveEntryCurrency,
    getAggInterval, getAggVolumeUnit, getShowAggSymbols, getAggZoneColors, getAggHighlightColor, getDecimalPlaces, getTooltipDelay,
    getAggColumnOrder, setAggColumnOrder, getAggColumnWidths, setAggColumnWidths
} from '../state.js';
import { AGG_COLUMN_DEFS } from '../config.js';
import { getCorrelatedEntry } from '../utils/currency.js';
import { fmtUSD, fmtCcy } from '../utils/formatters.js';
import { enableVirtualScroll } from '../utils/virtualScroll.js';

let lastRenderedBand = null;
let lastRenderedUnit = null;
let lastRenderedInterval = null;
let lastRenderedRowCount = 0;
let lastRenderedColorsStr = '';
let lastRenderedHeaderOrder = null;
let aggVirtualScrollManager = null;
let currentPriceRangeIndex = -1; // Track index for the floating button

export function renderAggregationTable(force = false) {
    const aggSection = document.getElementById('aggSectionWrapper');
    const isCollapsed = aggSection?.classList.contains('collapsed');

    const aggColumnOrder = getAggColumnOrder();
    const currentOrderStr = JSON.stringify(aggColumnOrder);

    // Initialize or update headers if order changed
    if (lastRenderedHeaderOrder !== currentOrderStr) {
        renderAggregationHeaders();
        force = true; // Force render of rows
        
        // Force recreation of virtual scroll to ensure clean render
        if (aggVirtualScrollManager && typeof aggVirtualScrollManager.destroy === 'function') {
            aggVirtualScrollManager.destroy();
        }
        
        lastRenderedHeaderOrder = currentOrderStr;
    }

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
    const decimalPlaces = getDecimalPlaces();
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
                ativosShort: new Set(),
                positionsLong: [],
                positionsShort: []
            };
        }

        const b = bands[bandDown];
        const val = r.positionValue; // USD value

        if (r.side === 'long') {
            b.qtdLong++;
            b.notionalLong += val;
            b.ativosLong.add(r.coin);
            b.positionsLong.push(r);
            totalLongNotional += val;
        } else if (r.side === 'short') {
            b.qtdShort++;
            b.notionalShort += val;
            b.ativosShort.add(r.coin);
            b.positionsShort.push(r);
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
                positionsLong: [],
                positionsShort: [],
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

                const isContested = domPct < 70;

                if (isContested) {
                    zoneType = 'Contestada';
                    zoneColor = '#ffffff';
                    domColor = '#ffffff';
                } else {
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
                    
                    // Update DOM color to match row-level Forte status
                    domColor = domType === 'COMPRA' ? (isForteZone ? aggZoneColors.buyStrong : aggZoneColors.buyNormal) :
                        domType === 'VENDA' ? (isForteZone ? aggZoneColors.sellStrong : aggZoneColors.sellNormal) : '#6b7280';
                }

                // Apply colors consistently to all directional cells based on row-level Forte status OR High Intensity
                // User Requirement: "linas com destaues por tipo de zona forte ou intensidade forte devem seguir somente um padrao de coloracao"
                // User Requirement Update: "compra e venda normais devem seguir apenas 1 cor"
                // User Requirement Update: "seo % de dominacia for menor que 70% a area é tida como contestada e todos os textos devem ser brancos"
                
                if (isContested) {
                     colorLong = b.notionalLong > 0 ? '#ffffff' : '#4b5563';
                     colorShort = b.notionalShort > 0 ? '#ffffff' : '#4b5563';
                } else if (totalNotional >= 10_000_000) {
                    if (domType === 'COMPRA') {
                        // Dominant Buy: Longs get Zone Color (Strong or Normal), Shorts get Gray (Neutral)
                        colorLong = b.notionalLong > 0 ? zoneColor : '#4b5563';
                        colorShort = b.notionalShort > 0 ? '#9ca3af' : '#4b5563';
                    } else if (domType === 'VENDA') {
                        // Dominant Sell: Shorts get Zone Color (Strong or Normal), Longs get Gray (Neutral)
                        colorLong = b.notionalLong > 0 ? '#9ca3af' : '#4b5563';
                        colorShort = b.notionalShort > 0 ? zoneColor : '#4b5563';
                    } else {
                        // Neutral High Intensity: Avoid mixing. Use Gray/Neutral.
                        colorLong = b.notionalLong > 0 ? '#9ca3af' : '#4b5563';
                        colorShort = b.notionalShort > 0 ? '#9ca3af' : '#4b5563';
                    }
                } else {
                    colorLong = b.notionalLong > 0 ? aggZoneColors.buyNormal : '#4b5563';
                    colorShort = b.notionalShort > 0 ? aggZoneColors.sellNormal : '#4b5563';
                }

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

            // Force white text for Contested/Neutral areas if significant volume
            if (!isEmpty && domPct < 70 && totalNotional >= 10_000_000) {
                totalNotionalColor = '#ffffff';
                intColor = '#ffffff';
                fwBold = '700';
                fwSemi = '700';
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

            // Star indicator for Extreme Intensity
            const starIndicator = totalNotional >= 100_000_000 ? '<span style="color:#f59e0b; margin-right:4px; font-size:14px">⭐</span>' : '';

            // Tooltip Data Preparation (JSON)
            let tooltipData = null;
            if (!isEmpty && (b.positionsLong.length > 0 || b.positionsShort.length > 0)) {
                const maxItems = 15;
                tooltipData = {
                    longs: [],
                    shorts: [],
                    longsCount: 0,
                    shortsCount: 0,
                    longsRemaining: 0,
                    shortsRemaining: 0
                };

                if (b.positionsLong.length > 0) {
                    tooltipData.longsCount = new Set(b.positionsLong.map(p => p.address)).size;
                    const sortedLongs = [...b.positionsLong].sort((x, y) => y.positionValue - x.positionValue);
                    tooltipData.longs = sortedLongs.slice(0, maxItems).map(p => {
                        const entryCorr = getCorrelatedEntry(p, activeEntryCurrency, currentPrices, fxRates);
                        return {
                            name: p.displayName || p.address.substring(0, 6) + '...',
                            coin: p.coin,
                            displayEntry: entryCorr.toLocaleString('en-US', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }),
                            displayVol: aggVolumeUnit === 'BTC' 
                                ? `₿${(btcPrice > 0 ? p.positionValue / btcPrice : 0).toFixed(2)}` 
                                : fmtUsdCompact(p.positionValue)
                        };
                    });
                    tooltipData.longsRemaining = Math.max(0, sortedLongs.length - maxItems);
                }

                if (b.positionsShort.length > 0) {
                    tooltipData.shortsCount = new Set(b.positionsShort.map(p => p.address)).size;
                    const sortedShorts = [...b.positionsShort].sort((x, y) => y.positionValue - x.positionValue);
                    tooltipData.shorts = sortedShorts.slice(0, maxItems).map(p => {
                        const entryCorr = getCorrelatedEntry(p, activeEntryCurrency, currentPrices, fxRates);
                        return {
                            name: p.displayName || p.address.substring(0, 6) + '...',
                            coin: p.coin,
                            displayEntry: entryCorr.toLocaleString('en-US', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }),
                            displayVol: aggVolumeUnit === 'BTC' 
                                ? `₿${(btcPrice > 0 ? p.positionValue / btcPrice : 0).toFixed(2)}` 
                                : fmtUsdCompact(p.positionValue)
                        };
                    });
                    tooltipData.shortsRemaining = Math.max(0, sortedShorts.length - maxItems);
                }
            }

            const tooltipAttr = tooltipData ? `data-tooltip='${JSON.stringify(tooltipData).replace(/'/g, "&#39;").replace(/"/g, "&quot;")}'` : '';
            const tooltipClass = tooltipData ? 'has-tooltip' : '';

            // Check for multiple of 1000 and 500 in price ranges
            const isRangeMultiple1000 = b.faixaDe % 1000 === 0;
            const isRangeMultiple500 = b.faixaDe % 500 === 0;
            
            let rangeColor = isCurrentPriceRange ? '#fff' : '#d1d5db';
            let rangeWeight = '700';
            
            if (isRangeMultiple1000) {
                rangeColor = '#fbbf24'; // Gold
                rangeWeight = '800';
            } else if (isRangeMultiple500) {
                rangeColor = '#fcd34d'; // Amber-300
                rangeWeight = '700';
            }

            const cellRenderers = {
                'col-agg-range-from': () => `<td ${tooltipAttr} class="${tooltipClass} col-agg-range-from" style="font-family:monospace; font-weight:${rangeWeight}; color:${rangeColor}">
                    ${starIndicator}
                    ${isCurrentPriceRange ? `<div style="font-size:10px; color:${aggHighlightColor}; margin-bottom:2px">BTC $${btcPrice.toLocaleString()}</div>` : ''}
                    $${b.faixaDe.toLocaleString()}
                </td>`,
                'col-agg-range-to': () => `<td ${tooltipAttr} class="${tooltipClass} col-agg-range-to" style="font-family:monospace; color:${isRangeMultiple1000 || isRangeMultiple500 ? rangeColor : '#9ca3af'}; font-weight:${isRangeMultiple1000 ? '800' : (isRangeMultiple500 ? '700' : '400')}">$${b.faixaAte.toLocaleString()}</td>`,
                'col-agg-qty-long': () => `<td class="col-agg-qty-long" style="color:${longCol}; text-align:center">${formatQty(b.qtdLong)}</td>`,
                'col-agg-val-long': () => `<td ${tooltipAttr} class="${tooltipClass} col-agg-val-long" style="color:${longCol}; font-family:monospace; font-weight:${b.notionalLong > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalLong)}</td>`,
                'col-agg-qty-short': () => `<td class="col-agg-qty-short" style="color:${shortCol}; text-align:center">${formatQty(b.qtdShort)}</td>`,
                'col-agg-val-short': () => `<td ${tooltipAttr} class="${tooltipClass} col-agg-val-short" style="color:${shortCol}; font-family:monospace; font-weight:${b.notionalShort > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalShort)}</td>`,
                'col-agg-val-total': () => `<td ${tooltipAttr} class="${tooltipClass} col-agg-val-total" style="font-family:monospace; color:${totalNotionalColor}; font-weight:${fwSemi}; ${valBg}">${formatVal(totalNotional)}</td>`,
                'col-agg-dom': () => `<td class="col-agg-dom" style="color:${domColor}; font-weight:${fwBold}; background:${domBg}">${domType}</td>`,
                'col-agg-pct': () => `<td class="col-agg-pct" style="color:${domColor}; font-weight:${fwBold}; background:${domBg}">${domPct > 0 ? domPct.toFixed(1) + '%' : '—'}</td>`,
                'col-agg-int': () => `<td class="col-agg-int" style="color:${intColor}; font-size:11px; font-weight:${fwSemi}">${intType}</td>`,
                'col-agg-zone': () => `<td class="col-agg-zone" style="color:${zoneColor}; font-weight:${fwSemi}">${zoneType}</td>`,
                'col-agg-assets-long': () => `<td class="col-agg-assets-long" style="color:${longCol}; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosLong).join(', ')}">${Array.from(b.ativosLong).join(', ')}</td>`,
                'col-agg-assets-short': () => `<td class="col-agg-assets-short" style="color:${shortCol}; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosShort).join(', ')}">${Array.from(b.ativosShort).join(', ')}</td>`
            };

            const aggColumnOrder = getAggColumnOrder() || AGG_COLUMN_DEFS.map(c => c.key);
            const newContent = aggColumnOrder.map(key => cellRenderers[key] ? cellRenderers[key]() : '').join('');

            return `<tr class="${trClass}" style="${expectedStyle}">${newContent}</tr>`;
        };

        // Update current price range index for the scroll button
        currentPriceRangeIndex = fullBandArray.findIndex(b => currentBtcPos >= b.faixaDe && currentBtcPos < b.faixaAte);

        // Render using virtual scroll
        aggVirtualScrollManager.renderRow = rowRenderer;
        aggVirtualScrollManager.setData(fullBandArray);
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

// Custom Tooltip Event Handling
let activeTooltipTimeout = null;
let pendingTooltipTarget = null;

document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.has-tooltip');

    // If we moved away from a target or to a new one, clear any pending tooltip timer
    if (activeTooltipTimeout) {
        // Only clear if we are moving to a new target or leaving the current one
        // If we are moving within the same target, do nothing?
        // But mouseover bubbles. If we move child->child, target is same.
        // If we move out and back in, target is same but we might want to restart?
        // Let's stick to simple: clear previous pending if any.
        clearTimeout(activeTooltipTimeout);
        activeTooltipTimeout = null;
        pendingTooltipTarget = null;
    }

    if (!target) return;

    // GLOBAL CLEANUP: Remove any existing tooltips to prevent overlapping/stacking
    // This fixes the issue where rapid movement or virtual scroll leaves orphan tooltips
    document.querySelectorAll('.custom-tooltip').forEach(el => el.remove());
    document.querySelectorAll('[data-tooltip-active="true"]').forEach(el => {
        if (el !== target) el.dataset.tooltipActive = 'false';
    });

    // Prevent tooltip re-creation if already showing for this target
    if (target.dataset.tooltipActive === 'true') {
        return;
    }

    const tooltipDataStr = target.getAttribute('data-tooltip');
    if (!tooltipDataStr) {
        return;
    }

    // Set as pending
    pendingTooltipTarget = target;

    // Cancel timeout if mouse leaves before delay
    const cancelTimeout = () => {
        if (pendingTooltipTarget === target) {
            if (activeTooltipTimeout) {
                clearTimeout(activeTooltipTimeout);
                activeTooltipTimeout = null;
            }
            pendingTooltipTarget = null;
        }
        target.removeEventListener('mouseleave', cancelTimeout);
    };
    target.addEventListener('mouseleave', cancelTimeout);

    const delay = getTooltipDelay();

    activeTooltipTimeout = setTimeout(() => {
        // No longer pending
        if (pendingTooltipTarget === target) {
            pendingTooltipTarget = null;
            activeTooltipTimeout = null;
        }

        // Mark as active immediately to prevent double-firing
        target.dataset.tooltipActive = 'true';

        try {
            const data = JSON.parse(tooltipDataStr);
            let tooltipHtml = '';

            if (data.longs && data.longs.length > 0) {
                tooltipHtml += `<div class="custom-tooltip-header longs">🟢 COMPRAS (LONGS) - ${data.longsCount} Players</div>`;
                tooltipHtml += `<div class="custom-tooltip-table">`;
                tooltipHtml += `
                    <div class="custom-tooltip-row header">
                        <span class="col-player">Player</span>
                        <span class="col-entry">Entry</span>
                        <span class="col-vol">Vol</span>
                    </div>
                `;
                data.longs.forEach(p => {
                    tooltipHtml += `
                        <div class="custom-tooltip-row">
                            <span class="col-player" title="${p.name} (${p.coin})">${p.name} <span class="coin-tag">${p.coin}</span></span>
                            <span class="col-entry">$${p.displayEntry}</span>
                            <span class="col-vol">${p.displayVol}</span>
                        </div>
                    `;
                });
                tooltipHtml += `</div>`; // Close table
                if (data.longsRemaining > 0) {
                    tooltipHtml += `<div class="custom-tooltip-remaining">...e mais ${data.longsRemaining}</div>`;
                }
            }

            if (data.shorts && data.shorts.length > 0) {
                if (tooltipHtml) tooltipHtml += '<div class="custom-tooltip-spacer"></div>';
                tooltipHtml += `<div class="custom-tooltip-header shorts">🔴 VENDAS (SHORTS) - ${data.shortsCount} Players</div>`;
                tooltipHtml += `<div class="custom-tooltip-table">`;
                tooltipHtml += `
                    <div class="custom-tooltip-row header">
                        <span class="col-player">Player</span>
                        <span class="col-entry">Entry</span>
                        <span class="col-vol">Vol</span>
                    </div>
                `;
                data.shorts.forEach(p => {
                    tooltipHtml += `
                        <div class="custom-tooltip-row">
                            <span class="col-player" title="${p.name} (${p.coin})">${p.name} <span class="coin-tag">${p.coin}</span></span>
                            <span class="col-entry">$${p.displayEntry}</span>
                            <span class="col-vol">${p.displayVol}</span>
                        </div>
                    `;
                });
                tooltipHtml += `</div>`; // Close table
                if (data.shortsRemaining > 0) {
                    tooltipHtml += `<div class="custom-tooltip-remaining">...e mais ${data.shortsRemaining}</div>`;
                }
            }

            if (!tooltipHtml) {
                console.warn('Tooltip HTML is empty, resetting active state');
                target.dataset.tooltipActive = 'false';
                return;
            }

            const tooltipEl = document.createElement('div');
            tooltipEl.className = 'custom-tooltip';
            tooltipEl.innerHTML = tooltipHtml;
            document.body.appendChild(tooltipEl);

            const rect = target.getBoundingClientRect();
            
            // Check if mobile
            const isMobile = window.innerWidth <= 768;
            
            if (!isMobile) {
                // Initial positioning off-screen to measure
                tooltipEl.style.visibility = 'hidden';
                tooltipEl.style.top = '0px';
                tooltipEl.style.left = '0px';
                
                requestAnimationFrame(() => {
                    const tooltipRect = tooltipEl.getBoundingClientRect();
                    
                    let top = rect.bottom + 10;
                    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

                    // Boundary checks
                    if (left < 10) left = 10;
                    if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - tooltipRect.width - 10;
                    
                    // Flip to top if not enough space below
                    if (top + tooltipRect.height > window.innerHeight - 10) {
                        top = rect.top - tooltipRect.height - 10;
                    }

                    tooltipEl.style.top = `${top}px`;
                    tooltipEl.style.left = `${left}px`;
                    tooltipEl.style.visibility = 'visible';

                    // Trigger animation
                    requestAnimationFrame(() => tooltipEl.classList.add('visible'));
                });
            } else {
                 // Mobile: let CSS handle positioning (centered)
                 requestAnimationFrame(() => tooltipEl.classList.add('visible'));
            }

            // Cleanup function
            const cleanup = (e) => {
                // If moving between target and tooltip, don't close
                if (e && e.relatedTarget) {
                    const rel = e.relatedTarget;
                    if (rel === tooltipEl || tooltipEl.contains(rel)) return;
                    if (rel === target || target.contains(rel)) return;
                }
                
                // Close tooltip
                tooltipEl.classList.remove('visible');
                target.dataset.tooltipActive = 'false';
                
                // Remove listeners
                target.removeEventListener('mouseleave', cleanup);
                tooltipEl.removeEventListener('mouseleave', cleanup);
                document.removeEventListener('touchstart', handleOutsideClick);
                document.removeEventListener('click', handleOutsideClick);
                
                setTimeout(() => {
                    if (tooltipEl.parentNode) {
                        tooltipEl.remove();
                    }
                }, 200);
            };
            
            const handleOutsideClick = (e) => {
                // If clicking inside tooltip or target, don't close
                if (tooltipEl.contains(e.target) || target.contains(e.target)) return;
                cleanup();
            };

            target.addEventListener('mouseleave', cleanup);
            tooltipEl.addEventListener('mouseleave', cleanup);
            
            // Handle clicks outside (for mobile/desktop interaction)
            // Use capture=true for touchstart to catch it early? No, bubbling is fine.
            // Using setTimeout to avoid immediate trigger if the event that opened it propagates
            setTimeout(() => {
                document.addEventListener('touchstart', handleOutsideClick, { passive: true });
                document.addEventListener('click', handleOutsideClick);
            }, 50);

        } catch (err) {
            console.error('Error parsing tooltip data:', err, tooltipDataStr);
            target.dataset.tooltipActive = 'false';
        }
    }, delay);
});

// ── Aggregation Table Header Management ──

export function renderAggregationHeaders() {
    const table = document.getElementById('aggTable');
    if (!table) return;
    const thead = table.querySelector('thead');
    if (!thead) return;

    const order = getAggColumnOrder() || AGG_COLUMN_DEFS.map(c => c.key);
    const widths = getAggColumnWidths() || {};

    // Update tracking
    lastRenderedHeaderOrder = order.join(',');

    let tr = thead.querySelector('tr');
    if (!tr) {
        tr = document.createElement('tr');
        thead.appendChild(tr);
    }
    tr.innerHTML = ''; // Clear existing

    order.forEach(key => {
        const def = AGG_COLUMN_DEFS.find(c => c.key === key);
        if (!def) return;

        const th = document.createElement('th');
        // Derive ID from key: col-agg-range-from -> th-agg-range-from
        th.id = key.replace('col-', 'th-');
        // Derive class from key: col-agg-range-from -> col-agg-range (approximate, or just use key)
        // Original HTML used specific classes like col-agg-range, col-agg-qty.
        // Let's try to map them or just use the key as class for simplicity.
        // Existing CSS might rely on specific classes.
        // config.js doesn't have class info.
        // But I can infer it or just add the key.
        th.className = key; 
        th.innerHTML = `${def.label}<div class="resizer"></div>`;
        th.dataset.key = key;
        th.style.cursor = 'grab'; // Indicate draggable

        // Apply width
        const w = widths[th.id] || def.width;
        if (w) {
            th.style.width = `${w}px`;
            th.style.minWidth = `${w}px`;
            th.style.maxWidth = `${w}px`;
        }

        tr.appendChild(th);
    });

    // Re-initialize events
    setupAggColumnResizing();
    setupAggColumnDragAndDrop();
}

function setupAggColumnResizing() {
    const table = document.getElementById('aggTable');
    if (!table) return;

    const ths = table.querySelectorAll('th');
    ths.forEach(th => {
        const resizer = th.querySelector('.resizer');
        if (resizer) {
            // Clone to remove old listeners
            const newResizer = resizer.cloneNode(true);
            resizer.parentNode.replaceChild(newResizer, resizer);
            
            newResizer.addEventListener('mousedown', initAggResize);
            newResizer.addEventListener('touchstart', initAggResize, { passive: false });
            newResizer.addEventListener('click', e => e.stopPropagation());
        }
    });
}

function initAggResize(e) {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();

    const resizer = e.target;
    const th = resizer.closest('th');
    if (!th) return;

    const isTouch = e.type === 'touchstart';
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startWidth = th.offsetWidth;

    document.body.classList.add('resizing');
    th.classList.add('resizing-active');

    const onMove = (e) => {
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        requestAnimationFrame(() => {
            const diffX = clientX - startX;
            const newWidth = Math.max(40, startWidth + diffX);
            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
            th.style.maxWidth = `${newWidth}px`;
        });
    };

    const onEnd = () => {
        document.body.classList.remove('resizing');
        th.classList.remove('resizing-active');
        
        if (isTouch) {
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        } else {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
        }

        // Save new width
        const widths = getAggColumnWidths() || {};
        widths[th.id] = parseInt(th.style.width);
        setAggColumnWidths(widths);
        window.dispatchEvent(new CustomEvent('save-settings'));
    };

    if (isTouch) {
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    } else {
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    }
}

function setupAggColumnDragAndDrop() {
    if (document.body.dataset.aggDragInitialized) return;
    document.body.dataset.aggDragInitialized = 'true';

    let isDragging = false;
    let potentialDrag = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let draggedTh = null;

    const onMouseDown = (e) => {
        // Skip if resizing
        if (document.body.classList.contains('resizing')) return;

        const th = e.target.closest('#aggTable th');
        if (!th) return;

        // Skip if clicking on resizer
        const resizer = th.querySelector('.resizer');
        if (resizer && (e.target === resizer || resizer.contains(e.target))) return;

        potentialDrag = true;
        draggedTh = th;
        
        const isTouch = e.type === 'touchstart';
        dragStartX = isTouch ? e.touches[0].clientX : e.clientX;
        dragStartY = isTouch ? e.touches[0].clientY : e.clientY;
    };

    const onMouseMove = (e) => {
        if (!potentialDrag && !isDragging) return;

        const isTouch = e.type === 'touchmove';
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - dragStartX;
        const deltaY = clientY - dragStartY;

        if (potentialDrag) {
            // Check threshold
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                // If vertical movement is dominant on touch, assume scroll and cancel drag
                if (isTouch && Math.abs(deltaY) > Math.abs(deltaX)) {
                    potentialDrag = false;
                    draggedTh = null;
                    return;
                }

                isDragging = true;
                potentialDrag = false;
                if (draggedTh) {
                    draggedTh.classList.add('dragging');
                    // Highlight dragged column cells
                    const draggedKey = draggedTh.dataset.key;
                    if (draggedKey) {
                        document.querySelectorAll(`.${draggedKey}`).forEach(el => el.classList.add('dragging-column-cell'));
                    }
                }
                if (e.cancelable) e.preventDefault();
            }
        }

        if (isDragging) {
            if (e.cancelable) e.preventDefault();
            if (draggedTh) draggedTh.style.opacity = '0.5';
    
            const targetElement = document.elementFromPoint(clientX, clientY);
            const targetTh = targetElement?.closest('#aggTable th');
    
            if (targetTh && targetTh !== draggedTh) {
                document.querySelectorAll('#aggTable th').forEach(h => h.classList.remove('drag-over'));
                targetTh.classList.add('drag-over');

                // Highlight target column cells
                document.querySelectorAll('.drag-over-column-cell').forEach(el => el.classList.remove('drag-over-column-cell'));
                const targetKey = targetTh.dataset.key;
                if (targetKey) {
                    document.querySelectorAll(`.${targetKey}`).forEach(el => el.classList.add('drag-over-column-cell'));
                }
            } else if (!targetTh) {
                document.querySelectorAll('#aggTable th').forEach(h => h.classList.remove('drag-over'));
                document.querySelectorAll('.drag-over-column-cell').forEach(el => el.classList.remove('drag-over-column-cell'));
            }
        }
    };

    const onMouseUp = (e) => {
        if (!isDragging || !draggedTh) {
            // Reset potential drag if we just clicked/tapped without moving enough
            potentialDrag = false;
            draggedTh = null;
            return;
        }

        const isTouch = e.type === 'touchend';
        let clientX, clientY;
        
        if (isTouch) {
             const touch = e.changedTouches[0];
             clientX = touch.clientX;
             clientY = touch.clientY;
        } else {
             clientX = e.clientX;
             clientY = e.clientY;
        }

        const targetElement = document.elementFromPoint(clientX, clientY);
        const targetTh = targetElement?.closest('#aggTable th');

        if (targetTh && targetTh !== draggedTh) {
            const draggedKey = draggedTh.dataset.key;
            const targetKey = targetTh.dataset.key;

            const currentOrder = getAggColumnOrder() || AGG_COLUMN_DEFS.map(c => c.key);
            const draggedIndex = currentOrder.indexOf(draggedKey);
            const targetIndex = currentOrder.indexOf(targetKey);

            if (draggedIndex !== -1 && targetIndex !== -1) {
                const newOrder = [...currentOrder];
                const [removed] = newOrder.splice(draggedIndex, 1);
                newOrder.splice(targetIndex, 0, removed);

                setAggColumnOrder(newOrder);
                window.dispatchEvent(new CustomEvent('save-settings'));
                
                // Re-render headers and table
                renderAggregationHeaders();
                renderAggregationTable(true);
            }
        }

        isDragging = false;
        potentialDrag = false;
        if (draggedTh) {
            draggedTh.classList.remove('dragging');
            draggedTh.style.opacity = '';
            draggedTh = null;
        }
        document.querySelectorAll('#aggTable th').forEach(h => h.classList.remove('drag-over'));
        
        // Remove column highlighting classes
        document.querySelectorAll('.dragging-column-cell').forEach(el => el.classList.remove('dragging-column-cell'));
        document.querySelectorAll('.drag-over-column-cell').forEach(el => el.classList.remove('drag-over-column-cell'));
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('touchstart', onMouseDown, { passive: false });
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', onMouseMove, { passive: false });

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchend', onMouseUp);
}


