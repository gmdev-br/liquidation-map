// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Configuration
// ═══════════════════════════════════════════════════════════

export const INFO_URL = 'https://api.hyperliquid.xyz/info';
export const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
export const FX_URL = 'https://open.er-api.com/v6/latest/USD';

export const COLUMN_DEFS = [
    { key: 'col-num', label: '#' },
    { key: 'col-address', label: 'Address' },
    { key: 'col-coin', label: 'Coin' },
    { key: 'col-szi', label: 'Size' },
    { key: 'col-leverage', label: 'Leverage' },
    { key: 'col-positionValue', label: 'Value' },
    { key: 'col-valueCcy', label: 'Value (CCY)' },
    { key: 'col-entryPx', label: 'Avg Entry' },
    { key: 'col-entryCcy', label: 'Avg Entry (Corr)' },
    { key: 'col-unrealizedPnl', label: 'UPNL' },
    { key: 'col-funding', label: 'Funding' },
    { key: 'col-liqPx', label: 'Liq. Price' },
    { key: 'col-distToLiq', label: 'Dist. to Liq.' },
    { key: 'col-accountValue', label: 'Acct. Value' }
];

export const CURRENCY_META = {
    USD: { symbol: '$', locale: 'en-US' },
    BRL: { symbol: 'R$', locale: 'pt-BR' },
    EUR: { symbol: '€', locale: 'de-DE' },
    GBP: { symbol: '£', locale: 'en-GB' },
    JPY: { symbol: '¥', locale: 'ja-JP' },
    ARS: { symbol: '$', locale: 'es-AR' },
    CAD: { symbol: 'CA$', locale: 'en-CA' },
    AUD: { symbol: 'A$', locale: 'en-AU' },
    BTC: { symbol: '₿', locale: 'en-US' },
};

export const RETRY_DELAY_MS = 2000;  // wait 2s on 429 before retry

// Rate limit: 1200 weight/min, clearinghouseState = weight 2 → max 600 req/min = 10 req/s
// We use 8 concurrent requests to stay safely under the limit.
export const DEFAULT_MAX_CONCURRENCY = 8;
