// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Formatters
// ═══════════════════════════════════════════════════════════

import { getShowSymbols } from '../state.js';
import { CURRENCY_META } from '../config.js';

export const fmt = (n, dec = 0) => {
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(dec);
};

export const fmtUSD = (n) => {
    const showSymbols = getShowSymbols();
    const sign = n >= 0 ? '+' : '-';
    const abs = Math.abs(n);
    const sym = showSymbols ? '$' : '';
    if (abs >= 1e6) return sign + sym + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + sym + (abs / 1e3).toFixed(1) + 'K';
    return sign + sym + abs.toFixed(0);
};

export const fmtAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const fmtNum = (n) => new Intl.NumberFormat('en-US').format(n);

export function fmtCcy(value, overrideCcy = null, activeCurrency, showSymbols) {
    const ccy = overrideCcy || activeCurrency;
    const meta = CURRENCY_META[ccy] || CURRENCY_META.USD;
    const abs = Math.abs(value);
    const sign = value >= 0 ? '' : '-';
    const sym = showSymbols ? meta.symbol : '';

    if (ccy === 'BTC') {
        return sign + sym + abs.toFixed(abs >= 1 ? 4 : 8);
    }

    if (abs >= 1e9) return sign + sym + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + sym + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + sym + (abs / 1e3).toFixed(1) + 'K';
    return sign + sym + abs.toFixed(0);
}

export function fmtPriceCcy(value, overrideCcy = null, activeCurrency, showSymbols) {
    const ccy = overrideCcy || activeCurrency;
    const meta = CURRENCY_META[ccy] || CURRENCY_META.USD;
    const abs = Math.abs(value);
    const sign = value >= 0 ? '' : '-';
    const sym = showSymbols ? meta.symbol : '';

    if (ccy === 'BTC') {
        return sign + sym + abs.toFixed(8);
    }

    // For prices, we want more precision than total values
    if (abs >= 1) {
        return sign + sym + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    return sign + sym + abs.toFixed(6);
}
