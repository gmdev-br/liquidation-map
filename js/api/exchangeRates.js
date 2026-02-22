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

