// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Scatter Plot
// ═══════════════════════════════════════════════════════════

import {
    getDisplayedRows, getCurrentPrices, getActiveCurrency, getActiveEntryCurrency,
    getShowSymbols, getChartHeight, getColorMaxLev, getChartHighLevSplit,
    getBubbleScale, getChartMode, getAggregationFactor, getSavedScatterState,
    getFxRates, getDecimalPlaces
} from '../state.js';
import { CURRENCY_META } from '../config.js';
import { chartPlugins, chartOptions } from './config.js';
import { saveSettings } from '../storage/settings.js';
import { 
    originalZoomConfig,
    originalScaleResizing,
    resetScatterZoom
} from './chart-mechanics-adapted.js';

// Import chart plugins - ChartZoom is already registered via CDN

let scatterChart = null;

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

    // Prepare data
    const data = displayedRows.map(r => {
        let volBTC = 0;
        if (r.coin === 'BTC') {
            volBTC = Math.abs(r.szi);
        } else if (btcPrice > 0) {
            volBTC = r.positionValue / btcPrice;
        }

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

    // Get current BTC price for annotations
    const activeCurrency = getActiveEntryCurrency();
    const fxRates = getFxRates();
    const rate = fxRates[activeCurrency] || 1;
    const refPrice = btcPrice * rate;
    
    // Annotations (current price line)
    const annotations = {
        currentPriceLine: {
            type: 'line',
            xMin: refPrice,
            xMax: refPrice,
            borderColor: 'rgba(255, 255, 255, 0.5)',
            borderWidth: 1,
            borderDash: [5, 5],
            clip: false
        }
    };

    // Configure chart based on mode
    let datasets = [];
    let chartType = 'bubble';
    let scales = {};

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
                backgroundColor: 'rgba(239, 68, 68, 0.6)',
                borderColor: 'rgba(239, 68, 68, 0.8)',
                borderWidth: 1,
                stack: 'positions'
            });
        }
        
        if (shortHighBins.some(b => b > 0)) {
            datasets.push({
                label: `Shorts (>${highLevSplit}x)`,
                data: shortHighBins,
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 1,
                stack: 'positions'
            });
        }
        
        if (longLowBins.some(b => b > 0)) {
            datasets.push({
                label: `Longs (≤${highLevSplit}x)`,
                data: longLowBins,
                backgroundColor: 'rgba(34, 197, 94, 0.6)',
                borderColor: 'rgba(34, 197, 94, 0.8)',
                borderWidth: 1,
                stack: 'positions'
            });
        }
        
        if (longHighBins.some(b => b > 0)) {
            datasets.push({
                label: `Longs (>${highLevSplit}x)`,
                data: longHighBins,
                backgroundColor: 'rgba(34, 197, 94, 0.8)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 1,
                stack: 'positions'
            });
        }
        
        scales = {
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
    } else {
        // Scatter mode - create 4 series based on leverage split
        const highLevSplit = getChartHighLevSplit();
        
        const longLowData = data.filter(d => d._raw.side === 'long' && Math.abs(d._raw.leverageValue) < highLevSplit);
        const longHighData = data.filter(d => d._raw.side === 'long' && Math.abs(d._raw.leverageValue) >= highLevSplit);
        const shortLowData = data.filter(d => d._raw.side === 'short' && Math.abs(d._raw.leverageValue) < highLevSplit);
        const shortHighData = data.filter(d => d._raw.side === 'short' && Math.abs(d._raw.leverageValue) >= highLevSplit);

        if (longLowData.length > 0) {
            datasets.push({
                label: `Longs (≤${highLevSplit}x)`,
                data: longLowData,
                backgroundColor: (context) => {
                    const lev = Math.abs(context.raw._raw.leverageValue);
                    const maxLev = getColorMaxLev();
                    const hue = 120 - Math.min(lev / maxLev, 1) * 120; // Green to yellow
                    return `hsla(${hue}, 70%, 50%, 0.6)`;
                },
                borderColor: 'rgba(34, 197, 94, 0.8)',
                borderWidth: 1
            });
        }
        
        if (longHighData.length > 0) {
            datasets.push({
                label: `Longs (>${highLevSplit}x)`,
                data: longHighData,
                backgroundColor: (context) => {
                    const lev = Math.abs(context.raw._raw.leverageValue);
                    const maxLev = getColorMaxLev();
                    const hue = 120 - Math.min(lev / maxLev, 1) * 120; // Green to yellow
                    return `hsla(${hue}, 70%, 50%, 0.9)`;
                },
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 2
            });
        }
        
        if (shortLowData.length > 0) {
            datasets.push({
                label: `Shorts (≤${highLevSplit}x)`,
                data: shortLowData,
                backgroundColor: (context) => {
                    const lev = Math.abs(context.raw._raw.leverageValue);
                    const maxLev = getColorMaxLev();
                    const hue = 0 + Math.min(lev / maxLev, 1) * 60; // Red to yellow
                    return `hsla(${hue}, 70%, 50%, 0.6)`;
                },
                borderColor: 'rgba(239, 68, 68, 0.8)',
                borderWidth: 1
            });
        }
        
        if (shortHighData.length > 0) {
            datasets.push({
                label: `Shorts (>${highLevSplit}x)`,
                data: shortHighData,
                backgroundColor: (context) => {
                    const lev = Math.abs(context.raw._raw.leverageValue);
                    const maxLev = getColorMaxLev();
                    const hue = 0 + Math.min(lev / maxLev, 1) * 60; // Red to yellow
                    return `hsla(${hue}, 70%, 50%, 0.9)`;
                },
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 2
            });
        }

        scales = {
            x: {
                type: 'linear',
                ...chartOptions.scales.x,
                min: function() {
                    const minInput = document.getElementById('minEntryCcy');
                    return minInput && minInput.value ? parseFloat(minInput.value) : undefined;
                }(),
                max: function() {
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
                title: {
                    display: true,
                    text: 'Size (BTC)',
                    color: '#5a6a88',
                    font: { size: 11 }
                }
            }
        };
    }

    // Configure chart
    const config = {
        type: chartType,
        data: { datasets },
        options: {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                legend: {
                    display: true,
                    labels: {
                        color: '#e2e8f4',
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    ...chartOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            if (chartType === 'bar') {
                                return `Count: ${context.parsed.y}`;
                            }
                            const r = context.raw._raw;
                            const lev = Math.abs(r.leverageValue);
                            const decimalPlaces = getDecimalPlaces();
                            return [
                                `${r.coin} ${r.side === 'long' ? '▲' : '▼'}`,
                                `Entry: ${sym}${context.parsed.x.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}`,
                                `Size: ${Math.abs(r.szi).toFixed(decimalPlaces)}`,
                                `Leverage: ${lev}x`,
                                `Value: $${r.positionValue.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}`
                            ];
                        }
                    }
                },
                annotation: {
                    annotations: chartType === 'bubble' ? annotations : {}
                },
                btcPriceLabel: chartType === 'bubble' ? {
                    price: refPrice,
                    text: `BTC: ${sym}${refPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                } : undefined
            },
            scales
        },
        plugins: [chartPlugins.crosshair, chartPlugins.btcGrid],
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
        const btn = document.getElementById('resetZoomBtn');
        if (btn) btn.style.display = 'block';
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
    scatterChart.options.plugins.annotation.annotations = config.options.plugins.annotation.annotations;
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
        onZoomComplete: function({chart}) {
            chart.isZoomed = true;
            saveSettings();
        },
        onZoomStart: function({chart}) {
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
enableChartScaleResizing('scatterChart', () => scatterChart, 'resetZoomBtn');

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
