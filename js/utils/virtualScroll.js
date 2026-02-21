// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Virtual Scrolling
// ═══════════════════════════════════════════════════════════

/**
 * Virtual scrolling implementation for large tables
 * Only renders visible rows + buffer to improve performance
 */
export class VirtualScroll {
    constructor(options = {}) {
        this.rowHeight = options.rowHeight || 40;
        this.bufferSize = options.bufferSize || 5;
        this.tbody = options.tbody;
        this.data = [];
        this.scrollTop = 0;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.totalHeight = 0;
        this.renderedRows = new Map(); // Track rendered rows by index

        if (!this.tbody) {
            console.error('VirtualScroll: tbody element is required');
            return;
        }

        // Setup scroll listener
        this.setupScrollListener();
    }

    setupScrollListener() {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (!tableContainer) return;

        tableContainer.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    }

    handleScroll(e) {
        const scrollTop = e.target.scrollTop;
        this.scrollTop = scrollTop;
        this.updateVisibleRange();
        this.render();
    }

    updateVisibleRange() {
        const containerHeight = this.tbody.closest('.table-wrap')?.offsetHeight || 0;
        const startRow = Math.max(0, Math.floor(this.scrollTop / this.rowHeight) - this.bufferSize);
        const endRow = Math.min(
            this.data.length,
            Math.ceil((this.scrollTop + containerHeight) / this.rowHeight) + this.bufferSize
        );

        this.visibleStart = startRow;
        this.visibleEnd = endRow;
    }

    setData(data) {
        this.data = data;
        this.totalHeight = data.length * this.rowHeight;
        this.updateVisibleRange();
        this.render();
    }

    render() {
        if (!this.tbody) return;

        // Create spacer divs for scroll height
        let html = `<div style="height: ${this.totalHeight}px; position: relative;">`;

        // Render only visible rows
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const row = this.data[i];
            if (!row) continue;

            const top = i * this.rowHeight;
            html += `<div style="position: absolute; top: ${top}px; width: 100%; height: ${this.rowHeight}px;">`;
            html += row.html || this.renderRow(row, i);
            html += `</div>`;
        }

        html += `</div>`;
        this.tbody.innerHTML = html;
    }

    renderRow(row, index) {
        // Default row renderer - override in subclass or pass as option
        return `<div class="virtual-row" data-index="${index}">Row ${index}</div>`;
    }

    scrollToIndex(index) {
        const top = index * this.rowHeight;
        const tableContainer = this.tbody.closest('.table-wrap');
        if (tableContainer) {
            tableContainer.scrollTop = top;
        }
    }

    destroy() {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (tableContainer) {
            tableContainer.removeEventListener('scroll', this.handleScroll.bind(this));
        }
        this.data = [];
        this.renderedRows.clear();
    }
}

/**
 * Simple virtual scroll for table rows
 * Only enables when row count exceeds threshold
 */
export function enableVirtualScroll(threshold = 100) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    let virtualScroll = null;

    return {
        render: (rows, rowRenderer) => {
            if (rows.length > threshold) {
                if (!virtualScroll) {
                    virtualScroll = new VirtualScroll({
                        tbody,
                        rowHeight: 40,
                        bufferSize: 5
                    });
                }

                // Add html property to each row
                const data = rows.map((row, index) => ({
                    ...row,
                    html: rowRenderer(row, index)
                }));

                virtualScroll.setData(data);
            } else {
                // Disable virtual scroll for small datasets
                if (virtualScroll) {
                    virtualScroll.destroy();
                    virtualScroll = null;
                }

                // Render all rows normally
                tbody.innerHTML = rows.map((row, index) => rowRenderer(row, index)).join('');
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
