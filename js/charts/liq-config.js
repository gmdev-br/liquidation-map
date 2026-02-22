// ═════════════════════════════════════════════════════════
// LIQUID GLASS — Liquidation Chart Configuration
// ═════════════════════════════════════════════════════════

import { saveSettings } from '../storage/settings.js';

// Chart.js plugins and configurations for liquidation chart
export const liqChartOptions = {
    animation: false,
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
                label: function (context) {
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
                onPan: ({ chart }) => {
                    chart.isZoomed = true;
                    saveSettings();
                }
            },
            zoom: {
                wheel: { enabled: true, modifierKey: 'ctrl' },
                drag: { enabled: true, modifierKey: 'shift' },
                pinch: { enabled: true },
                mode: 'xy',
                onZoom: ({ chart }) => {
                    chart.isZoomed = true;
                    saveSettings();
                }
            }
        }
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
