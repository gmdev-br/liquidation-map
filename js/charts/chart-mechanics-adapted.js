// ═════════════════════════════════════════════════════════
// LIQUID GLASS — Chart Mechanics (Adapted for Current Project)
// ═══════════════════════════════════════════════════════════

// This file contains the chart mechanics adapted for the current project structure
// Import saveSettings from the correct location
import { saveSettings } from '../storage/settings.js';

// ── Crosshair Plugin (Adapted) ──
export const crosshairPlugin = {
    id: 'crosshair',
    defaults: {
        width: 1,
        color: 'rgba(255, 255, 255, 0.2)',
        dash: [3, 3]
    },
    afterInit: (chart, _args, _options) => {
        chart.crosshair = { x: 0, y: 0, visible: false };
    },
    afterEvent: (chart, args) => {
        const { inChartArea } = args;
        const { x, y } = args.event;
        chart.crosshair = { x, y, visible: inChartArea };
        args.changed = true;
    },
    afterDraw: (chart, _args, options) => {
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
};

// ── BTC Price Label Plugin (Adapted) ──
export const btcPriceLabelPlugin = {
    id: 'btcPriceLabel',
    afterDraw: (chart) => {
        const opts = chart.options.plugins.btcPriceLabel;
        if (!opts || !opts.text) return;
        
        const { ctx, chartArea: { bottom, left, right }, scales: { x } } = chart;
        const xVal = x.getPixelForValue(opts.price);
        
        if (xVal < left || xVal > right) return;
        
        const text = opts.text;
        ctx.save();
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(text).width + 16;
        const textHeight = 22;
        const yPos = bottom + 25;
        
        ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
        ctx.beginPath();
        const r = 4;
        ctx.roundRect(xVal - textWidth / 2, yPos, textWidth, textHeight, r);
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(xVal, yPos);
        ctx.lineTo(xVal - 5, yPos + 6);
        ctx.lineTo(xVal + 5, yPos + 6);
        ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
        ctx.fill();
        
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, xVal, yPos + textHeight / 2);
        
        ctx.restore();
    }
};

// ── Chart Zoom Configuration (Adapted for Current Project) ──
export const originalZoomConfig = {
    pan: {
        enabled: true,
        mode: 'xy',
        modifierKey: null,
        onPan: function({chart}) { 
            chart.isZoomed = true; 
            saveSettings(); 
        }
    },
    zoom: {
        wheel: { 
            enabled: true,
            speed: 0.05,
            modifierKey: 'ctrl',
        },
        pinch: { enabled: true },
        drag: {
            enabled: true,
            backgroundColor: 'rgba(156, 163, 175, 0.2)',
            borderColor: 'rgba(156, 163, 175, 0.4)',
            borderWidth: 1,
            modifierKey: 'shift',
        },
        mode: 'xy',
        onZoom: function({chart}) { 
            chart.isZoomed = true; 
            saveSettings(); 
        }
    }
};

// ── Liquidation Chart Zoom Configuration (Adapted) ──
export const liqZoomConfig = {
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
};

