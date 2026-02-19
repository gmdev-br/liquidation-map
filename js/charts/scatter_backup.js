// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Scatter Plot
// ═══════════════════════════════════════════════════════════

import {
    getDisplayedRows, getCurrentPrices, getActiveCurrency, getActiveEntryCurrency,
    getShowSymbols, getChartHeight, getColorMaxLev, getChartHighLevSplit,
    getBubbleScale, getChartMode, getAggregationFactor, getSavedScatterState,
    getFxRates
} from '../state.js';
import { CURRENCY_META } from '../config.js';
import { chartPlugins, chartOptions } from './config.js';
import { saveSettings } from '../storage/settings.js';

// Register zoom plugin
Chart.register(window.ChartZoom);

let scatterChart = null;

// ── Chart Scale Resizing ──
export function enableChartScaleResizing(canvasId, getChartInstance, resetBtnId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    let isDragging = false;
    let dragAxis = null;
    let startPos = 0;
    let initialMin = 0;
    let initialMax = 0;

    // Update cursor based on mouse position
    function updateCursor(e) {
        const chart = getChartInstance();
        if (!chart || isDragging) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const { left, right, top, bottom } = chart.chartArea;
        
        // Y Axis (Left) - ns-resize for vertical scaling
        if (x < left && y >= top && y <= bottom) {
            canvas.style.cursor = 'ns-resize';
        }
        // X Axis (Bottom) - ew-resize for horizontal scaling
        else if (y > bottom && x >= left && x <= right) {
            canvas.style.cursor = 'ew-resize';
        } else {
            canvas.style.cursor = 'default';
        }
    }

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
    });

    canvas.addEventListener('mousemove', updateCursor);
    canvas.addEventListener('mouseenter', updateCursor);

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || !dragAxis) return;
        
        const chart = getChartInstance();
        if (!chart) return;
        
        const rect = canvas.getBoundingClientRect();
        const pos = dragAxis === 'y' ? e.clientY - rect.top : e.clientX - rect.left;
        const scale = chart.scales[dragAxis];
        const isLog = scale.type === 'logarithmic';
        const sensitivity = 2.0;
        
        const delta = pos - startPos;
        const height = chart.chartArea.bottom - chart.chartArea.top;
        const width = chart.chartArea.right - chart.chartArea.left;
        
        if (dragAxis === 'y') {
            const factor = (delta / height) * sensitivity;
            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const logRange = logMax - logMin;
                const newLogCenter = (logMin + logMax) / 2;
                const newLogRange = logRange * (1 - factor); // Inverted: right drag = zoom out
                
                scale.min = Math.exp(newLogCenter - newLogRange / 2);
                scale.max = Math.exp(newLogCenter + newLogRange / 2);
            } else {
                const range = initialMax - initialMin;
                const center = (initialMax + initialMin) / 2;
                const newRange = range * (1 - factor); // Inverted: right drag = zoom out
                
                scale.min = center - newRange / 2;
                scale.max = center + newRange / 2;
            }
        } else {
            const factor = (delta / width) * sensitivity;
            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const logRange = logMax - logMin;
                const newLogCenter = (logMin + logMax) / 2;
                const newLogRange = logRange * (1 - factor); // Inverted: right drag = zoom out
                
                scale.min = Math.exp(newLogCenter - newLogRange / 2);
                scale.max = Math.exp(newLogCenter + newLogRange / 2);
            } else {
                const range = initialMax - initialMin;
                const center = (initialMax + initialMin) / 2;
                const newRange = range * (1 - factor); // Inverted: right drag = zoom out
                
                scale.min = center - newRange / 2;
                scale.max = center + newRange / 2;
            }
        }
        
        chart.update('none');
        
        if (resetBtnId) {
            const btn = document.getElementById(resetBtnId);
            if (btn) btn.style.display = 'block';
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragAxis = null;
            canvas.style.cursor = 'default';
            
            const chart = getChartInstance();
            if (chart) {
                chart.isZoomed = true;
                saveSettings();
            }
        }
    });

    // Show reset button when zoomed, hide when reset
    function updateResetButtonVisibility() {
        if (!resetBtnId) return;
        
        const chart = getChartInstance();
        const btn = document.getElementById(resetBtnId);
        
        if (chart && btn) {
            const isZoomed = chart.isZoomed || 
                (chart.scales.x.min !== undefined && chart.scales.x.max !== undefined);
            btn.style.display = isZoomed ? 'block' : 'none';
        }
    }

    // Update reset button visibility when chart changes
    canvas.addEventListener('mouseup', updateResetButtonVisibility);
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

    // Prepare datasets
    const longData = data.filter(d => d._raw.side === 'long');
    const shortData = data.filter(d => d._raw.side === 'short');

    const datasets = [];
    
    if (longData.length > 0) {
        datasets.push({
            label: 'Long',
            data: longData,
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
    
    if (shortData.length > 0) {
        datasets.push({
            label: 'Short',
            data: shortData,
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

    // Configure chart
    const config = {
        type: 'bubble',
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
                            const r = context.raw._raw;
                            const lev = Math.abs(r.leverageValue);
                            return [
                                `${r.coin} ${r.side === 'long' ? '▲' : '▼'}`,
                                `Entry: ${sym}${context.parsed.x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                `Size: ${Math.abs(r.szi).toFixed(4)}`,
                                `Leverage: ${lev}x`,
                                `Value: $${r.positionValue.toLocaleString()}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    ...chartOptions.scales.x,
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
            }
        },
        plugins: [chartPlugins.crosshair]
    };

    if (scatterChart) {
        scatterChart.destroy();
    }

    scatterChart = new Chart(ctx, config);

    // Add zoom event listeners to save state
    scatterChart.options.plugins.zoom = {
        ...scatterChart.options.plugins.zoom,
        onZoomComplete: function({chart}) {
            chart.isZoomed = true;
            const liqChart = window.getLiqChartInstance ? window.getLiqChartInstance() : null;
            saveSettings(null, null, null, chart, liqChart);
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

// Enable resizing for scatter chart after it's created
export function initScatterChartResizing() {
    enableChartScaleResizing('scatterChart', () => scatterChart);
}

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
