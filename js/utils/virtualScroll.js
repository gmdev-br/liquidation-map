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
        this.rowHeightMeasured = false; // Will calibrate on first real render
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
        this.rowHeightMeasured = false; // Reset so we re-measure on new data
        this.updateVisibleRange();
        this.render(true); // Force update content
        // First pass: re-render after next animation frame
        requestAnimationFrame(() => {
            this._calibrateRowHeight();
            this.updateVisibleRange();
            this.render(true);
        });
        // Second pass: CSS fonts and custom styles can take slightly longer
        // This guarantees row height is correct even on slower devices
        setTimeout(() => {
            if (!this.rowHeightMeasured) {
                this._calibrateRowHeight();
                this.updateVisibleRange();
                this.render(true);
            }
        }, 250);
    }

    _calibrateRowHeight() {
        if (this.rowHeightMeasured) return;
        // Find the first real data row (not spacers)
        const realRow = Array.from(this.tbody.children).find(
            el => !el.classList.contains('vs-top-spacer') && !el.classList.contains('vs-bottom-spacer')
        );
        if (realRow && realRow.offsetHeight > 0) {
            const measuredHeight = realRow.offsetHeight;
            if (Math.abs(measuredHeight - this.rowHeight) > 2) {
                // Real height differs from estimate - recalculate total
                this.rowHeight = measuredHeight;
                this.totalHeight = this.data.length * this.rowHeight;
            }
            this.rowHeightMeasured = true;
        }
    }

    render(forceUpdate = false) {
        if (!this.tbody) return;

        const paddingTop = this.visibleStart * this.rowHeight;
        const paddingBottom = Math.max(0, (this.data.length - this.visibleEnd) * this.rowHeight);

        // Ensure spacers exist
        let topSpacer = this.tbody.querySelector('.vs-top-spacer');
        if (!topSpacer) {
            topSpacer = document.createElement('tr');
            topSpacer.className = 'vs-top-spacer';
            topSpacer.style.border = 'none';
            topSpacer.style.background = 'transparent';
            topSpacer.innerHTML = '<td colspan="100" style="padding: 0; border: none;"></td>';
            this.tbody.insertBefore(topSpacer, this.tbody.firstChild);
        }

        let bottomSpacer = this.tbody.querySelector('.vs-bottom-spacer');
        if (!bottomSpacer) {
            bottomSpacer = document.createElement('tr');
            bottomSpacer.className = 'vs-bottom-spacer';
            bottomSpacer.style.border = 'none';
            bottomSpacer.style.background = 'transparent';
            bottomSpacer.innerHTML = '<td colspan="100" style="padding: 0; border: none;"></td>';
            this.tbody.appendChild(bottomSpacer);
        }

        topSpacer.style.height = `${paddingTop}px`;
        topSpacer.style.display = paddingTop > 0 ? '' : 'none';

        bottomSpacer.style.height = `${paddingBottom}px`;
        bottomSpacer.style.display = paddingBottom > 0 ? '' : 'none';

        // Collect existing data rows
        const existingRows = Array.from(this.tbody.children).filter(
            el => !el.classList.contains('vs-top-spacer') && !el.classList.contains('vs-bottom-spacer')
        );

        const neededRowsCount = this.visibleEnd - this.visibleStart;

        // Add or remove rows to match the visible count
        while (existingRows.length < neededRowsCount) {
            const tr = document.createElement('template');
            this.tbody.insertBefore(tr, bottomSpacer);
            existingRows.push(tr);
        }
        while (existingRows.length > neededRowsCount) {
            const tr = existingRows.pop();
            tr.remove();
        }

        // Update the content of each row
        let rowIndex = this.visibleStart;
        for (let i = 0; i < neededRowsCount; i++) {
            const rowData = this.data[rowIndex];
            const tr = existingRows[i];

            if (rowData) {
                // We extract just the inner content of the tr string (everything between <tr...> and </tr>)
                // Since rowData.html is a full <tr>...</tr> string, we strip the outer tags safely
                const fullHtml = rowData.html || this.renderRow(rowData, rowIndex);
                const innerMatch = fullHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
                const innerContent = innerMatch ? innerMatch[1] : fullHtml;

                // Extract class names to preserve row-known-address and others
                const classMatch = fullHtml.match(/class="([^"]*)"/i);
                const classNames = classMatch ? classMatch[1] : '';

                // Extract style attribute to preserve highlight styles
                const styleMatch = fullHtml.match(/style=(["'])(.*?)\1/i);
                const styleAttr = styleMatch ? styleMatch[2] : '';

                if (tr.tagName.toLowerCase() === 'template') {
                    // Convert template to actual TR
                    const newTr = document.createElement('tr');
                    newTr.className = classNames;
                    newTr.style.cssText = styleAttr;
                    newTr.innerHTML = innerContent;
                    tr.parentNode.replaceChild(newTr, tr);
                    existingRows[i] = newTr;
                } else {
                    // Update only if content changed (the user scrolled this specific row out of view and recycled it)
                    // We check a custom dataset attribute to avoid reading innerHTML which is slow
                    if (forceUpdate || tr.dataset.sourceIndex !== String(rowIndex)) {
                        tr.className = classNames;
                        tr.style.cssText = styleAttr;
                        tr.innerHTML = innerContent;
                        tr.dataset.sourceIndex = String(rowIndex);
                    }
                }
            }
            rowIndex++;
        }
    }

    renderRow(row, index) {
        // Default row renderer - override in subclass or pass as option
        return `<div class="virtual-row" data-index="${index}">Row ${index}</div>`;
    }

    scrollToIndex(index) {
        const tableContainer = this.tbody.closest('.table-wrap');
        if (!tableContainer) return;
        
        const containerHeight = tableContainer.offsetHeight;
        const rowTop = index * this.rowHeight;
        const centeredTop = rowTop - (containerHeight / 2) + (this.rowHeight / 2);
        
        // Clamp values to valid scroll range
        const maxScroll = this.totalHeight - containerHeight;
        const clampedTop = Math.max(0, Math.min(centeredTop, maxScroll));
        
        tableContainer.scrollTop = clampedTop;
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
export function enableVirtualScroll(tbodyId = 'tableBody', options = {}) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const threshold = options.threshold || 100;
    const rowHeight = options.rowHeight || 52;
    const bufferSize = options.bufferSize || 5;

    let virtualScroll = null;
    let currentRenderer = null;

    const renderFn = (rows, rowRenderer) => {
        // Update renderer if provided
        if (rowRenderer) currentRenderer = rowRenderer;
        
        // Use stored renderer if not provided
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

            // Add html property to each row
            const data = rows.map((row, index) => ({
                ...row,
                html: renderer(row, index)
            }));

            // Reset tbody to clean up any leftover regular rows
            if (virtualScroll.data.length === 0) {
                tbody.innerHTML = '';
            }

            virtualScroll.setData(data);
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
        scrollToIndex: (index) => {
            if (virtualScroll) {
                virtualScroll.scrollToIndex(index);
            } else {
                // Fallback for non-virtualized table
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
