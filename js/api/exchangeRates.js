// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Exchange Rates API
// ═══════════════════════════════════════════════════════════

import { FX_URL } from '../config.js';
import { setFxRates, setFxReady, getCurrentPrices, setCurrentPrices } from '../state.js';

export async function fetchAllMids() {
    try {
        const resp = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'allMids' })
        });
        const data = await resp.json();
        if (data) {
            setCurrentPrices(data);
        }
    } catch (e) {
        console.warn('Failed to fetch all mids', e);
    }
}

export async function fetchExchangeRates() {
    try {
        const resp = await fetch(FX_URL);
        const data = await resp.json();
        if (data.rates) {
            setFxRates(data.rates);
            setFxReady(true);
        }
    } catch (e) {
        console.warn('FX fetch failed, defaulting to USD', e);
        setFxReady(true); // proceed with USD=1
    }
}

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
    const coinPrice = parseFloat(currentPrices[row.coin] || 0);
    
    let correlatedVal = rawPrice; // Default to raw price if data missing
    
    if (row.coin !== 'BTC' && btcPrice > 0 && coinPrice > 0) {
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
