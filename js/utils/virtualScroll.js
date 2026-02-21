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

        let ticking = false;
        tableContainer.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    this.handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    handleScroll() {
        const tableContainer = this.tbody.closest('.table-wrap');
        const scrollTop = tableContainer ? tableContainer.scrollTop : 0;
        this.scrollTop = scrollTop;

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
        // Use a fallback height (800px ≈ 20 rows) when the container hasn't been laid out yet
        const containerHeight = (containerEl?.offsetHeight) || 800;
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
        // Re-render after layout is complete in case containerHeight was 0 initially
        requestAnimationFrame(() => {
            this.updateVisibleRange();
            this.render();
        });
    }

    render() {
        if (!this.tbody) return;

        const paddingTop = this.visibleStart * this.rowHeight;
        const paddingBottom = Math.max(0, (this.data.length - this.visibleEnd) * this.rowHeight);

        let html = '';

        // Top spacer
        if (paddingTop > 0) {
            html += `<tr style="height: ${paddingTop}px; border: none; background: transparent;"><td colspan="100" style="padding: 0; border: none;"></td></tr>`;
        }

        // Render only visible rows
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const row = this.data[i];
            if (!row) continue;
            html += row.html || this.renderRow(row, i);
        }

        // Bottom spacer
        if (paddingBottom > 0) {
            html += `<tr style="height: ${paddingBottom}px; border: none; background: transparent;"><td colspan="100" style="padding: 0; border: none;"></td></tr>`;
        }

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
