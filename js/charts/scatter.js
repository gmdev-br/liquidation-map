// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Scatter Plot
// ═══════════════════════════════════════════════════════════

// Helper function to convert hex color to rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

import {
    getDisplayedRows, getCurrentPrices, getActiveCurrency, getActiveEntryCurrency,
    getShowSymbols, getChartHeight, getChartHighLevSplit,
    getBubbleScale, getBubbleOpacity, getLineThickness, getChartMode, getAggregationFactor, getSavedScatterState,
    getFxRates, getDecimalPlaces, getLeverageColors, getMinBtcVolume
} from '../state.js';
import { CURRENCY_META } from '../config.js';
import { chartPlugins, chartOptions } from './config.js';
import { saveSettings } from '../storage/settings.js';
import {
    originalZoomConfig,
    originalScaleResizing
} from './chart-mechanics-adapted.js';

// Import chart plugins - ChartZoom is already registered via CDN

let scatterChart = null;
let lastDataHash = null; // Track data changes for incremental updates

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

export function renderScatterPlot() {
    const section = document.getElementById('chart-section');
    if (!section) return;

    const displayedRows = getDisplayedRows();
    if (!displayedRows || displayedRows.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    section.style.height = getChartHeight() + 'px';

    const canvas = document.getElementById('scatterChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const btcPrice = parseFloat(getCurrentPrices()['BTC'] || 0);
    const currencyMeta = CURRENCY_META[getActiveEntryCurrency() || 'USD'] || CURRENCY_META.USD;
    const sym = getShowSymbols() ? currencyMeta.symbol : '';
    const entryLabel = `Entry Price (${getActiveEntryCurrency() || 'USD'})`;
    const valueLabel = `Position Value (${getActiveCurrency()})`;

    // Get min BTC volume setting from state
    const minBtcVolume = getMinBtcVolume();

    // Prepare data
    const data = displayedRows.map(r => {
        const currentPrices = getCurrentPrices();
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        const volBTC = btcPrice > 0 ? r.positionValue / btcPrice : 0;

        const entryPrice = r.entryPx;
        const correlatedEntry = getCorrelatedPrice(r, entryPrice, getActiveEntryCurrency(), getCurrentPrices());

        if (volBTC <= 0) return null;

        return {
            x: correlatedEntry,
            y: volBTC,
            r: Math.sqrt(r.positionValue) / 1000 * getBubbleScale(),
            _raw: r
        };
    }).filter(d => d !== null);

    if (data.length === 0) {
        section.style.display = 'none';
        return;
    }

    // Calculate data hash to detect changes
    const currentDataHash = JSON.stringify({
        mode: getChartMode(),
        highLevSplit: getChartHighLevSplit(),
        bubbleScale: getBubbleScale(),
        bubbleOpacity: getBubbleOpacity(),
        lineThickness: getLineThickness(),
        aggregationFactor: getAggregationFactor(),
        dataLength: data.length,
        // Sample first and last data points for hash (more efficient than full hash)
        firstPoint: data[0],
        lastPoint: data[data.length - 1]
    });

    // If data hasn't changed and chart exists, just update
    if (scatterChart && lastDataHash === currentDataHash) {
        console.log('Data unchanged, skipping chart recreation');
        return;
    }

    lastDataHash = currentDataHash;

    // Get current BTC price for annotations
    const activeCurrency = getActiveEntryCurrency();
    const fxRates = getFxRates();
    const rate = fxRates[activeCurrency] || 1;
    const refPrice = btcPrice * rate;

    const isLinesMode = getChartMode() === 'lines';

    // Configure chart based on mode
    let datasets = [];
    let chartType = 'bubble';
    let localScales = {};
    let localIndexAxis = 'x';

    // Get custom colors
    const customColors = getLeverageColors();

    if (getChartMode() === 'column') {
        // Histogram mode with stacked columns by side and leverage
        chartType = 'bar';

        // Create bins
        const xValues = data.map(d => d.x);
        const minX = Math.min(...xValues, refPrice);
        const maxX = Math.max(...xValues, refPrice);

        const numBins = getAggregationFactor();
        const range = maxX - minX || 1;
        const binSize = range / numBins;

        const highLevSplit = getChartHighLevSplit();

        // Initialize bins for each category
        const longLowBins = new Array(numBins).fill(0);
        const longHighBins = new Array(numBins).fill(0);
        const shortLowBins = new Array(numBins).fill(0);
        const shortHighBins = new Array(numBins).fill(0);

        // Categorize and bin data
        data.forEach(d => {
            const binIndex = Math.min(Math.floor((d.x - minX) / binSize), numBins - 1);
            const lev = Math.abs(d._raw.leverageValue);
            const side = d._raw.side;

            if (side === 'long' && lev < highLevSplit) {
                longLowBins[binIndex]++;
            } else if (side === 'long' && lev >= highLevSplit) {
                longHighBins[binIndex]++;
            } else if (side === 'short' && lev < highLevSplit) {
                shortLowBins[binIndex]++;
            } else if (side === 'short' && lev >= highLevSplit) {
                shortHighBins[binIndex]++;
            }
        });

        const binLabels = Array.from({ length: numBins }, (_, i) => {
            const val = minX + (i * binSize);
            return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
        });

        // Create stacked datasets
        datasets = [];

        if (shortLowBins.some(b => b > 0)) {
            datasets.push({
                label: `Shorts (≤${highLevSplit}x)`,
                data: shortLowBins,
                backgroundColor: customColors.shortLow,
                borderColor: customColors.shortLow,
                borderWidth: 1,
                stack: 'positions'
            });
        }

        if (shortHighBins.some(b => b > 0)) {
            datasets.push({
                label: `Shorts (>${highLevSplit}x)`,
                data: shortHighBins,
                backgroundColor: customColors.shortHigh,
                borderColor: customColors.shortHigh,
                borderWidth: 1,
                stack: 'positions'
            });
        }

        if (longLowBins.some(b => b > 0)) {
            datasets.push({
                label: `Longs (≤${highLevSplit}x)`,
                data: longLowBins,
                backgroundColor: customColors.longLow,
                borderColor: customColors.longLow,
                borderWidth: 1,
                stack: 'positions'
            });
        }

        if (longHighBins.some(b => b > 0)) {
            datasets.push({
                label: `Longs (>${highLevSplit}x)`,
                data: longHighBins,
                backgroundColor: customColors.longHigh,
                borderColor: customColors.longHigh,
                borderWidth: 1,
                stack: 'positions'
            });
        }

        localScales = {
            x: {
                type: 'category',
                ...chartOptions.scales.x,
                labels: binLabels,
                title: {
                    display: true,
                    text: entryLabel,
                    color: '#5a6a88',
                    font: { size: 11 }
                }
            },
            y: {
                ...chartOptions.scales.y,
                stacked: true,
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
                barThickness: getLineThickness(), // User adjustable thickness
                _raw: r
            };
        });

        // Calculate volume min/max for proper X scale
        const volumes = data.map(d => d.y); // d.y = BTC size (volume)
        const minVolume = Math.min(...volumes);
        const maxVolume = Math.max(...volumes);
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
                // Set X scale (always start at 0)
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
                    return minInput && minInput.value ? parseFloat(minInput.value) : 0;
                }(),
                max: function () {
                    const maxInput = document.getElementById('maxEntryCcy');
                    return maxInput && maxInput.value ? parseFloat(maxInput.value) : undefined;
                }()
            }
        };

        // Horizontal bar setting
        localIndexAxis = 'y';

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
                    const displayName = raw?.displayName;
                    const volBTC = context.raw?.y || 0;
                    return (displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume)) ? 'star' : 'circle';
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
                    const displayName = raw?.displayName;
                    const volBTC = context.raw?.y || 0;
                    return (displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume)) ? 'star' : 'circle';
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
                    const displayName = raw?.displayName;
                    const volBTC = context.raw?.y || 0;
                    return (displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume)) ? 'star' : 'circle';
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
                    const displayName = raw?.displayName;
                    const volBTC = context.raw?.y || 0;
                    return (displayName || (minBtcVolume > 0 && volBTC >= minBtcVolume)) ? 'star' : 'circle';
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

        // Reset indexAxis for scatter mode
        localIndexAxis = 'x';
    }

    // Configure chart
    const config = {
        type: chartType,
        data: { datasets },
        options: {
            ...chartOptions,
            indexAxis: localIndexAxis,
            plugins: {
                ...chartOptions.plugins,
                legend: {
                    display: getChartMode() !== 'lines', // Hide legend in lines mode as it's cluttered
                    labels: {
                        color: '#e2e8f4',
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    ...chartOptions.plugins.tooltip,
                    titleColor: undefined,
                    bodyColor: undefined,
                    callbacks: {
                        title: function (context) {
                            if (chartType === 'bar' && getChartMode() === 'column') {
                                return 'Position Count';
                            }
                            let r = null;
                            
                            // Try different ways to get the raw data
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
                            return `${r.coin} ${r.side === 'long' ? '▲' : '▼'}`;
                        },
                        titleColor: function (context) {
                            return context[0].dataset.borderColor;
                        },
                        labelColor: function (context) {
                            return context.dataset.borderColor;
                        },
                        labelTextColor: function (context) {
                            return context.dataset.borderColor;
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
                                `Entry Price: ${sym}${xVal.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}`,
                                `BTC Value: ${yVal.toFixed(decimalPlaces)}`,
                                `Value: $${r.positionValue.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}`
                            ];
                        }
                    }
                },
                btcPriceLabel: (chartType === 'bubble' || isLinesMode) ? {
                    price: refPrice,
                    text: `BTC: ${sym}${refPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                } : undefined
            },
            scales: localScales
        },
        plugins: [chartPlugins.crosshair, chartPlugins.btcGrid, chartPlugins.btcPriceLabel],
        zoom: originalZoomConfig
    };

    if (scatterChart) {
        scatterChart.destroy();
    }

    scatterChart = new Chart(ctx, config);

    // Preserve zoom state if scales exist
    const currentX = scatterChart.scales.x;
    const currentY = scatterChart.scales.y;

    // Check if we are in a zoomed state (saved or current)
    if (getSavedScatterState()) {
        if (scatterChart.options.scales.x) { scatterChart.options.scales.x.min = getSavedScatterState().x.min; scatterChart.options.scales.x.max = getSavedScatterState().x.max; }
        if (scatterChart.options.scales.y) { scatterChart.options.scales.y.min = getSavedScatterState().y.min; scatterChart.options.scales.y.max = getSavedScatterState().y.max; }
        scatterChart.isZoomed = true;
    } else if ((scatterChart.isZoomed || (scatterChart.isZoomedOrPanned && scatterChart.isZoomedOrPanned())) && currentX && currentY) {
        // Apply current min/max to new scales config
        if (scatterChart.options.scales.x) {
            scatterChart.options.scales.x.min = currentX.min;
            scatterChart.options.scales.x.max = currentX.max;
        }
        if (scatterChart.options.scales.y) {
            scatterChart.options.scales.y.min = currentY.min;
            scatterChart.options.scales.y.max = currentY.max;
        }
    }

    // Now assign the scales to options
    scatterChart.options.scales = config.options.scales;

    // Re-assign plugins/annotations (moved outside zoom check block)
    if (config.options.plugins.btcPriceLabel) {
        scatterChart.options.plugins.btcPriceLabel = {
            price: config.options.plugins.btcPriceLabel.price,
            text: config.options.plugins.btcPriceLabel.text
        };
    }
    scatterChart.options.plugins.tooltip.callbacks = config.options.plugins.tooltip.callbacks;

    // Add zoom event listeners to save state
    scatterChart.options.plugins.zoom = {
        ...scatterChart.options.plugins.zoom,
        onZoomComplete: function ({ chart }) {
            chart.isZoomed = true;
            saveSettings();
        },
        onZoomStart: function ({ chart }) {
            chart.isZoomed = false;
        }
    };

    // Restore zoom state if saved (after setting up zoom events)
    if (getSavedScatterState()) {
        scatterChart.isZoomed = true;
        scatterChart.scales.x.min = getSavedScatterState().x.min;
        scatterChart.scales.x.max = getSavedScatterState().x.max;
        scatterChart.scales.y.min = getSavedScatterState().y.min;
        scatterChart.scales.y.max = getSavedScatterState().y.max;
        scatterChart.update();
    }

    return scatterChart;
}

export function getScatterChart() {
    return scatterChart;
}

export function setScatterChart(chart) {
    scatterChart = chart;
}

// Enable resizing for scatter chart
enableChartScaleResizing('scatterChart', () => scatterChart);

// Helper function
function getCorrelatedPrice(row, rawPrice, activeEntryCurrency, currentPrices) {
    const targetCcy = activeEntryCurrency || 'USD';
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || 0);
    const fxRates = getFxRates();

    let correlatedVal = rawPrice;

    if (row.coin !== 'BTC' && btcPrice > 0 && coinPrice > 0) {
        correlatedVal = rawPrice * (btcPrice / coinPrice);
    } else if (row.coin === 'BTC') {
        correlatedVal = rawPrice;
    }

    if (targetCcy === 'USD') {
        return correlatedVal;
    }

    if (targetCcy === 'BTC') {
        if (btcPrice > 0) return rawPrice / btcPrice;
        return 0;
    }

    const rate = fxRates[targetCcy] || 1;
    return correlatedVal * rate;
}
