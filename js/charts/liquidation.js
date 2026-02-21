// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Liquidation
// ═══════════════════════════════════════════════════════════

// Helper function to convert hex color to rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

import {
    getDisplayedRows, getCurrentPrices, getActiveEntryCurrency, getShowSymbols,
    getLiqChartHeight, getChartMode, getAggregationFactor, getSavedLiqState,
    getFxRates, getChartHighLevSplit, getColorMaxLev, getDecimalPlaces, getLeverageColors,
    getBubbleScale, getBubbleOpacity, getMinBtcVolume, getWhaleMeta
} from '../state.js';
import { CURRENCY_META } from '../config.js';
import { chartPlugins, chartOptions } from './config.js';
import { liqChartOptions } from './liq-config.js';
import { getCorrelatedPrice } from '../utils/currency.js';
import { saveSettings } from '../storage/settings.js';
import {
    originalScaleResizing
} from './chart-mechanics-adapted.js';

// Import chart plugins - ChartZoom is already registered via CDN

let liqChartInstance = null;

// ── Chart Scale Resizing ──
function enableChartScaleResizing(canvasId, getChartInstance, resetBtnId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    let isDragging = false;
    let dragAxis = null;
    let startPos = 0;
    let initialMin = 0;
    let initialMax = 0;

    canvas.addEventListener('mousedown', (e) => {
        const chart = getChartInstance();
        if (!chart) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { left, right, top, bottom } = chart.chartArea;

        // Y Axis (Left)
        if (x < left && y >= top && y <= bottom) {
            isDragging = true;
            dragAxis = 'y';
            startPos = y;
            initialMin = chart.scales.y.min;
            initialMax = chart.scales.y.max;
            e.preventDefault();
        }
        // X Axis (Bottom)
        else if (y > bottom && x >= left && x <= right) {
            isDragging = true;
            dragAxis = 'x';
            startPos = x;
            initialMin = chart.scales.x.min;
            initialMax = chart.scales.x.max;
            e.preventDefault();
        }

        if (isDragging) {
            chart.isZoomed = true;
            if (resetBtnId) {
                const btn = document.getElementById(resetBtnId);
                if (btn) btn.style.display = 'block';
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || !dragAxis) return;
        const chart = getChartInstance();
        if (!chart) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scale = chart.scales[dragAxis];
        const isLog = scale.type === 'logarithmic';
        const sensitivity = 2.0;

        if (dragAxis === 'y') {
            const delta = y - startPos; // Drag down > 0
            const height = chart.chartArea.bottom - chart.chartArea.top;
            const factor = (delta / height) * sensitivity;

            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const logRange = logMax - logMin;

                const newLogRange = logRange * (1 + factor);
                const logCenter = (logMax + logMin) / 2;

                const newLogMin = logCenter - newLogRange / 2;
                const newLogMax = logCenter + newLogRange / 2;

                chart.options.scales.y.min = Math.exp(newLogMin);
                chart.options.scales.y.max = Math.exp(newLogMax);
            } else {
                const range = initialMax - initialMin;
                const newRange = range * (1 + factor);
                const center = (initialMax + initialMin) / 2;

                chart.options.scales.y.min = center - newRange / 2;
                chart.options.scales.y.max = center + newRange / 2;
            }
        } else if (dragAxis === 'x') {
            const delta = x - startPos; // Drag right > 0
            const width = chart.chartArea.right - chart.chartArea.left;
            // Drag Right -> Zoom In -> Negative factor
            const factor = -(delta / width) * sensitivity;

            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const logRange = logMax - logMin;

                const newLogRange = logRange * (1 + factor);
                const logCenter = (logMax + logMin) / 2;

                const newLogMin = logCenter - newLogRange / 2;
                const newLogMax = logCenter + newLogRange / 2;

                chart.options.scales.x.min = Math.exp(newLogMin);
                chart.options.scales.x.max = Math.exp(newLogMax);
            } else {
                const range = initialMax - initialMin;
                const newRange = range * (1 + factor);
                const center = (initialMax + initialMin) / 2;

                chart.options.scales.x.min = center - newRange / 2;
                chart.options.scales.x.max = center + newRange / 2;
            }
        }

        chart.update('none');
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragAxis = null;
            const chart = getChartInstance();
            if (chart) {
                chart.isZoomed = true;
                saveSettings();
            }
        }
    });
}

