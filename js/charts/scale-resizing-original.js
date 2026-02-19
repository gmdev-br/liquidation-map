// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Charts Scatter Plot (Original System)
// ═══════════════════════════════════════════════════════════

// This file replaces the current system with the original working version
// from https://gmdev-br.github.io/liquidation-map/

// ── Chart Scale Resizing (Original Implementation) ──
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

// Export the function for use in the main system
export { enableChartScaleResizing };
