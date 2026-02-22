// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Data Processing Web Worker
// ═══════════════════════════════════════════════════════════

// Currency conversion logic adapted for the worker
function convertToActiveCcy(valueUsd, coin, targetCurrency, fxRates) {
    if (!valueUsd) return 0;
    if (!targetCurrency || targetCurrency === 'USD') return valueUsd;

    // For non-USD, convert using fxRates matrix
    const rate = fxRates[targetCurrency] || 1;
    return valueUsd * rate;
}

function getCorrelatedEntry(row, targetCurrency, currentPrices, fxRates) {
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || row.markPrice || 0);

    let correlatedVal = row.entryPx;

    if (row.coin !== 'BTC' && btcPrice > 0 && coinPrice > 0) {
        correlatedVal = row.entryPx * (btcPrice / coinPrice);
    } else if (row.coin === 'BTC') {
        correlatedVal = row.entryPx;
    }

    if (!targetCurrency || targetCurrency === 'USD') {
        return correlatedVal;
    }

    if (targetCurrency === 'BTC') {
        if (btcPrice > 0) return row.entryPx / btcPrice;
        return 0;
    }

    const rate = fxRates[targetCurrency] || 1;
    return correlatedVal * rate;
}

function getCorrelatedPrice(row, rawPrice, targetCurrency, currentPrices, fxRates) {
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || row.markPrice || 0);

    let correlatedVal = rawPrice;

    if (row.coin !== 'BTC' && btcPrice > 0 && coinPrice > 0) {
        correlatedVal = rawPrice * (btcPrice / coinPrice);
    } else if (row.coin === 'BTC') {
        correlatedVal = rawPrice;
    }

    if (!targetCurrency || targetCurrency === 'USD') {
        return correlatedVal;
    }

    if (targetCurrency === 'BTC') {
        if (btcPrice > 0) return rawPrice / btcPrice;
        return 0;
    }

    const rate = fxRates[targetCurrency] || 1;
    return correlatedVal * rate;
}

self.onmessage = function (e) {
    const {
        allRows,
        whaleMeta,
        filterState,
        sortState,
        currencyState
    } = e.data;

    const {
        selectedCoins, addressFilter, sideFilter,
        minLev, maxLev, minSize, minFunding, levTypeFilter,
        minSzi, maxSzi, minValueCcy, maxValueCcy,
        minEntryCcy, maxEntryCcy, minUpnl, maxUpnl
    } = filterState;

    const { activeCurrency, activeEntryCurrency, currentPrices, fxRates } = currencyState;

    const addressFilterRegex = addressFilter ? new RegExp(addressFilter, 'i') : null;

    // 1. Filter rows
    let rows = allRows.filter(r => {
        if (selectedCoins.length > 0 && !selectedCoins.includes(r.coin)) return false;

        if (addressFilterRegex) {
            const addr = r.address;
            const meta = whaleMeta[addr];
            const disp = meta?.displayName || '';
            if (!addressFilterRegex.test(addr) && !addressFilterRegex.test(disp)) return false;
        }

        if (sideFilter && r.side !== sideFilter) return false;
        if (!isNaN(minLev) && r.leverageValue < minLev) return false;
        if (!isNaN(maxLev) && r.leverageValue > maxLev) return false;
        if (!isNaN(minSize) && r.positionValue < minSize) return false;
        if (!isNaN(minFunding) && Math.abs(r.funding) < minFunding) return false;
        if (levTypeFilter && r.leverageType !== levTypeFilter) return false;

        if (!isNaN(minSzi) && Math.abs(r.szi) < minSzi) return false;
        if (!isNaN(maxSzi) && Math.abs(r.szi) > maxSzi) return false;

        if (!isNaN(minValueCcy) || !isNaN(maxValueCcy)) {
            const valCcy = convertToActiveCcy(r.positionValue, null, activeCurrency, fxRates);
            if (!isNaN(minValueCcy) && valCcy < minValueCcy) return false;
            if (!isNaN(maxValueCcy) && valCcy > maxValueCcy) return false;
        }

        if (!isNaN(minEntryCcy) || !isNaN(maxEntryCcy)) {
            const entCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
            if (!isNaN(minEntryCcy) && entCcy < minEntryCcy) return false;
            if (!isNaN(maxEntryCcy) && entCcy > maxEntryCcy) return false;
        }

        if (!isNaN(minUpnl) && r.unrealizedPnl < minUpnl) return false;
        if (!isNaN(maxUpnl) && r.unrealizedPnl > maxUpnl) return false;

        return true;
    });

    // 2. Sort rows
    const { sortKey, sortDir } = sortState;

    rows.sort((a, b) => {
        let va, vb;

        if (sortKey === 'coin') {
            return sortDir * a.coin.localeCompare(b.coin);
        } else if (sortKey === 'funding') {
            va = a.funding; vb = b.funding;
        } else if (sortKey === 'valueCcy') {
            va = convertToActiveCcy(a.positionValue, null, activeCurrency, fxRates);
            vb = convertToActiveCcy(b.positionValue, null, activeCurrency, fxRates);
        } else if (sortKey === 'entryCcy') {
            va = getCorrelatedEntry(a, activeEntryCurrency, currentPrices, fxRates);
            vb = getCorrelatedEntry(b, activeEntryCurrency, currentPrices, fxRates);
        } else if (sortKey === 'liqPx') {
            va = a.liquidationPx > 0 ? getCorrelatedPrice(a, a.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;
            vb = b.liquidationPx > 0 ? getCorrelatedPrice(b, b.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;
        } else {
            va = a[sortKey] ?? 0;
            vb = b[sortKey] ?? 0;
        }

        return sortDir * (vb - va);
    });

    // Send back the processed rows
    self.postMessage({ rows });
};