export function renderLiqScatterPlot() {
    const section = document.getElementById('liq-chart-section');
    if (!section) return;

    const displayedRows = getDisplayedRows();

    if (!displayedRows || displayedRows.length === 0) {
        section.style.display = 'none';
        return;
    }

    const btcPrice = parseFloat(getCurrentPrices()['BTC'] || 0);
    const currencyMeta = CURRENCY_META[getActiveEntryCurrency() || 'USD'] || CURRENCY_META.USD;
    const sym = getShowSymbols() ? currencyMeta.symbol : '';
    const entryLabel = `Liquidation Price (${getActiveEntryCurrency() || 'USD'})`;
    const activeEntryCurrency = getActiveEntryCurrency();
    const currentPrices = getCurrentPrices();

    // Get min BTC volume setting from state
    const minBtcVolume = getMinBtcVolume();

    // Prepare data
    const data = displayedRows.map(r => {
        const volBTC = btcPrice > 0 ? r.positionValue / btcPrice : 0;

        const liqPrice = r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, getFxRates()) : 0;

        if (liqPrice <= 0) return null;

        return {
            x: liqPrice,
            y: volBTC,
            r: Math.sqrt(r.positionValue) / 1000 * getBubbleScale(),
            _raw: r
        };
    }).filter(d => d !== null);

    if (data.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    section.style.height = getLiqChartHeight() + 'px';

    const canvas = document.getElementById('liqChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Garantir que o canvas seja visível
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // Prepare Reference Price
    let refPrice = btcPrice;
    if (getActiveEntryCurrency() === 'BTC') {
        refPrice = 1;
    } else if (getActiveEntryCurrency() && getActiveEntryCurrency() !== 'USD') {
        const rate = getFxRates()[getActiveEntryCurrency()] || 1;
        refPrice = btcPrice * rate;
    }

    const isLinesMode = getChartMode() === 'lines';

    // Configure chart based on mode
    let datasets = [];
    let chartType = 'bubble';
    let localScales = {};
    let localIndexAxis = 'x';

    // Get custom colors
    const customColors = getLeverageColors();

    if (getChartMode() === 'column') {
        // Histogram mode
        chartType = 'bar';

        // Create bins
        const xValues = data.map(d => d.x);
        const minX = xValues.reduce((min, val) => Math.min(min, val), refPrice);
        const maxX = xValues.reduce((max, val) => Math.max(max, val), refPrice);

        const numBins = getAggregationFactor();
        const range = maxX - minX || 1;
        const binSize = range / numBins;

        const bins = new Array(numBins).fill(0);
        data.forEach(d => {
            const binIndex = Math.min(Math.floor((d.x - minX) / binSize), numBins - 1);
            bins[binIndex]++;
        });

        const binLabels = bins.map((_, i) => {
            const val = minX + (i * binSize);
            return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
        });

        datasets = [{
            label: 'Liquidations',
            data: bins,
            backgroundColor: 'rgba(239, 68, 68, 0.6)',
            borderColor: 'rgba(239, 68, 68, 0.8)',
            borderWidth: 1
        }];

        localScales = {
            x: {
                type: 'category',
                ...chartOptions.scales.x,
                labels: binLabels,
                min: 0,
                title: {
                    display: true,
                    text: entryLabel,
                    color: '#5a6a88',
                    font: { size: 11 }
                }
            },
            y: {
                ...chartOptions.scales.y,
                title: {
                    display: true,
                    text: 'Count',
                    color: '#5a6a88',
                    font: { size: 11 }
                }
            }
        };
    } else if (getChartMode() === 'lines') {
        // Support and Resistance Lines mode (Horizontal Bars)
        chartType = 'bar';
        localIndexAxis = 'y';
        const highLevSplit = getChartHighLevSplit();

        // One dataset per position to allow different colors and tooltips
        datasets = data.map(d => {
            const r = d._raw;
            const lev = Math.abs(r.leverageValue);
            const side = r.side;
            let color;
            if (side === 'long') {
                color = lev >= highLevSplit ? customColors.longHigh : customColors.longLow;
            } else {
                color = lev >= highLevSplit ? customColors.shortHigh : customColors.shortLow;
            }

            return {
                label: `${r.coin} ${side === 'long' ? 'Long' : 'Short'} @ ${d.x}`,
                data: [{ x: d.y, y: d.x }], // x = BTC size (volume), y = price - CORRECT
                backgroundColor: hexToRgba(color, 0.7),
                borderColor: color,
                borderWidth: 1,
                barThickness: 2, // Fine lines
                _raw: r
            };
        });

        // Calculate volume min/max for proper X scale
        const volumes = data.map(d => d.y); // d.y = BTC size (volume)
        const minVolume = volumes.length > 0 ? volumes.reduce((min, val) => Math.min(min, val), Infinity) : 0;
        const maxVolume = volumes.length > 0 ? volumes.reduce((max, val) => Math.max(max, val), -Infinity) : 0;
        const volumePadding = (maxVolume - minVolume) * 0.1; // 10% padding

        localScales = {
            x: {
                type: 'linear',
                position: 'bottom',
                stacked: true,
                title: {
                    display: true,
                    text: 'Size (BTC)',
                    color: '#5a6a88'
                },
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#9ca3af' },
                // Set X scale based on volume min/max with padding (always start at 0)
                min: 0,
                max: maxVolume + volumePadding
            },
            y: {
                type: 'linear',
                stacked: true,
                title: {
                    display: true,
                    text: entryLabel,
                    color: '#5a6a88'
                },
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#9ca3af' },
                // Use input filters for Y scale in lines mode (price axis)
                min: function () {
                    const minInput = document.getElementById('minEntryCcy');
                    return minInput && minInput.value ? parseFloat(minInput.value) : undefined;
                }(),
                max: function () {
                    const maxInput = document.getElementById('maxEntryCcy');
                    return maxInput && maxInput.value ? parseFloat(maxInput.value) : undefined;
                }()
            }
        };
    } else {
        // Scatter mode - create 4 series based on leverage split
        const highLevSplit = getChartHighLevSplit();
        const opacity = getBubbleOpacity();

        const longLowData = data.filter(d => d._raw.side === 'long' && Math.abs(d._raw.leverageValue) < highLevSplit);
        const longHighData = data.filter(d => d._raw.side === 'long' && Math.abs(d._raw.leverageValue) >= highLevSplit);
        const shortLowData = data.filter(d => d._raw.side === 'short' && Math.abs(d._raw.leverageValue) < highLevSplit);
        const shortHighData = data.filter(d => d._raw.side === 'short' && Math.abs(d._raw.leverageValue) >= highLevSplit);

        if (longLowData.length > 0) {
            datasets.push({
                label: `Longs (≤${highLevSplit}x)`,
                data: longLowData,
                backgroundColor: hexToRgba(customColors.longLow, opacity),
                borderColor: customColors.longLow,
                borderWidth: 1,
                hoverBackgroundColor: hexToRgba(customColors.longLow, Math.min(opacity + 0.15, 0.8)),
                hoverBorderColor: customColors.longLow,
                pointStyle: (context) => {
                    const raw = context.raw?._raw;
                    const meta = getWhaleMeta()[raw?.address] || {};
                    const volBTC = context.raw?.y || 0;
                    return (meta.displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume)) ? 'star' : 'circle';
                }
            });
        }

        if (longHighData.length > 0) {
            datasets.push({
                label: `Longs (>${highLevSplit}x)`,
                data: longHighData,
                backgroundColor: hexToRgba(customColors.longHigh, opacity),
                borderColor: customColors.longHigh,
                borderWidth: 2,
                hoverBackgroundColor: hexToRgba(customColors.longHigh, Math.min(opacity + 0.15, 0.8)),
                hoverBorderColor: customColors.longHigh,
                pointStyle: (context) => {
                    const raw = context.raw?._raw;
                    const meta = getWhaleMeta()[raw?.address] || {};
                    const volBTC = context.raw?.y || 0;
                    return (meta.displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume)) ? 'star' : 'circle';
                }
            });
        }

        if (shortLowData.length > 0) {
            datasets.push({
                label: `Shorts (≤${highLevSplit}x)`,
                data: shortLowData,
                backgroundColor: hexToRgba(customColors.shortLow, opacity),
                borderColor: customColors.shortLow,
                borderWidth: 1,
                hoverBackgroundColor: hexToRgba(customColors.shortLow, Math.min(opacity + 0.15, 0.8)),
                hoverBorderColor: customColors.shortLow,
                pointStyle: (context) => {
                    const raw = context.raw?._raw;
                    const meta = getWhaleMeta()[raw?.address] || {};
                    const volBTC = context.raw?.y || 0;
                    return (meta.displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume)) ? 'star' : 'circle';
                }
            });
        }

        if (shortHighData.length > 0) {
            datasets.push({
                label: `Shorts (>${highLevSplit}x)`,
                data: shortHighData,
                backgroundColor: hexToRgba(customColors.shortHigh, opacity),
                borderColor: customColors.shortHigh,
                borderWidth: 2,
                hoverBackgroundColor: hexToRgba(customColors.shortHigh, Math.min(opacity + 0.15, 0.8)),
                hoverBorderColor: customColors.shortHigh,
                pointStyle: (context) => {
                    const raw = context.raw?._raw;
                    const meta = getWhaleMeta()[raw?.address] || {};
                    const volBTC = context.raw?.y || 0;
                    return (meta.displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume)) ? 'star' : 'circle';
                }
            });
        }

        localScales = {
            x: {
                type: 'linear',
                ...chartOptions.scales.x,
                min: function () {
                    const minInput = document.getElementById('minEntryCcy');
                    const filterValue = minInput && minInput.value ? parseFloat(minInput.value) : undefined;
                    return filterValue !== undefined && filterValue > 0 ? filterValue : 0;
                }(),
                max: function () {
                    const maxInput = document.getElementById('maxEntryCcy');
                    return maxInput && maxInput.value ? parseFloat(maxInput.value) : undefined;
                }(),
                title: {
                    display: true,
                    text: entryLabel,
                    color: '#5a6a88',
                    font: { size: 11 }
                }
            },
            y: {
                type: 'linear',
                ...chartOptions.scales.y,
                min: 0,
                title: {
                    display: true,
                    text: 'Size (BTC)',
                    color: '#5a6a88',
                    font: { size: 11 }
                }
            }
        };
    }

    const config = {
        type: chartType,
        data: { datasets },
        options: {
            ...liqChartOptions,
            indexAxis: localIndexAxis,
            plugins: {
                ...liqChartOptions.plugins,
                legend: {
                    display: getChartMode() !== 'lines', // Hide legend in lines mode as it's cluttered
                    labels: {
                        color: '#e2e8f4',
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    ...liqChartOptions.plugins.tooltip,
                    titleColor: undefined,
                    bodyColor: undefined,
                    callbacks: {
                        title: function (context) {
                            if (chartType === 'bar' && getChartMode() === 'column') {
                                return 'Liquidation Count';
                            }
                            let r = null;

                            // Try different ways to get raw data
                            if (context[0] && context[0].dataset && context[0].dataset._raw) {
                                r = context[0].dataset._raw;
                            } else if (context[0] && context[0].raw && context[0].raw._raw) {
                                r = context[0].raw._raw;
                            } else if (context[0] && context[0].raw) {
                                r = context[0].raw;
                            }

                            if (!r || !r.coin) {
                                // Fallback: try to get from dataset label
                                if (context[0] && context[0].dataset && context[0].dataset.label) {
                                    return context[0].dataset.label;
                                }
                                return 'Unknown';
                            }
                            const meta = getWhaleMeta()[r.address] || {};
                            const nameStr = meta.displayName ? ` (${meta.displayName})` : '';
                            return `${r.coin} ${r.side === 'long' ? '▲' : '▼'}${nameStr}`;
                        },
                        titleColor: function (context) {
                            return context[0].dataset.borderColor;
                        },
                        labelColor: function (context) {
                            return context.dataset.backgroundColor;
                        },
                        labelTextColor: function (context) {
                            return context.dataset.backgroundColor;
                        },
                        label: function (context) {
                            if (chartType === 'bar' && getChartMode() === 'column') {
                                return `Count: ${context.parsed.y}`;
                            }
                            const r = context.raw?._raw || context.dataset._raw;
                            if (!r) return '';
                            const decimalPlaces = getDecimalPlaces();
                            const xVal = getChartMode() === 'lines' ? context.parsed.y : context.parsed.x;
                            const yVal = getChartMode() === 'lines' ? context.parsed.x : context.parsed.y;

                            return [
                                `Liq Price: ${sym}${xVal.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}`,
                                `BTC Value: ${yVal.toFixed(decimalPlaces)}`,
                                `Value: $${r.positionValue.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}`
                            ];
                        }
                    }
                },
                btcPriceLabel: (chartType === 'bubble' || isLinesMode) ? {
                    price: refPrice,
                    text: `BTC: ${sym}${refPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                } : undefined,
                zoom: liqChartOptions.plugins.zoom
            },
            scales: localScales
        },
        plugins: [chartPlugins.crosshair, chartPlugins.btcGrid, chartPlugins.btcPriceLabel]
    };

    if (liqChartInstance) {
        liqChartInstance.destroy();
    }

    liqChartInstance = new Chart(ctx, config);

    // Add zoom event listeners to save state
    liqChartInstance.options.plugins.zoom = {
        ...liqChartInstance.options.plugins.zoom,
        onZoomComplete: function ({ chart }) {
            chart.isZoomed = true;
            const scatterChart = window.getScatterChart ? window.getScatterChart() : null;
            saveSettings(null, null, null, scatterChart, chart);
        },
        onZoomStart: function ({ chart }) {
            chart.isZoomed = false;
        }
    };

    // Restore zoom state if saved (after setting up zoom events)
    if (getSavedLiqState()) {
        liqChartInstance.isZoomed = true;
        liqChartInstance.scales.x.min = getSavedLiqState().x.min;
        liqChartInstance.scales.x.max = getSavedLiqState().x.max;
        liqChartInstance.scales.y.min = getSavedLiqState().y.min;
        liqChartInstance.scales.y.max = getSavedLiqState().y.max;
        liqChartInstance.update();
    }

    return liqChartInstance;
}

export function getLiqChartInstance() {
    return liqChartInstance;
}

export function setLiqChartInstance(chart) {
    liqChartInstance = chart;
}

// Enable resizing for liquidation chart
enableChartScaleResizing('liqChart', () => liqChartInstance);
