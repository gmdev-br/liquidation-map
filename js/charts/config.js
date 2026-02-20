// ═══════════════════════════════════════════════════════
// LIQUID GLASS — Charts Configuration (Adapted for Current Project)
// ═══════════════════════════════════════════════════════════

// Import chart mechanics from adapted implementation
import { 
    crosshairPlugin, 
    btcPriceLabelPlugin,
    btcGridPlugin
} from './chart-mechanics-adapted.js';

import { 
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
    btcPriceLabel: btcPriceLabelPlugin,
    btcGrid: btcGridPlugin
};

export const chartMechanics = {
    setupChartHeightResizing,
    setupColumnResizing
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
            backgroundColor: 'rgba(7, 12, 26, 0.98)',
            titleColor: '#e2e8f4',
            bodyColor: '#e2e8f4',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
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
                color: 'rgba(255, 255, 255, 0.04)',
                drawBorder: false
            },
            ticks: {
                color: '#6b7280',
                font: {
                    size: 11
                }
            },
            min: 0
        },
        y: {
            grid: {
                color: 'rgba(255, 255, 255, 0.04)',
                drawBorder: false
            },
            ticks: {
                color: '#6b7280',
                font: {
                    size: 11
                }
            },
            min: 0
        }
    }
};
