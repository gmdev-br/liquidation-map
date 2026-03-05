// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Virtual Scrolling
// ═══════════════════════════════════════════════════════════

/**
 * Virtual scrolling implementation for large tables
 * Only renders visible rows + buffer to improve performance
 */
export class VirtualScroll {
    constructor(options = {}) {
        this.rowHeight = options.rowHeight || 52;
        this.rowHeightMeasured = false;
        this.bufferSize = options.bufferSize || 5;
        this.keyField = options.keyField || null;
        this.tbody = options.tbody;
        this.data = [];
        this.scrollTop = 0;
        this.totalHeight = 0;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this._scrollHandler = null;

        if (!this.tbody) {
            console.error('VirtualScroll: tbody element is required');
            return;
        }

        this.setupScrollListener();
    }

    setupScrollListener() {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (!tableContainer) {
            console.error('VirtualScroll: Could not find .table-wrap container');
            return;
        }

        let ticking = false;
        this._scrollHandler = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    this.handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        };

        tableContainer.addEventListener('scroll', this._scrollHandler, { passive: true });
    }

    handleScroll() {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (!tableContainer) return;

        this.scrollTop = tableContainer.scrollTop;

        const oldStart = this.visibleStart;
        const oldEnd = this.visibleEnd;

        this.updateVisibleRange();

        // Only render if visible range changed
        if (this.visibleStart !== oldStart || this.visibleEnd !== oldEnd) {
            this.render();
        }
    }

    updateVisibleRange() {
        const containerEl = this.tbody.closest('.table-wrap');
        const containerHeight = containerEl?.clientHeight || 800;

        // Calculate visible rows
        const visibleRowsCount = Math.ceil(containerHeight / this.rowHeight) + 2;

        const startRow = Math.max(0, Math.floor(this.scrollTop / this.rowHeight) - this.bufferSize);
        const endRow = Math.min(
            this.data.length,
            startRow + visibleRowsCount + this.bufferSize * 2
        );

        this.visibleStart = startRow;
        this.visibleEnd = endRow;
    }

    setData(data) {
        this.data = data;
        this.totalHeight = data.length * this.rowHeight;

        // Reset scroll position when data changes significantly
        const tableContainer = this.tbody.closest('.table-wrap');
        if (tableContainer && this.data.length > 0) {
            // Only reset if we have new data and were at the top
            if (this.scrollTop === 0) {
                tableContainer.scrollTop = 0;
            }
        }

        this.updateVisibleRange();
        this.render(true);

        // Calibrate row height only once
        if (!this.rowHeightMeasured) {
            requestAnimationFrame(() => {
                this._calibrateRowHeight();
                if (this.rowHeightMeasured) {
                    this.updateVisibleRange();
                    this.render(true);
                }
            });
        }
    }

    _calibrateRowHeight() {
        const firstDataRow = this.tbody.querySelector('tr:not(.vs-top-spacer):not(.vs-bottom-spacer)');
        if (firstDataRow) {
            const measuredHeight = firstDataRow.getBoundingClientRect().height;
            if (measuredHeight > 10) {
                this.rowHeight = measuredHeight;
                this.rowHeightMeasured = true;
                this.totalHeight = this.data.length * this.rowHeight;
            }
        }
    }

    render(forceUpdate = false) {
        if (!this.tbody) return;

        const paddingTop = this.visibleStart * this.rowHeight;
        const paddingBottom = Math.max(0, (this.data.length - this.visibleEnd) * this.rowHeight);

        // Create or update top spacer
        let topSpacer = this.tbody.querySelector('.vs-top-spacer');
        if (!topSpacer) {
            topSpacer = document.createElement('tr');
            topSpacer.className = 'vs-top-spacer';
            topSpacer.innerHTML = '<td colspan="25" style="padding: 0; border: none;"></td>';
            this.tbody.appendChild(topSpacer);
        }
        topSpacer.style.height = `${paddingTop}px`;

        // Create or update bottom spacer
        let bottomSpacer = this.tbody.querySelector('.vs-bottom-spacer');
        if (!bottomSpacer) {
            bottomSpacer = document.createElement('tr');
            bottomSpacer.className = 'vs-bottom-spacer';
            bottomSpacer.innerHTML = '<td colspan="25" style="padding: 0; border: none;"></td>';
            this.tbody.appendChild(bottomSpacer);
        }
        bottomSpacer.style.height = `${paddingBottom}px`;

        // Get current data rows (excluding spacers)
        const existingRows = Array.from(this.tbody.querySelectorAll('tr:not(.vs-top-spacer):not(.vs-bottom-spacer)'));
        const neededRowsCount = this.visibleEnd - this.visibleStart;

        // Adjust number of rows
        while (existingRows.length < neededRowsCount) {
            const tr = document.createElement('tr');
            this.tbody.insertBefore(tr, bottomSpacer);
            existingRows.push(tr);
        }
        while (existingRows.length > neededRowsCount) {
            const tr = existingRows.pop();
            if (tr) tr.remove();
        }

        // Update row content
        for (let i = 0; i < neededRowsCount; i++) {
            const rowIndex = this.visibleStart + i;
            const rowData = this.data[rowIndex];
            const tr = existingRows[i];

            if (!rowData || !tr) continue;

            // Check if we need to update this row
            const currentIndex = parseInt(tr.dataset.index, 10);
            const currentKey = tr.dataset.key;
            const dataKey = String(rowData[this.keyField] || rowIndex);

            if (!forceUpdate && !isNaN(currentIndex) && currentIndex === rowIndex && currentKey === dataKey) {
                continue;
            }

            // Get HTML for row
            const html = rowData.html || this.renderRow(rowData, rowIndex);

            // Update row
            tr.dataset.index = String(rowIndex);
            tr.dataset.key = String(rowData[this.keyField] || rowIndex);

            // If html is a complete <tr>...</tr>, extract inner content and class
            if (html.trim().toLowerCase().startsWith('<tr')) {
                // Extract class attribute from tr tag
                const classMatch = html.match(/<tr[^>]*class=["']([^"']*)["'][^>]*>/i);
                const rowClass = classMatch ? classMatch[1] : '';
                
                // Apply class to the tr element
                if (rowClass) {
                    tr.className = rowClass;
                } else {
                    tr.className = '';
                }
                
                // Extract content between <tr> and </tr>
                const match = html.match(/<tr[^>]*>([\s\S]*)<\/tr>/i);
                if (match) {
                    tr.innerHTML = match[1];
                } else {
                    tr.innerHTML = html;
                }
            } else {
                tr.className = '';
                tr.innerHTML = html;
            }
        }
    }

    renderRow(row, index) {
        // Default row renderer - override in subclass or pass as option
        return `<tr><td>Row ${index}</td></tr>`;
    }

    scrollToIndex(index) {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (!tableContainer) return;

        const containerHeight = tableContainer.clientHeight;
        const rowTop = index * this.rowHeight;
        const centeredTop = rowTop - (containerHeight / 2) + (this.rowHeight / 2);

        const maxScroll = Math.max(0, this.totalHeight - containerHeight);
        const clampedTop = Math.max(0, Math.min(centeredTop, maxScroll));

        tableContainer.scrollTop = clampedTop;
    }

    destroy() {
        const tableContainer = this.tbody?.closest('.table-wrap');
        if (tableContainer && this._scrollHandler) {
            tableContainer.removeEventListener('scroll', this._scrollHandler);
        }
        this.data = [];
        this._scrollHandler = null;
    }
}

