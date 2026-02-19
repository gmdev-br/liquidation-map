// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Liquidation
// ═══════════════════════════════════════════════════════════

import {
    getDisplayedRows, getCurrentPrices, getActiveEntryCurrency, getShowSymbols,
    getLiqChartHeight, getChartMode, getAggregationFactor, getSavedLiqState,
    getFxRates, getChartHighLevSplit, getColorMaxLev
} from '../state.js';
import { CURRENCY_META } from '../config.js';
import { chartPlugins, chartOptions } from './config.js';
import { liqChartOptions } from './liq-config.js';
import { getCorrelatedPrice } from '../utils/currency.js';
import { saveSettings } from '../storage/settings.js';
import { 
    originalScaleResizing,
    resetLiqZoom
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

    // Prepare data
    const data = displayedRows.map(r => {
        let volBTC = 0;
        if (r.coin === 'BTC') {
            volBTC = Math.abs(r.szi);
        } else if (btcPrice > 0) {
            volBTC = r.positionValue / btcPrice;
        }

        const liqPrice = r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx, activeEntryCurrency, currentPrices, getFxRates()) : 0;
        
        if (liqPrice <= 0) return null;

        return {
            x: liqPrice,
            y: volBTC,
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
    
    // Annotations (shared)
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
        // Histogram mode
        chartType = 'bar';
        
        // Create bins
        const xValues = data.map(d => d.x);
        const minX = Math.min(...xValues, refPrice);
        const maxX = Math.max(...xValues, refPrice);
        
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
                backgroundColor: 'rgba(34, 197, 94, 0.6)',
                borderColor: 'rgba(34, 197, 94, 0.8)',
                borderWidth: 1
            });
        }
        
        if (longHighData.length > 0) {
            datasets.push({
                label: `Longs (>${highLevSplit}x)`,
                data: longHighData,
                backgroundColor: 'rgba(34, 197, 94, 0.9)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 2
            });
        }
        
        if (shortLowData.length > 0) {
            datasets.push({
                label: `Shorts (≤${highLevSplit}x)`,
                data: shortLowData,
                backgroundColor: 'rgba(239, 68, 68, 0.6)',
                borderColor: 'rgba(239, 68, 68, 0.8)',
                borderWidth: 1
            });
        }
        
        if (shortHighData.length > 0) {
            datasets.push({
                label: `Shorts (>${highLevSplit}x)`,
                data: shortHighData,
                backgroundColor: 'rgba(239, 68, 68, 0.9)',
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

    const config = {
        type: chartType,
        data: { datasets },
        options: {
            ...liqChartOptions,
            plugins: {
                ...liqChartOptions.plugins,
                legend: {
                    display: true,
                    labels: {
                        color: '#e2e8f4',
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    ...liqChartOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            if (chartType === 'bar') {
                                return `Count: ${context.parsed.y}`;
                            }
                            const r = context.raw._raw;
                            return [
                                `${r.coin} ${r.side === 'long' ? '▲' : '▼'}`,
                                `Liq Price: ${sym}${context.parsed.x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                `Size: ${Math.abs(r.szi).toFixed(4)}`,
                                `Value: $${r.positionValue.toLocaleString()}`
                            ];
                        }
                    }
                },
                annotation: {
                    annotations
                },
                zoom: liqChartOptions.plugins.zoom
            },
            scales
        },
        plugins: [chartPlugins.crosshair, chartPlugins.btcGrid]
    };

    if (liqChartInstance) {
        liqChartInstance.destroy();
    }

    liqChartInstance = new Chart(ctx, config);

    // Add zoom event listeners to save state
    liqChartInstance.options.plugins.zoom = {
        ...liqChartInstance.options.plugins.zoom,
        onZoomComplete: function({chart}) {
            chart.isZoomed = true;
            const scatterChart = window.getScatterChart ? window.getScatterChart() : null;
            saveSettings(null, null, null, scatterChart, chart);
        },
        onZoomStart: function({chart}) {
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
enableChartScaleResizing('liqChart', () => liqChartInstance, 'resetLiqZoomBtn');
