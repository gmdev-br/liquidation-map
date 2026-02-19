// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Configuration
// ═══════════════════════════════════════════════════════════

// Chart.js plugins and configurations
export const chartPlugins = {
    crosshair: {
        id: 'crosshair',
        defaults: {
            width: 1,
            color: 'rgba(255, 255, 255, 0.2)',
            dash: [3, 3]
        },
        afterInit: (chart, args, options) => {
            chart.crosshair = { x: 0, y: 0, visible: false };
        },
        afterEvent: (chart, args) => {
            const { inChartArea } = args;
            const { x, y } = args.event;
            chart.crosshair = { x, y, visible: inChartArea };
            args.changed = true;
        },
        afterDraw: (chart, args, options) => {
            if (chart.crosshair && chart.crosshair.visible) {
                const { ctx, chartArea: { top, bottom, left, right }, scales: { x: xScale, y: yScale } } = chart;
                const { x, y } = chart.crosshair;

                ctx.save();
                
                ctx.beginPath();
                ctx.lineWidth = options.width;
                ctx.strokeStyle = options.color;
                ctx.setLineDash(options.dash);
                
                ctx.moveTo(x, top);
                ctx.lineTo(x, bottom);
                ctx.moveTo(left, y);
                ctx.lineTo(right, y);
                ctx.stroke();

                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                const xValue = xScale.getValueForPixel(x);
                const xLabel = xValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
                const xLabelWidth = ctx.measureText(xLabel).width + 12;
                const xLabelHeight = 20;
                
                ctx.fillStyle = 'rgba(7, 12, 26, 0.9)';
                ctx.fillRect(x - xLabelWidth / 2, bottom, xLabelWidth, xLabelHeight);
                
                ctx.fillStyle = '#e2e8f4';
                ctx.fillText(xLabel, x, bottom + 10);

                const yValue = yScale.getValueForPixel(y);
                const yLabel = yValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                const yLabelWidth = ctx.measureText(yLabel).width + 12;
                const yLabelHeight = 20;
                
                ctx.fillStyle = 'rgba(7, 12, 26, 0.9)';
                ctx.fillRect(left - yLabelWidth, y - yLabelHeight / 2, yLabelWidth, yLabelHeight);
                
                ctx.textAlign = 'right';
                ctx.fillStyle = '#e2e8f4';
                ctx.fillText(yLabel, left - 6, y);

                ctx.restore();
            }
        }
    }
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
            borderColor: 'rgba(255, 255, 255, 0.1)',
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
        zoom: {
            pan: {
                enabled: true,
                mode: 'xy',
                onPan: function({chart}) {
                    chart.update('none');
                }
            },
            zoom: {
                wheel: {
                    enabled: true,
                    speed: 0.1
                },
                pinch: {
                    enabled: true
                },
                drag: {
                    enabled: true,
                    backgroundColor: 'rgba(225, 225, 225, 0.3)'
                },
                mode: 'xy'
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