// ── Chart Scale Resizing (Adapted for Current Project) ──
export function originalScaleResizing(canvasId, getChartInstance, resetBtnId) {
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

// ── Chart Reset Functions (Adapted) ──
export function resetScatterZoom(chart) {
    if (chart) {
        chart.resetZoom();
        chart.isZoomed = false;
        saveSettings();
    }
}

export function resetLiqZoom(chart) {
    if (chart) {
        chart.resetZoom();
        chart.isZoomed = false;
        saveSettings();
    }
}

// ── Chart Height Resizing (Adapted) ──
export function setupChartHeightResizing(sectionId, heightKey, updateCallback) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    // Helper to get Y position from mouse or touch event
    function getYPosition(e) {
        if (e.touches && e.touches.length > 0) {
            return e.touches[0].clientY;
        }
        return e.clientY;
    }

    // Helper to check if event target is the resizer handle
    function isResizerHandle(e) {
        const target = e.target;
        return target.classList.contains('chart-resizer-handle') ||
               target.closest('.chart-resizer-handle') ||
               target.classList.contains('chart-resizer');
    }

    // Start resize
    function startResize(e) {
        if (!isResizerHandle(e)) return;

        isResizing = true;
        startY = getYPosition(e);
        startHeight = section.offsetHeight;

        document.addEventListener('mousemove', chartResize);
        document.addEventListener('mouseup', stopChartResize);
        document.addEventListener('touchmove', chartResize, { passive: false });
        document.addEventListener('touchend', stopChartResize);

        // Add active class for visual feedback
        const resizer = section.querySelector('.chart-resizer');
        if (resizer) resizer.classList.add('active');

        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
    }

    function chartResize(e) {
        if (!isResizing) return;
        e.preventDefault(); // Prevent scrolling on mobile

        const currentY = getYPosition(e);
        const deltaY = currentY - startY;
        const newHeight = Math.max(200, startHeight + deltaY);
        updateCallback(newHeight);
    }

    function stopChartResize() {
        if (!isResizing) return;
        isResizing = false;

        document.removeEventListener('mousemove', chartResize);
        document.removeEventListener('mouseup', stopChartResize);
        document.removeEventListener('touchmove', chartResize);
        document.removeEventListener('touchend', stopChartResize);

        const resizer = section.querySelector('.chart-resizer');
        if (resizer) resizer.classList.remove('active');

        document.body.style.cursor = '';
        saveSettings(); // Save new height
    }

    section.addEventListener('mousedown', startResize);
    section.addEventListener('touchstart', startResize, { passive: false });
}

// ── Column Width Resizing (Adapted) ──
export function setupColumnResizing() {
    console.log('Setting up column resizing...');
    
    // Helper to get X position from mouse or touch event
    function getXPosition(e) {
        if (e.touches && e.touches.length > 0) {
            return e.touches[0].pageX;
        }
        return e.pageX;
    }

    function startResize(e) {
        const th = e.target.closest('th');
        if (!th || !th.id || !th.id.startsWith('th-')) return;
        
        const resizer = th.querySelector('.resizer');
        if (!resizer || e.target !== resizer) return;

        console.log('Column resizer clicked:', th.id);
        const startX = getXPosition(e);
        const startWidth = th.offsetWidth;
        
        // Prevent drag-and-drop during resize
        e.stopPropagation();
        e.preventDefault();
        
        document.body.classList.add('resizing');
        resizer.classList.add('active');

        const onMove = (e) => {
            const currentX = getXPosition(e);
            const width = startWidth + (currentX - startX);
            if (width > 30) {
                th.style.width = width + 'px';
            }
        };

        const onEnd = () => {
            document.body.classList.remove('resizing');
            resizer.classList.remove('active');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove, { passive: false });
            window.removeEventListener('touchend', onEnd);
            saveSettings();
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
    }

    // Mouse events
    document.addEventListener('mousedown', startResize);
    
    // Touch events
    document.addEventListener('touchstart', startResize, { passive: false });

    // Double-click to auto-fit column width
    document.addEventListener('dblclick', (e) => {
        const th = e.target.closest('th');
        if (!th || !th.id || !th.id.startsWith('th-')) return;
        
        const resizer = th.querySelector('.resizer');
        if (!resizer || e.target !== resizer) return;

        console.log('Column resizer double-clicked:', th.id);
        e.stopPropagation();
        e.preventDefault();

        // Calculate optimal width based on content
        const columnKey = th.id.replace('th-', '');
        const table = th.closest('table');
        if (!table) return;

        // Get all cells in this column
        const headerCell = th;
        const bodyCells = Array.from(table.querySelectorAll(`tbody td.${columnKey}`));
        
        // Create a temporary element to measure text width
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.whiteSpace = 'nowrap';
        tempDiv.style.padding = '0';
        tempDiv.style.margin = '0';
        tempDiv.style.font = window.getComputedStyle(headerCell).font;
        document.body.appendChild(tempDiv);

        let maxWidth = 0;

        // Measure header text
        tempDiv.textContent = headerCell.textContent.trim();
        const headerWidth = tempDiv.offsetWidth;
        maxWidth = Math.max(maxWidth, headerWidth);

        // Measure all body cells
        bodyCells.forEach(cell => {
            tempDiv.textContent = cell.textContent.trim();
            const cellWidth = tempDiv.offsetWidth;
            maxWidth = Math.max(maxWidth, cellWidth);
        });

        document.body.removeChild(tempDiv);

        // Add padding (approximately 20px for cell padding + borders)
        const optimalWidth = maxWidth + 40;
        
        // Apply the optimal width with a minimum of 60px
        const finalWidth = Math.max(60, optimalWidth);
        
        console.log(`Auto-fitting column ${columnKey} to ${finalWidth}px`);
        th.style.width = finalWidth + 'px';
        
        saveSettings();
    });
}

