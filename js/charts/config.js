// ═══════════════════════════════════════════════════════
// LIQUID GLASS — Charts Configuration (Adapted for Current Project)
// ═══════════════════════════════════════════════════════════

// Import chart mechanics from adapted implementation
import { 
    crosshairPlugin, 
    btcPriceLabelPlugin, 
    originalZoomConfig,
    liqZoomConfig,
    originalScaleResizing,
    setupChartHeightResizing,
    setupColumnResizing,
    resetScatterZoom,
    resetLiqZoom
} from './chart-mechanics-adapted.js';

// Chart.js plugins and configurations (Adapted)
export const chartPlugins = {
    crosshair: crosshairPlugin,
    btcPriceLabel: btcPriceLabelPlugin
};

export const chartMechanics = {
    setupChartHeightResizing,
    setupColumnResizing,
    resetScatterZoom,
    resetLiqZoom
};

export const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false
        },
        tooltip: {
            enabled: true,
            backgroundColor: 'rgba(7, 12, 26, 0.95)',
            titleColor: '#e2e8f4',
            bodyColor: '#e2e8f4',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
                label: function(context) {
                    return context.parsed.y !== undefined ? 
                        `Value: ${context.parsed.y.toLocaleString()}` : '';
                }
            }
        },
        zoom: originalZoomConfig
    },
    scales: {
        x: {
            grid: {
                color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
                color: '#5a6a88',
                font: {
                    size: 11
                }
            }
        },
        y: {
            grid: {
                color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
                color: '#5a6a88',
                font: {
                    size: 11
                }
            }
        }
    }
};
