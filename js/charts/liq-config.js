// ═════════════════════════════════════════════════════════
// LIQUID GLASS — Liquidation Chart Configuration
// ═════════════════════════════════════════════════════════

import { saveSettings } from '../storage/settings.js';

// Chart.js plugins and configurations for liquidation chart
export const liqChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: true,
            labels: {
                color: '#e2e8f4',
                font: { size: 12 }
            }
        },
        tooltip: {
            enabled: true,
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#fff',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
                label: function(context) {
                    if (context.chart.config.type === 'bar') {
                        return `Count: ${context.parsed.y}`;
                    }
                    const r = context.raw._raw;
                    return [
                        `${r.coin} ${r.side === 'long' ? '▲' : '▼'}`,
                        `Liq Price: ${context.parsed.x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        `Size: ${Math.abs(r.szi).toFixed(4)}`,
                        `Value: $${r.positionValue.toLocaleString()}`
                    ];
                }
            }
        },
        annotation: {
            annotations: {}
        },
        zoom: {
            pan: {
                enabled: true,
                mode: 'xy',
                modifierKey: null,
                onPan: ({chart}) => {
                     chart.isZoomed = true;
                     saveSettings();
                }
            },
            zoom: {
                wheel: { enabled: true, modifierKey: 'ctrl' },
                drag: { enabled: true, modifierKey: 'shift' },
                pinch: { enabled: true },
                mode: 'xy',
                onZoom: ({chart}) => {
                     chart.isZoomed = true;
                     saveSettings();
                }
            }
        }
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