// ── BTC Grid Plugin (Vertical lines every 500 BTC points) ──
export const btcGridPlugin = {
    id: 'btcGrid',
    defaults: {
        minorInterval: 500, // Will be overridden by user input
        majorInterval: 2500, // Will be calculated as 5x minor
        minorColor: 'rgba(255, 255, 255, 0.05)',
        minorWidth: 1,
        majorColor: 'rgba(255, 255, 255, 0.12)',
        majorWidth: 1.5,
        horizontalColor: 'rgba(255, 255, 255, 0.05)',
        horizontalWidth: 1
    },
    afterDraw: (chart, _args, options) => {
        const { ctx, chartArea: { top, bottom, left, right }, scales: { x: xScale, y: yScale } } = chart;
        
        if (!xScale || !yScale) return;
        
        ctx.save();
        
        // Get grid spacing from user input
        const gridSpacingInput = document.getElementById('gridSpacingRange');
        const userGridSpacing = gridSpacingInput && gridSpacingInput.value ? parseInt(gridSpacingInput.value) : 500;
        
        // Get filter values from inputs
        const minEntryInput = document.getElementById('minEntryCcy');
        const maxEntryInput = document.getElementById('maxEntryCcy');
        const minPrice = minEntryInput && minEntryInput.value ? parseFloat(minEntryInput.value) : (xScale.min || 0);
        const maxPrice = maxEntryInput && maxEntryInput.value ? parseFloat(maxEntryInput.value) : (xScale.max || 100000);
        
        // Update intervals based on user spacing
        const minorInterval = userGridSpacing;
        const majorInterval = userGridSpacing * 5;
        
        // Draw minor vertical lines
        const startMinor = Math.ceil(minPrice / minorInterval) * minorInterval;
        
        ctx.strokeStyle = options.minorColor;
        ctx.lineWidth = options.minorWidth;
        
        for (let price = startMinor; price <= maxPrice; price += minorInterval) {
            const xPixel = xScale.getPixelForValue(price);
            if (xPixel >= left && xPixel <= right) {
                ctx.beginPath();
                ctx.moveTo(xPixel, top);
                ctx.lineTo(xPixel, bottom);
                ctx.stroke();
            }
        }
        
        // Draw major vertical lines with labels
        const startMajor = Math.ceil(minPrice / majorInterval) * majorInterval;
        
        ctx.strokeStyle = options.majorColor;
        ctx.lineWidth = options.majorWidth;
        
        for (let price = startMajor; price <= maxPrice; price += majorInterval) {
            const xPixel = xScale.getPixelForValue(price);
            if (xPixel >= left && xPixel <= right) {
                ctx.beginPath();
                ctx.moveTo(xPixel, top);
                ctx.lineTo(xPixel, bottom);
                ctx.stroke();
                
                // Add price labels for major grid lines
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(price.toLocaleString(), xPixel, top - 5);
            }
        }
        
        // Draw horizontal lines
        ctx.strokeStyle = options.horizontalColor;
        ctx.lineWidth = options.horizontalWidth;
        
        const yTicks = yScale.getTicks();
        yTicks.forEach(tick => {
            const yPixel = yScale.getPixelForValue(tick.value);
            if (yPixel >= top && yPixel <= bottom) {
                ctx.beginPath();
                ctx.moveTo(left, yPixel);
                ctx.lineTo(right, yPixel);
                ctx.stroke();
            }
        });
        
        ctx.restore();
    }
};

// ── Export All Mechanics (Adapted) ──
export const chartMechanics = {
    crosshairPlugin,
    btcPriceLabelPlugin,
    btcGridPlugin,
    originalZoomConfig,
    liqZoomConfig,
    originalScaleResizing,
    setupChartHeightResizing,
    setupColumnResizing,
    resetScatterZoom,
    resetLiqZoom
};