/**
 * Simple virtual scroll for table rows
 * Only enables when row count exceeds threshold
 */
export function enableVirtualScroll(tbodyId = 'positionsTableBody', options = {}) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) {
        console.error('enableVirtualScroll: tbody not found:', tbodyId);
        return null;
    }

    const threshold = options.threshold || 100;
    let rowHeight = options.rowHeight || 52;
    const bufferSize = options.bufferSize || 5;

    let virtualScroll = null;
    let currentRenderer = null;

    const renderFn = (rows, rowRenderer) => {
        if (rowRenderer) currentRenderer = rowRenderer;

        const renderer = rowRenderer || currentRenderer;
        if (!renderer) {
            console.error('VirtualScroll: No row renderer provided');
            return;
        }

        if (rows.length > threshold) {
            if (!virtualScroll) {
                virtualScroll = new VirtualScroll({
                    tbody,
                    rowHeight,
                    bufferSize
                });
            }

            virtualScroll.renderRow = renderer;

            // Clean up old rows on first virtualization
            if (virtualScroll.data.length === 0) {
                tbody.innerHTML = '';
            }

            virtualScroll.setData(rows);
        } else {
            // Disable virtual scroll for small datasets
            if (virtualScroll) {
                virtualScroll.destroy();
                virtualScroll = null;
            }

            // Render all rows normally
            tbody.innerHTML = rows.map((row, index) => renderer(row, index)).join('');
        }
    };

    return {
        render: renderFn,
        setData: (rows) => renderFn(rows, currentRenderer),
        set renderRow(fn) { currentRenderer = fn; },
        get renderRow() { return currentRenderer; },
        setRowHeight: (height) => {
            rowHeight = height;
            if (virtualScroll) {
                virtualScroll.rowHeight = height;
                virtualScroll.rowHeightMeasured = false;
                virtualScroll.totalHeight = virtualScroll.data.length * height;
                virtualScroll.updateVisibleRange();
                virtualScroll.render(true);
            }
        },
        scrollToIndex: (index) => {
            if (virtualScroll) {
                virtualScroll.scrollToIndex(index);
            } else {
                const rows = tbody.querySelectorAll('tr');
                if (rows[index]) {
                    rows[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        },
        destroy: () => {
            if (virtualScroll) {
                virtualScroll.destroy();
                virtualScroll = null;
            }
        }
    };
}
