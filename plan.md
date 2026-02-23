# Action Plan: Mobile Experience Improvements

## 1. Objectives
Enhance the mobile user experience for the cryptocurrency table and aggregation table by optimizing layout, visibility, and interaction patterns.

## 2. Diagnosis & Issues
1.  **Table Crowding:** Too many columns are visible by default on small screens, making the table hard to read.
2.  **Context Loss:** Scrolling horizontally causes loss of context (which coin is this?). The "Num" column was sticky, but "Coin" is more important for identifying rows.
3.  **Aggregation Table Navigation:** The aggregation table is wide, and the "Range From" column (key identifier) scrolls out of view.
4.  **Touch Targets:** Some elements might be too small or hard to reach (addressed by existing mobile CSS, but worth reviewing).

## 3. Implementation Plan

### Phase 1: Smart Defaults (Completed)
-   **Action:** Modify `js/storage/settings.js` to detect mobile width (<768px) on initial load.
-   **Logic:** If no saved settings exist, default to a curated list of essential columns:
    -   `col-coin` (Asset)
    -   `col-positionValue` (Size in USD)
    -   `col-unrealizedPnl` (Profit/Loss)
    -   `col-entryPx` (Entry Price)
    -   `col-liqPx` (Liquidation Price)
-   **Hidden by default:** `col-num`, `col-address`, `col-szi`, `col-leverage`, `col-valueCcy`, `col-funding`, `col-distToLiq`.

### Phase 2: Sticky Columns (Completed)
-   **Action:** Update `css/mobile.css` to change sticky column behavior.
-   **Main Table:**
    -   Remove sticky from `col-num`.
    -   Make `col-coin` sticky at `left: 0`.
    -   Ensure z-index and background color prevent transparency issues during scroll.
-   **Aggregation Table:**
    -   Make the first column ("Faixa De") sticky at `left: 0`.
    -   Ensure consistent styling with the main table.

### Phase 3: Visual & Interaction Polish (Pending Verification)
-   **Action:** Verify "Scroll to Current Price" button visibility on mobile.
-   **Action:** Verify row height and touch targets.

### Phase 4: Advanced Customization (Completed)
-   **Objective:** Enable user-controlled column widths and ordering for both main and aggregation tables.
-   **Action:** 
    -   Implement touch-compatible column resizing for both tables.
    -   Implement drag-and-drop column reordering for both tables.
    -   Persist column order and widths to `localStorage`.
    -   Separate state management for aggregation table column order to prevent conflicts.

## 4. Success Criteria
1.  **Clean Initial View:** Opening the app on mobile shows a concise, readable table without horizontal scrolling for key data.
2.  **Scroll Context:** Scrolling right keeps the "Coin" column visible, allowing users to relate data to the asset.
3.  **Agg Table Usability:** Scrolling right in the aggregation table keeps the "Range" visible.
4.  **Customization:** Users can resize and reorder columns on both desktop and mobile, with changes saved across sessions.
