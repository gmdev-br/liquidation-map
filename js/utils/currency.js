// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Currency Utilities
// ═══════════════════════════════════════════════════════════

import { getCurrentPrices } from '../state.js';

// Minimum valid coin price to prevent extreme correlation ratios
// Prices below this threshold (e.g., due to data errors or extremely low-value tokens)
// can cause division that produces billions of bands in aggregation calculations
const MIN_VALID_COIN_PRICE = 0.0001; // $0.0001 minimum to prevent extreme ratios

export function convertToActiveCcy(valUSD, overrideCcy = null, activeCurrency, fxRates) {
    const ccy = overrideCcy || activeCurrency;
    if (ccy === 'USD') return valUSD;
    if (ccy === 'BTC') {
        const currentPrices = getCurrentPrices();
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        return btcPrice > 0 ? valUSD / btcPrice : 0;
    }
    const rate = fxRates[ccy] || 1;
    return valUSD * rate;
}

export function getCorrelatedPrice(row, rawPrice, activeEntryCurrency, currentPrices, fxRates) {
    const targetCcy = activeEntryCurrency || 'USD';

    // 1. Calculate Base Correlated Price (The "Holy Grail" Logic)
    // Formula: Price * (BTC_Price / Coin_Price)
    // This projects the price to the equivalent BTC price level.
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    // Use row.markPrice as fallback if the coin is not found in global currentPrices
    const coinPrice = parseFloat(currentPrices[row.coin] || row.markPrice || 0);

    let correlatedVal = rawPrice; // Default to raw price if data missing

    // Validate coinPrice is above minimum threshold to prevent extreme correlation ratios
    // that can cause billions of bands to be calculated (e.g., 14479482838 bands error)
    const isValidCoinPrice = coinPrice >= MIN_VALID_COIN_PRICE;

    if (row.coin !== 'BTC' && btcPrice > 0 && isValidCoinPrice) {
        correlatedVal = rawPrice * (btcPrice / coinPrice);
    } else if (row.coin === 'BTC') {
        correlatedVal = rawPrice;
    }

    // 2. If target is USD, return the correlated value (which is in USD)
    if (targetCcy === 'USD') {
        return correlatedVal;
    }

    // 3. If target is BTC, user likely wants "Price in BTC terms"
    // Since correlatedVal is "The BTC Price equivalent", converting it to BTC = 1 (useless).
    // So for BTC selection, we return the raw price converted to BTC.
    if (targetCcy === 'BTC') {
        if (btcPrice > 0) return rawPrice / btcPrice;
        return 0;
    }

    // 4. If target is Fiat (BRL, EUR, etc), convert the Correlated USD Value to that Fiat
    const rate = fxRates[targetCcy] || 1;
    return correlatedVal * rate;
}

export function getCorrelatedEntry(row, activeEntryCurrency, currentPrices, fxRates) {
    return getCorrelatedPrice(row, row.entryPx, activeEntryCurrency, currentPrices, fxRates);
}
