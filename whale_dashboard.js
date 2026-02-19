const INFO_URL = 'https://api.hyperliquid.xyz/info';
const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

const COLUMN_DEFS = [
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

// State
let whaleList = [];       // from leaderboard
let allRows = [];         // flat: one row per position
let displayedRows = [];   // after filters
let visibleColumns = COLUMN_DEFS.map(c => c.key); // Default all visible
let columnOrder = COLUMN_DEFS.map(c => c.key); // Default order
let _columnCloseTimer = null;
let sortKey = 'accountValue';
let sortDir = -1;
let activeWindow = 'allTime';
let loadedCount = 0;
let scanning = false;
let isPaused = false;
let selectedCoins = [];   // Array for multi-select
let priceMode = 'realtime'; // 'realtime' or 'dailyclose'
let priceTicker = null;
let dailyCloseCache = {}; // { COIN: price }
let columnWidths = {};    // { th-id: width_px }
let rankingLimit = 10;
let rankingTicker = null;
let chartHeight = 400; // default height in px
let liqChartHeight = 400; // default height for liquidation chart
let colorMaxLev = 50;
let chartHighLevSplit = 50; // Threshold for Low/High leverage split
let chartMode = 'scatter'; // 'scatter' or 'column'
let bubbleScale = 1.0;
let aggregationFactor = 50;
let savedScatterState = null;
let savedLiqState = null;

// Currency conversion
const CURRENCY_META = {
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
let fxRates = { USD: 1 };   // USD-based rates, fetched once
let fxReady = false;
let activeCurrency = 'USD';
let activeEntryCurrency = 'USD';
let showSymbols = true;

function toggleShowSymbols() {
    showSymbols = !showSymbols;
    const btn = document.getElementById('btnShowSym');
    if (btn) {
        btn.textContent = showSymbols ? 'On' : 'Off';
        btn.classList.toggle('active', showSymbols);
    }
    saveSettings();
    renderTable();
}

async function fetchExchangeRates() {
    try {
        const resp = await fetch(FX_URL);
        const data = await resp.json();
        if (data.rates) {
            fxRates = data.rates;
            fxRates.USD = 1;
            fxReady = true;
        }
    } catch (e) {
        console.warn('FX fetch failed, defaulting to USD', e);
        fxReady = true; // proceed with USD=1
    }
}

function convertToActiveCcy(valUSD, overrideCcy = null) {
    const ccy = overrideCcy || activeCurrency;
    if (ccy === 'USD') return valUSD;
    if (ccy === 'BTC') {
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        return btcPrice > 0 ? valUSD / btcPrice : 0;
    }
    const rate = fxRates[ccy] || 1;
    return valUSD * rate;
}

function fmtCcy(value, overrideCcy = null) {
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

function getCorrelatedPrice(row, rawPrice) {
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

function getCorrelatedEntry(row) {
    return getCorrelatedPrice(row, row.entryPx);
}

function fmtPriceCcy(value, overrideCcy = null) {
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

function onCurrencyChange() {
    activeCurrency = document.getElementById('currencySelect').value;
    activeEntryCurrency = document.getElementById('entryCurrencySelect').value;

    // Update column headers
    const thVal = document.getElementById('th-valueCcy');
    if (thVal) thVal.textContent = `Value (${activeCurrency}) ↕`;
    const thEntry = document.getElementById('th-entryCcy');
    if (thEntry) thEntry.textContent = `Entry Corr (${activeEntryCurrency}) ↕`;
    const thLiq = document.getElementById('th-liqPx');
    if (thLiq) thLiq.textContent = `Liq. Price Corr (${activeEntryCurrency}) ↕`;

    renderTable();
}
// Rate limit: 1200 weight/min, clearinghouseState = weight 2 → max 600 req/min = 10 req/s
// We use 8 concurrent requests to stay safely under the limit.
let maxConcurrency = 8;
const RETRY_DELAY_MS = 2000;  // wait 2s on 429 before retry
let currentPrices = {};   // coin -> mark price

function updateSpeed(val) {
    const v = parseInt(val, 10);
    if (v >= 1 && v <= 20) {
        maxConcurrency = v;
        document.getElementById('speedVal').textContent = v;
    }
}

// Formatting
const fmt = (n, dec = 0) => {
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(dec);
};
const fmtUSD = (n) => {
    const sign = n >= 0 ? '+' : '-';
    const abs = Math.abs(n);
    const sym = showSymbols ? '$' : '';
    if (abs >= 1e6) return sign + sym + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + sym + (abs / 1e3).toFixed(1) + 'K';
    return sign + sym + abs.toFixed(0);
};
const fmtAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtNum = (n) => new Intl.NumberFormat('en-US').format(n);

function setStatus(msg, type = 'idle') {
    document.getElementById('statusText').textContent = msg;
    document.getElementById('dot').className = 'dot ' + type;
}
function setProgress(pct) {
    document.getElementById('progressFill').style.width = pct + '%';
}

function setWindow(el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    activeWindow = el.dataset.window;
    saveSettings();
    renderTable();
}

// Persistence
const STORAGE_KEY = 'whaleWatcherSettings';
const DATA_KEY = 'whaleWatcherData';

function saveTableData() {
    try {
        localStorage.setItem(DATA_KEY, JSON.stringify(allRows));
    } catch (e) {
        console.warn('Failed to save table data (quota exceeded?)', e);
    }
}

function loadTableData() {
    try {
        const saved = localStorage.getItem(DATA_KEY);
        if (saved) {
            allRows = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Failed to parse saved table data', e);
    }
}

function saveSettings() {
    // Helper to get chart state
    function getChartState(chart) {
        if (!chart) return null;
        if (chart.isZoomed) {
            return {
                x: { min: chart.scales.x.min, max: chart.scales.x.max },
                y: { min: chart.scales.y.min, max: chart.scales.y.max }
            };
        }
        return null; // Return null if not zoomed (user wants default view)
    }

    const settings = {
        scatterChartState: getChartState(scatterChart) || savedScatterState,
        liqChartState: getChartState(liqChartInstance) || savedLiqState,
        minValue: document.getElementById('minValue').value,
        coinFilter: document.getElementById('coinFilter').value,
        sideFilter: document.getElementById('sideFilter').value,
        minLev: document.getElementById('minLev').value,
        maxLev: document.getElementById('maxLev').value,
        minSize: document.getElementById('minSize').value,
        minSzi: document.getElementById('minSzi').value,
        maxSzi: document.getElementById('maxSzi').value,
        minValueCcy: document.getElementById('minValueCcy').value,
        maxValueCcy: document.getElementById('maxValueCcy').value,
        minEntryCcy: document.getElementById('minEntryCcy').value,
        maxEntryCcy: document.getElementById('maxEntryCcy').value,
        minUpnl: document.getElementById('minUpnl').value,
        maxUpnl: document.getElementById('maxUpnl').value,
        minFunding: document.getElementById('minFunding').value,
        levTypeFilter: document.getElementById('levTypeFilter').value,
        currencySelect: document.getElementById('currencySelect').value,
        entryCurrencySelect: document.getElementById('entryCurrencySelect').value,
        addressFilter: document.getElementById('addressFilter').value,
        selectedCoins: selectedCoins,
        priceMode: priceMode,
        activeWindow: activeWindow,
        columnWidths: columnWidths,
        rankingLimit: rankingLimit,
        colorMaxLev: colorMaxLev,
        chartHighLevSplit: chartHighLevSplit,
        sortKey: sortKey,
        sortDir: sortDir,
        showSymbols: showSymbols,
        chartHeight: chartHeight,
        chartMode: chartMode,
        bubbleScale: bubbleScale,
        aggregationFactor: aggregationFactor,
        visibleColumns: visibleColumns,
        columnOrder: columnOrder
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
        const s = JSON.parse(saved);
        if (s.columnOrder) {
            columnOrder = s.columnOrder;
            // Merge new columns from COLUMN_DEFS that are missing in saved order
            const currentKeys = COLUMN_DEFS.map(c => c.key);
            const savedKeys = new Set(columnOrder);
            currentKeys.forEach(key => {
                if (!savedKeys.has(key)) {
                    // Insert before col-distToLiq if possible, else append
                    if (key === 'col-liqPx') {
                        const idx = columnOrder.indexOf('col-distToLiq');
                        if (idx > -1) columnOrder.splice(idx, 0, key);
                        else columnOrder.push(key);
                    } else {
                        columnOrder.push(key);
                    }
                }
            });
            applyColumnOrder();
        }
        if (s.visibleColumns) {
            visibleColumns = s.visibleColumns;
            // Merge new columns
            const currentKeys = COLUMN_DEFS.map(c => c.key);
            const savedKeys = new Set(visibleColumns);
            currentKeys.forEach(key => {
                if (!savedKeys.has(key)) {
                    visibleColumns.push(key);
                }
            });
            applyColumnVisibility();
            updateColumnSelectDisplay();
        }
        if (s.showSymbols !== undefined) {
            showSymbols = s.showSymbols;
            const btn = document.getElementById('btnShowSym');
            if (btn) {
                btn.textContent = showSymbols ? 'On' : 'Off';
                btn.classList.toggle('active', showSymbols);
            }
        }
        if (s.chartMode) {
            chartMode = s.chartMode;
            document.querySelectorAll('.tab[data-chart]').forEach(t => {
                t.classList.toggle('active', t.dataset.chart === chartMode);
            });
            const bubbleCtrl = document.getElementById('bubbleSizeCtrl');
            if (bubbleCtrl) {
                bubbleCtrl.style.display = (chartMode === 'scatter') ? 'block' : 'none';
            }
            const aggCtrl = document.getElementById('aggregationCtrl');
            if (aggCtrl) {
                aggCtrl.style.display = (chartMode === 'column') ? 'block' : 'none';
            }
        }
        if (s.bubbleScale) {
            bubbleScale = s.bubbleScale;
            document.getElementById('bubbleSizeVal').textContent = bubbleScale.toFixed(1);
            document.getElementById('bubbleSizeRange').value = bubbleScale;
        }
        if (s.aggregationFactor) {
            aggregationFactor = s.aggregationFactor;
            document.getElementById('aggregationVal').textContent = aggregationFactor;
            document.getElementById('aggregationRange').value = aggregationFactor;
        }
        if (s.minValue) document.getElementById('minValue').value = s.minValue;
        if (s.coinFilter) {
            document.getElementById('coinFilter').value = s.coinFilter;
            document.getElementById('coinSearch').value = s.coinFilter;
        }
        if (s.sideFilter) cbSetValue('sideFilter', s.sideFilter);
        if (s.minLev) document.getElementById('minLev').value = s.minLev;
        if (s.maxLev) document.getElementById('maxLev').value = s.maxLev;
        if (s.minSize) document.getElementById('minSize').value = s.minSize;
        if (s.minSzi) document.getElementById('minSzi').value = s.minSzi;
        if (s.maxSzi) document.getElementById('maxSzi').value = s.maxSzi;
        if (s.minValueCcy) document.getElementById('minValueCcy').value = s.minValueCcy;
        if (s.maxValueCcy) document.getElementById('maxValueCcy').value = s.maxValueCcy;
        if (s.minEntryCcy) document.getElementById('minEntryCcy').value = s.minEntryCcy;
        if (s.maxEntryCcy) document.getElementById('maxEntryCcy').value = s.maxEntryCcy;
        if (s.minUpnl) document.getElementById('minUpnl').value = s.minUpnl;
        if (s.maxUpnl) document.getElementById('maxUpnl').value = s.maxUpnl;
        if (s.minFunding) document.getElementById('minFunding').value = s.minFunding;
        if (s.levTypeFilter) cbSetValue('levTypeFilter', s.levTypeFilter);
        if (s.currencySelect) cbSetValue('currencySelect', s.currencySelect);
        if (s.entryCurrencySelect) cbSetValue('entryCurrencySelect', s.entryCurrencySelect);
        onCurrencyChange();
        if (s.addressFilter) document.getElementById('addressFilter').value = s.addressFilter;
        if (s.selectedCoins) {
            selectedCoins = s.selectedCoins;
            updateCoinSearchLabel();
            renderQuotesPanel();
        }
        if (s.priceMode) {
            priceMode = s.priceMode;
            updatePriceModeUI();
        }
        if (s.columnWidths) {
            columnWidths = s.columnWidths;
            applyColumnWidths();
        }
        if (s.rankingLimit) {
            rankingLimit = s.rankingLimit;
            document.getElementById('rankingLimit').value = rankingLimit;
        }
        if (s.colorMaxLev) {
            colorMaxLev = s.colorMaxLev;
            document.getElementById('colorMaxLev').value = colorMaxLev;
        }
        if (s.chartHighLevSplit !== undefined) {
            chartHighLevSplit = s.chartHighLevSplit;
            const el = document.getElementById('chartHighLevSplit');
            if(el) el.value = chartHighLevSplit;
        }
        if (s.activeWindow) {
            activeWindow = s.activeWindow;
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.toggle('active', t.dataset.window === activeWindow);
            });
        }
        if (s.sortKey) sortKey = s.sortKey;
        if (s.sortDir) sortDir = s.sortDir;
        if (s.chartHeight) {
            chartHeight = s.chartHeight;
            const section = document.getElementById('chart-section');
            if (section) {
                section.style.height = chartHeight + 'px';
            }
        }
        if (s.liqChartHeight) {
            liqChartHeight = s.liqChartHeight;
            const section = document.getElementById('liq-chart-section');
            if (section) {
                section.style.height = liqChartHeight + 'px';
            }
        }
        if (s.scatterChartState) savedScatterState = s.scatterChartState;
        if (s.liqChartState) savedLiqState = s.liqChartState;
    } catch (e) { console.warn('Failed to load settings', e); }
}

function sortBy(key) {
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = -1; }
    document.querySelectorAll('th[id^="th-"]').forEach(th => {
        th.classList.remove('sorted');
        const label = th.querySelector('.th-label');
        if (label) {
            label.textContent = label.textContent.replace(' ▲', '').replace(' ▼', '').replace(' ↕', '') + ' ↕';
        }
    });
    const th = document.getElementById('th-' + key);
    if (th) {
        th.classList.add('sorted');
        const label = th.querySelector('.th-label');
        if (label) {
            label.textContent = label.textContent.replace(' ↕', '') + (sortDir === -1 ? ' ▼' : ' ▲');
        }
    }
    renderTable();
}

function getPnlForWindow(leaderRow, window) {
    if (!leaderRow?.windowPerformances) return 0;
    const wp = leaderRow.windowPerformances.find(w => w[0] === window);
    return wp ? parseFloat(wp[1].pnl || 0) : 0;
}

async function fetchAllMids() {
    try {
        const resp = await fetch(INFO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'allMids' })
        });
        currentPrices = await resp.json(); // {BTC: "95000", ETH: "2000", ...}
    } catch (e) { console.warn('Could not fetch prices', e); }
}

async function startScan() {
    const minVal = parseFloat(document.getElementById('minValue').value) || 2500000;
    document.getElementById('scanBtn').disabled = true;
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').textContent = '⏸ Pause';
    isPaused = false;
    document.getElementById('tableBody').innerHTML = `<tr><td colspan="13" class="empty-cell"><span class="spinner"></span> Fetching leaderboard…</td></tr>`;
    allRows = [];
    loadedCount = 0;

    setStatus('Fetching leaderboard…', 'scanning');
    setProgress(5);

    try {
        // Refresh prices before scanning to ensure accuracy
        await fetchAllMids();

        const lbResp = await fetch(LEADERBOARD_URL);
        if (!lbResp.ok) throw new Error(`Leaderboard HTTP ${lbResp.status}`);
        const lbData = await lbResp.json();
        const rows = lbData.leaderboardRows || [];

        // Filter whales by account value
        whaleList = rows
            .filter(r => parseFloat(r.accountValue) >= minVal)
            .sort((a, b) => parseFloat(b.accountValue) - parseFloat(a.accountValue));

        setProgress(15);
        const fxStatus = fxReady ? `FX: 1 USD = ${(fxRates[activeCurrency] ?? 1).toFixed(2)} ${activeCurrency}` : '';
        setStatus(`Found ${whaleList.length} whales. Loading positions… ${fxStatus}`, 'scanning');

        // Start the concurrency-limited streaming loader
        scanning = true;
        streamPositions(minVal);

    } catch (e) {
        console.error(e);
        document.getElementById('tableBody').innerHTML = `<tr><td colspan="13" class="empty-cell" style="color:var(--red)">Error: ${e.message}</td></tr>`;
        setStatus('Error', 'error');
        document.getElementById('scanBtn').disabled = false;
    }
}


// ── Concurrency-limited streaming loader ──────────────────────────────
// Fires MAX_CONCURRENCY requests at a time. As each resolves, the next
// whale is immediately dispatched — keeping the pipeline full without
// ever exceeding the rate limit. Retries on 429 with exponential backoff.

async function fetchWithRetry(whale, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const resp = await fetch(INFO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'clearinghouseState', user: whale.ethAddress })
            });
            if (resp.status === 429) {
                const wait = RETRY_DELAY_MS * Math.pow(2, attempt);
                console.warn(`Rate limited, retrying in ${wait}ms…`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            if (!resp.ok) return null;
            return await resp.json();
        } catch (e) {
            if (attempt === retries - 1) return null;
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return null;
}

function processState(whale, state) {
    if (!state) return;
    const positions = (state.assetPositions || []).filter(p => parseFloat(p.position.szi) !== 0);
    positions.forEach(p => {
        const pos = p.position;
        const size = parseFloat(pos.szi);
        const markPrice = parseFloat(currentPrices[pos.coin] || pos.entryPx);
        const liqPx = parseFloat(pos.liquidationPx);
        const entryPx = parseFloat(pos.entryPx);
        let distPct = null;
        if (liqPx > 0 && markPrice > 0) {
            distPct = Math.abs((markPrice - liqPx) / markPrice) * 100;
        }
        allRows.push({
            address: whale.ethAddress,
            displayName: whale.displayName,
            accountValue: parseFloat(whale.accountValue),
            leaderRow: whale,
            coin: pos.coin,
            szi: size,
            side: size > 0 ? 'long' : 'short',
            leverageType: pos.leverage?.type || 'cross',
            leverageValue: parseInt(pos.leverage?.value || 1, 10),
            positionValue: parseFloat(pos.positionValue),
            entryPx: entryPx,
            markPrice: markPrice,
            unrealizedPnl: parseFloat(pos.unrealizedPnl),
            funding: parseFloat(pos.cumFunding?.sinceOpen || 0),
            liquidationPx: liqPx,
            distPct: distPct,
            marginUsed: parseFloat(pos.marginUsed),
        });
    });
}

// Throttled UI refresh — at most once every 400ms to avoid reflow spam
let renderPending = false;
let lastSaveTime = 0;

function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    setTimeout(() => {
        renderPending = false;
        updateStats();
        updateCoinFilter();
        renderTable();

        // Periodic save to handle mid-scan refreshes
        const now = Date.now();
        if (now - lastSaveTime > 2000) {
            saveTableData();
            lastSaveTime = now;
        }
    }, 400);
}

async function streamPositions(minVal) {
    document.getElementById('autoLoading').style.display = 'block';
    document.getElementById('stopBtn').style.display = 'inline-block';
    const queue = [...whaleList];
    let active = 0;
    let done = 0;
    const total = queue.length;

    await new Promise(resolve => {
        async function dispatch() {
            // Stop if user requested
            if (!scanning) {
                if (active === 0) resolve();
                return;
            }
            // Fill up to maxConcurrency slots
            while (scanning && active < maxConcurrency && queue.length > 0) {
                const whale = queue.shift();
                active++;

                // If paused, wait before fetching
                while (scanning && isPaused) {
                    await new Promise(r => setTimeout(r, 500));
                }

                fetchWithRetry(whale).then(state => {
                    processState(whale, state);
                    active--;
                    done++;
                    loadedCount = done;
                    const pct = 15 + (done / total) * 80;
                    setProgress(Math.min(pct, 95));
                    setStatus(`Loading ${done}/${total} whales…`, 'scanning');
                    scheduleRender();
                    if (!scanning) {
                        if (active === 0) resolve();
                    } else if (queue.length > 0) {
                        dispatch(); // refill the slot immediately
                    } else if (active === 0) {
                        resolve(); // all done
                    }
                });
            }
        }
        dispatch();
    });

    document.getElementById('autoLoading').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    // Final render to make sure everything is shown
    updateStats();
    updateCoinFilter();
    renderTable();
    finishScan();
}

function stopScan() {
    scanning = false;
    isPaused = false;
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    setStatus('Stopping…', 'scanning');
}

function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('pauseBtn');
    btn.textContent = isPaused ? '▶ Continue' : '⏸ Pause';
    btn.className = isPaused ? 'btn' : 'btn-pause';
    setStatus(isPaused ? 'Paused' : 'Resuming...', 'scanning');
}

function finishScan() {
    setProgress(100);
    const stoppedEarly = !scanning;
    const label = stoppedEarly ? '⏹ Stopped' : '✓ Done';
    setStatus(`${label} — ${allRows.length} positions from ${Math.min(loadedCount, whaleList.length)} whales`, 'done');
    scanning = false;
    document.getElementById('scanBtn').disabled = false;
    setTimeout(() => setProgress(0), 1500);
}

function updateStats() {
    const whalesWithPos = new Set(allRows.map(r => r.address)).size;
    const totalCap = [...new Set(allRows.map(r => r.address))].reduce((s, addr) => {
        const row = allRows.find(r => r.address === addr);
        return s + (row?.accountValue || 0);
    }, 0);
    const totalUpnl = allRows.reduce((s, r) => s + r.unrealizedPnl, 0);

    document.getElementById('sWhales').textContent = fmtNum(whalesWithPos);
    document.getElementById('sPositions').textContent = fmtNum(allRows.length);
    const sym = showSymbols ? '$' : '';
    document.getElementById('sCapital').textContent = sym + fmt(totalCap);
    const upnlEl = document.getElementById('sUpnl');
    upnlEl.textContent = fmtUSD(totalUpnl);
    upnlEl.className = 'stat-value ' + (totalUpnl >= 0 ? 'green' : 'red');
    const largest = Math.max(...allRows.map(r => r.accountValue), 0);
    document.getElementById('sLargest').textContent = sym + fmt(largest);
}

// ── Generic Combobox Engine ──────────────────────────────────────────
// Each combobox is identified by its base id (e.g. 'sideFilter').
// HTML structure expected:
//   <div class="combobox" id="cb-{id}">
//     <div class="combobox-input-wrap">
//       <input type="text" id="cb-{id}-search" ...>
//       <span class="combobox-arrow">▾</span>
//     </div>
//     <div class="combobox-dropdown" id="cb-{id}-dropdown"></div>
//   </div>
//   <input type="hidden" id="{id}" value="">

const CB_OPTIONS = {}; // id -> [{value, label}]
const CB_TIMERS = {};  // id -> timeout

function cbInit(id, options, onChangeFn) {
    CB_OPTIONS[id] = options; // [{value, label}]
    cbRender(id);
    // Set display to match current hidden value
    const hidden = document.getElementById(id);
    if (hidden && hidden.value) {
        const opt = options.find(o => o.value === hidden.value);
        const search = document.getElementById(`cb-${id}-search`);
        if (search && opt) search.value = opt.label;
    }
}

function cbOpen(id) {
    // Close all other comboboxes first
    Object.keys(CB_OPTIONS).forEach(otherId => {
        if (otherId !== id) cbClose(otherId);
    });
    const cb = document.getElementById(`cb-${id}`);
    if (!cb) return;
    cb.classList.add('open');
    cbRender(id);
}

function cbCloseDelayed(id) {
    CB_TIMERS[id] = setTimeout(() => cbClose(id), 180);
}

function cbClose(id) {
    const cb = document.getElementById(`cb-${id}`);
    if (cb) cb.classList.remove('open');
}

function cbRender(id) {
    const dd = document.getElementById(`cb-${id}-dropdown`);
    if (!dd) return;
    const options = CB_OPTIONS[id] || [];
    const current = document.getElementById(id)?.value || '';

    const html = options.map(o => {
        const isSel = o.value === current;
        const isAll = o.value === '';
        return `<div class="combobox-item${isSel ? ' selected' : ''}${isAll ? ' all-item' : ''}" onmousedown="cbSelect('${id}','${o.value}','${o.label.replace(/'/g, "\\'")}')">` +
            `${o.label}</div>`;
    }).join('');

    dd.innerHTML = html || `<div class="combobox-empty">No options</div>`;
}

function cbSelect(id, value, label) {
    if (CB_TIMERS[id]) { clearTimeout(CB_TIMERS[id]); delete CB_TIMERS[id]; }
    const hidden = document.getElementById(id);
    if (hidden) hidden.value = value;
    const search = document.getElementById(`cb-${id}-search`);
    if (search) search.value = label;
    cbClose(id);
    // Fire the appropriate callback
    if (id === 'currencySelect' || id === 'entryCurrencySelect') {
        onCurrencyChange();
    } else {
        renderTable();
    }
}

function cbSetValue(id, value) {
    const options = CB_OPTIONS[id] || [];
    const opt = options.find(o => o.value === value);
    if (!opt) return;
    const hidden = document.getElementById(id);
    if (hidden) hidden.value = value;
    const search = document.getElementById(`cb-${id}-search`);
    if (search) search.value = opt.label;
}

// ── Coin Combobox (searchable) ──────────────────────────────────────────
let _coinOptions = [];
let _closeTimer = null;

function openCombobox() {
    // Close generic comboboxes
    Object.keys(CB_OPTIONS).forEach(id => cbClose(id));
    const cb = document.getElementById('coinCombobox');
    if (!cb) return;
    cb.classList.add('open');
    renderCoinDropdown(document.getElementById('coinSearch').value);
}

function closeComboboxDelayed() {
    _closeTimer = setTimeout(() => {
        const cb = document.getElementById('coinCombobox');
        if (cb) cb.classList.remove('open');
    }, 180);
}

function onCoinSearch() {
    const cb = document.getElementById('coinCombobox');
    if (cb) cb.classList.add('open');
    const query = document.getElementById('coinSearch').value;
    renderCoinDropdown(query);
}

function renderCoinDropdown(query = '') {
    const dd = document.getElementById('coinDropdown');
    if (!dd) return;
    const q = query.trim().toUpperCase();
    const filtered = q ? _coinOptions.filter(c => c.toUpperCase().includes(q)) : _coinOptions;

    let html = `<div class="combobox-item all-item ${selectedCoins.length === 0 ? 'selected' : ''}" onmousedown="event.preventDefault(); selectCoin('','')">All coins</div>`;
    if (filtered.length === 0) {
        html += `<div class="combobox-empty">No match</div>`;
    } else {
        html += filtered.map(c => {
            const isSel = selectedCoins.includes(c);
            return `<div class="combobox-item${isSel ? ' selected' : ''}" onmousedown="event.preventDefault(); selectCoin('${c}','${c}')">` +
                `<span class="item-label">${c}</span>${isSel ? '<span class="item-remove">✕</span>' : ''}</div>`;
        }).join('');
    }
    dd.innerHTML = html;
}

function selectCoin(value, label) {
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }

    if (value === '') {
        selectedCoins = [];
    } else {
        const idx = selectedCoins.indexOf(value);
        if (idx > -1) {
            selectedCoins.splice(idx, 1);
        } else {
            selectedCoins.push(value);
        }
    }

    updateCoinSearchLabel();
    renderCoinDropdown(document.getElementById('coinSearch').value);
    renderTable();
    renderQuotesPanel();
    fetchMarketCapRanking(); // Update ranking panel selection state
}

function updateCoinSearchLabel() {
    const search = document.getElementById('coinSearch');
    if (selectedCoins.length === 0) {
        search.value = '';
        search.placeholder = 'Select coins…';
    } else if (selectedCoins.length === 1) {
        search.value = selectedCoins[0];
    } else {
        search.value = `${selectedCoins.length} coins selected`;
    }
}

function updateCoinFilter(initialCoins = null) {
    let coins = initialCoins || [...new Set(allRows.map(r => r.coin))].sort();
    const current = document.getElementById('coinFilter').value;
    if (!initialCoins && current && !coins.includes(current)) {
        coins.push(current);
        coins.sort();
    }
    _coinOptions = coins;
    const cb = document.getElementById('coinCombobox');
    if (cb && cb.classList.contains('open')) {
        renderCoinDropdown(document.getElementById('coinSearch').value);
    }
}

// ── Color Helpers ──
function getPointColor(side, leverage, isHighLev, isBorder = false) {
    const splitVal = parseInt(chartHighLevSplit, 10);
    const maxLev = colorMaxLev;
    
    let factor = 0;
    
    // Calculate factor relative to the dataset range
    if (!isHighLev) {
        // Range: 1 to Split
        // If split is 1, factor is 0.
        if (splitVal > 1) {
            factor = (leverage - 1) / (splitVal - 1);
        }
    } else {
        // Range: Split to Max
        if (maxLev > splitVal) {
            factor = (leverage - splitVal) / (maxLev - splitVal);
        }
    }
    
    // Clamp factor
    if (factor < 0) factor = 0;
    if (factor > 1) factor = 1;

    const alpha = isBorder ? 1 : 0.6;

    if (side === 'long') {
        if (!isHighLev) {
            // Low Leverage: Yellow (234, 179, 8) -> Dark Gold/Orange (202, 138, 4)
            // Ensures low leverage longs stay in the yellow/orange spectrum
            const r = Math.round(234 + (202 - 234) * factor);
            const g = Math.round(179 + (138 - 179) * factor);
            const b = Math.round(8 + (4 - 8) * factor);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        } else {
            // High Leverage: Green (34, 197, 94) -> Dark Green (21, 128, 61)
            // Ensures high leverage longs are distinctly green
            const r = Math.round(34 + (21 - 34) * factor);
            const g = Math.round(197 + (128 - 197) * factor);
            const b = Math.round(94 + (61 - 94) * factor);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
    } else {
        if (!isHighLev) {
            // Low Leverage: Fuchsia (217, 70, 239) -> Dark Purple (126, 34, 206)
            // Ensures low leverage shorts stay in the pink/purple spectrum
            const r = Math.round(217 + (126 - 217) * factor);
            const g = Math.round(70 + (34 - 70) * factor);
            const b = Math.round(239 + (206 - 239) * factor);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        } else {
            // High Leverage: Red (239, 68, 68) -> Dark Red (153, 27, 27)
            // Ensures high leverage shorts are distinctly red
            const r = Math.round(239 + (153 - 239) * factor);
            const g = Math.round(68 + (27 - 68) * factor);
            const b = Math.round(68 + (27 - 68) * factor);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
    }
}

function updateColorSettings() {
    const max = parseInt(document.getElementById('colorMaxLev').value, 10);
    if (!isNaN(max) && max > 1) {
        colorMaxLev = max;
        renderCharts();
        saveSettings();
    }
}

function updateChartFilters() {
    const hSplit = parseInt(document.getElementById('chartHighLevSplit').value, 10);
    if (!isNaN(hSplit)) chartHighLevSplit = hSplit;

    saveSettings();
    renderCharts();
}

function updateBubbleSize(val) {
    bubbleScale = parseFloat(val);
    document.getElementById('bubbleSizeVal').textContent = bubbleScale.toFixed(1);
    renderScatterPlot();
    saveSettings();
}

function updateAggregation(val) {
    aggregationFactor = parseInt(val, 10);
    document.getElementById('aggregationVal').textContent = aggregationFactor;
    renderScatterPlot();
    saveSettings();
}

function setChartMode(el) {
    document.querySelectorAll('.tab[data-chart]').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    chartMode = el.dataset.chart;
    
    // Show/hide bubble size control based on mode
    const bubbleCtrl = document.getElementById('bubbleSizeCtrl');
    if (bubbleCtrl) {
        bubbleCtrl.style.display = (chartMode === 'scatter') ? 'block' : 'none';
    }

    const aggCtrl = document.getElementById('aggregationCtrl');
    if (aggCtrl) {
        aggCtrl.style.display = (chartMode === 'column') ? 'block' : 'none';
    }

    renderCharts();
    saveSettings();
}

// ── Chart Logic ──
let scatterChart = null;
let liqChartInstance = null;

function renderCharts() {
    renderScatterPlot();
    renderLiqScatterPlot();
}

function renderScatterPlot() {
    const section = document.getElementById('chart-section');
    if (!section) return;

    if (!displayedRows || displayedRows.length === 0) {
        section.style.display = 'none';
        return;
    }

    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const currencyMeta = CURRENCY_META[activeEntryCurrency || 'USD'] || CURRENCY_META.USD;
    const sym = showSymbols ? currencyMeta.symbol : '';
    const entryLabel = `Entry Price (${activeEntryCurrency || 'USD'})`;

    // 1. Prepare Data
    const data = displayedRows.map(r => {
        let volBTC = 0;
        if (r.coin === 'BTC') {
            volBTC = Math.abs(r.szi);
        } else if (btcPrice > 0) {
            volBTC = r.positionValue / btcPrice;
        }

        const entryCorr = getCorrelatedEntry(r);
        return {
            x: entryCorr,
            y: volBTC,
            _raw: r
        };
    }).filter(d => {
        // No pre-filtering by leverage/side variables anymore,
        // relying on Chart.js legend visibility toggling.
        return true;
    });

    if (data.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    const canvas = document.getElementById('scatterChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 2. Prepare Reference Price
    let refPrice = btcPrice;
    if (activeEntryCurrency === 'BTC') {
        refPrice = 1;
    } else if (activeEntryCurrency && activeEntryCurrency !== 'USD') {
        const rate = fxRates[activeEntryCurrency] || 1;
        refPrice = btcPrice * rate;
    }
    const priceStr = refPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const labelText = `BTC: ${sym}${priceStr}`;
    
    // Annotations (shared)
    const annotations = {
        currentPriceLine: {
            type: 'line',
            xMin: refPrice,
            xMax: refPrice,
            borderColor: 'rgba(255, 255, 255, 0.5)',
            borderWidth: 1,
            borderDash: [5, 5],
            clip: false
        }
    };

    // 3. Configure Chart based on Mode
    let datasets = [];
    let chartType = 'bubble';
    let scales = {};
    let tooltipCallback = null;

    if (chartMode === 'column') {
        // Histogram Mode
        chartType = 'bar';
        
        // Create Bins
        const xValues = data.map(d => d.x);
        const minX = Math.min(...xValues, refPrice);
        const maxX = Math.max(...xValues, refPrice);
        
        // Smart bin count based on range distribution, but fixed 50 is usually fine
        const numBins = aggregationFactor;
        const range = maxX - minX || 1;
        const binSize = range / numBins;
        
        // Initialize bins
        // Structure: { x: center, long: 0, short: 0 }
        const bins = [];
        for (let i = 0; i < numBins; i++) {
            bins.push({ 
                x: minX + (i * binSize) + (binSize / 2), // center of bin
                xStart: minX + (i * binSize),
                xEnd: minX + ((i + 1) * binSize),
                long: 0, 
                short: 0 
            });
        }

        // Fill bins
        data.forEach(d => {
            const binIdx = Math.min(Math.floor((d.x - minX) / binSize), numBins - 1);
            if (binIdx >= 0) {
                if (d._raw.side === 'long') bins[binIdx].long += d.y;
                else bins[binIdx].short += d.y;
            }
        });

        datasets = [
            {
                label: 'Longs',
                data: bins.map(b => ({ x: b.x, y: b.long })),
                backgroundColor: 'rgba(34, 197, 94, 0.7)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 1.0
            },
            {
                label: 'Shorts',
                data: bins.map(b => ({ x: b.x, y: b.short })),
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 1.0
            }
        ];

        scales = {
            x: {
                type: 'linear',
                title: { display: true, text: entryLabel, color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                stacked: true,
                offset: false,
                ticks: {
                    color: '#9ca3af',
                    callback: function(value) {
                        return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
                    }
                }
            },
            y: {
                type: 'linear',
                title: { display: true, text: 'Volume (BTC)', color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                stacked: true,
                beginAtZero: true
            }
        };

        tooltipCallback = {
            label: function(context) {
                const raw = context.raw;
                const side = context.dataset.label;
                return `${side}: ${raw.y.toFixed(4)} ₿ @ ~${raw.x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
            }
        };

    } else {
        // Scatter (Bubble) Mode
        chartType = 'bubble';
        
        const maxVol = Math.max(...data.map(d => d.y), 0.0001);
        const minX = Math.min(...data.map(d => d.x));
        const maxX = Math.max(...data.map(d => d.x));
        const maxY = maxVol;

        const xPadding = (maxX - minX) * 0.05 || 1;
        const yPadding = maxY * 0.05 || 1;
        
        const bubbleData = data.map(d => {
            // Apply bubbleScale
            const radius = (3 + (Math.sqrt(d.y) / Math.sqrt(maxVol)) * 17) * bubbleScale;
            return {
                x: d.x,
                y: d.y,
                r: radius,
                _raw: d._raw
            };
        });

        const splitVal = parseInt(chartHighLevSplit, 10);
        const longsLow = bubbleData.filter(d => d._raw.side === 'long' && parseFloat(d._raw.leverageValue) <= splitVal);
        const longsHigh = bubbleData.filter(d => d._raw.side === 'long' && parseFloat(d._raw.leverageValue) > splitVal);
        const shortsLow = bubbleData.filter(d => d._raw.side === 'short' && parseFloat(d._raw.leverageValue) <= splitVal);
        const shortsHigh = bubbleData.filter(d => d._raw.side === 'short' && parseFloat(d._raw.leverageValue) > splitVal);

        datasets = [
            {
                label: `Longs (≤${splitVal}x)`,
                data: longsLow,
                backgroundColor: longsLow.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), false)),
                borderColor: longsLow.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), false, true)),
                borderWidth: 1,
                hoverBackgroundColor: longsLow.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), false, true)),
                hoverBorderColor: '#fff',
                hoverBorderWidth: 2
            },
            {
                label: `Longs (>${splitVal}x)`,
                data: longsHigh,
                backgroundColor: longsHigh.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), true)),
                borderColor: longsHigh.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), true, true)),
                borderWidth: 1,
                hoverBackgroundColor: longsHigh.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), true, true)),
                hoverBorderColor: '#fff',
                hoverBorderWidth: 2
            },
            {
                label: `Shorts (≤${splitVal}x)`,
                data: shortsLow,
                backgroundColor: shortsLow.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), false)),
                borderColor: shortsLow.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), false, true)),
                borderWidth: 1,
                hoverBackgroundColor: shortsLow.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), false, true)),
                hoverBorderColor: '#fff',
                hoverBorderWidth: 2
            },
            {
                label: `Shorts (>${splitVal}x)`,
                data: shortsHigh,
                backgroundColor: shortsHigh.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), true)),
                borderColor: shortsHigh.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), true, true)),
                borderWidth: 1,
                hoverBackgroundColor: shortsHigh.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), true, true)),
                hoverBorderColor: '#fff',
                hoverBorderWidth: 2
            }
        ];

        scales = {
            x: {
                type: 'linear',
                title: { display: true, text: entryLabel, color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                min: minX - xPadding,
                max: maxX + xPadding,
                ticks: {
                    color: '#9ca3af',
                    callback: function(value) {
                        return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
                    }
                }
            },
            y: {
                type: 'linear',
                title: { display: true, text: 'Volume (BTC)', color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                beginAtZero: true,
                min: 0,
                max: maxY + yPadding
            }
        };

        tooltipCallback = {
            label: function(context) {
                const d = context.raw;
                const r = d._raw;
                return [
                    `${r.coin} ${r.side.toUpperCase()} (${r.leverageValue}x)`,
                    `Entry (Corr): ${d.x.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${activeEntryCurrency || 'USD'}`,
                    `Vol: ${d.y.toFixed(4)} ₿`,
                    `Value: $${fmt(r.positionValue)}`,
                    `Addr: ${fmtAddr(r.address)}`
                ];
            }
        };
    }

    // 4. Handle Chart Instance
    if (scatterChart) {
        if (scatterChart.config.type !== chartType) {
            scatterChart.destroy();
            scatterChart = null;
        }
    }

    if (scatterChart) {
        // Preserve hidden state by INDEX to avoid label mismatches
        const hiddenIndices = [];
        if (scatterChart.data && scatterChart.data.datasets) {
            scatterChart.data.datasets.forEach((ds, i) => {
                // isDatasetVisible returns true if visible. We want to know if it is HIDDEN.
                if (!scatterChart.isDatasetVisible(i)) {
                    hiddenIndices.push(i);
                }
            });
        }
        
        // Apply hidden state to new datasets by index
        datasets.forEach((ds, i) => {
            if (hiddenIndices.includes(i)) {
                ds.hidden = true;
            }
        });

        scatterChart.data.datasets = datasets;
        
        // Preserve zoom state if scales exist
        const currentX = scatterChart.scales.x;
        const currentY = scatterChart.scales.y;
        
        // Check if we are in a zoomed state (saved or current)
        if (savedScatterState) {
            if (scales.x) { scales.x.min = savedScatterState.x.min; scales.x.max = savedScatterState.x.max; }
            if (scales.y) { scales.y.min = savedScatterState.y.min; scales.y.max = savedScatterState.y.max; }
            scatterChart.isZoomed = true;
            const btn = document.getElementById('resetZoomBtn');
            if (btn) btn.style.display = 'block';
        } else if ((scatterChart.isZoomed || (scatterChart.isZoomedOrPanned && scatterChart.isZoomedOrPanned())) && currentX && currentY) {
            // Apply current min/max to the new scales config
            if (scales.x) {
                scales.x.min = currentX.min;
                scales.x.max = currentX.max;
            }
            if (scales.y) {
                scales.y.min = currentY.min;
                scales.y.max = currentY.max;
            }
        }

        // Now assign the scales to options
        scatterChart.options.scales = scales;
        
        // Re-assign plugins/annotations (moved outside the zoom check block)
        scatterChart.options.plugins.annotation.annotations = annotations;
        scatterChart.options.plugins.btcPriceLabel = { price: refPrice, text: labelText };
        scatterChart.options.plugins.tooltip.callbacks = tooltipCallback;
        // Ensure padding
        if (!scatterChart.options.layout) scatterChart.options.layout = {};
        if (!scatterChart.options.layout.padding) scatterChart.options.layout.padding = {};
        scatterChart.options.layout.padding.bottom = 40;
        
        scatterChart.update('none'); // Use 'none' mode to avoid animation and reduce flicker
    } else {
        Chart.defaults.color = '#9ca3af';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

        if (savedScatterState) {
            if (scales.x) { scales.x.min = savedScatterState.x.min; scales.x.max = savedScatterState.x.max; }
            if (scales.y) { scales.y.min = savedScatterState.y.min; scales.y.max = savedScatterState.y.max; }
            const btn = document.getElementById('resetZoomBtn');
            if (btn) btn.style.display = 'block';
        }

        scatterChart = new Chart(ctx, {
            type: chartType,
            data: {
                datasets: datasets
            },
            options: {
                layout: {
                    padding: { bottom: 40 }
                },
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'xy',
                    intersect: true
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#9ca3af',
                            usePointStyle: true,
                            font: { size: 11 },
                            generateLabels: function(chart) {
                                const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                original.forEach(label => {
                                    if (label.text.includes('Longs (≤')) {
                                        label.fillStyle = 'rgba(234, 179, 8, 0.8)';
                                        label.strokeStyle = 'rgba(234, 179, 8, 1)';
                                    } else if (label.text.includes('Longs (>')) {
                                        label.fillStyle = 'rgba(34, 197, 94, 0.8)';
                                        label.strokeStyle = 'rgba(34, 197, 94, 1)';
                                    } else if (label.text.includes('Shorts (≤')) {
                                        label.fillStyle = 'rgba(217, 70, 239, 0.8)';
                                        label.strokeStyle = 'rgba(217, 70, 239, 1)';
                                    } else if (label.text.includes('Shorts (>')) {
                                        label.fillStyle = 'rgba(239, 68, 68, 0.8)';
                                        label.strokeStyle = 'rgba(239, 68, 68, 1)';
                                    }
                                });
                                return original;
                            }
                        }
                    },
                    zoom: {
                        zoom: {
                            wheel: { 
                                enabled: true,
                                speed: 0.05,
                                modifierKey: 'ctrl',
                            },
                            pinch: { enabled: true },
                            drag: {
                                enabled: true,
                                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                borderColor: 'rgba(59, 130, 246, 0.4)',
                                borderWidth: 1,
                                modifierKey: 'shift',
                            },
                            mode: 'xy',
                            onZoom: function({chart}) { 
                                chart.isZoomed = true; 
                                saveSettings(); 
                                const btn = document.getElementById('resetZoomBtn');
                                if(btn) btn.style.display = 'block';
                            }
                        },
                        pan: {
                            enabled: true,
                            mode: 'xy',
                            onPan: function({chart}) { 
                                chart.isZoomed = true; 
                                saveSettings(); 
                                const btn = document.getElementById('resetZoomBtn');
                                if(btn) btn.style.display = 'block';
                            }
                        }
                    },
                    btcPriceLabel: {
                        price: refPrice,
                        text: labelText
                    },
                    annotation: {
                        annotations: annotations
                    },
                    tooltip: {
                        caretPadding: 30,
                        padding: 10,
                        backgroundColor: 'rgba(7, 12, 26, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        titleColor: '#fff',
                        bodyColor: '#e2e8f4',
                        callbacks: tooltipCallback
                    }
                },
                scales: scales
            },
            plugins: [{
                id: 'btcPriceLabel',
                afterDraw: (chart) => {
                    const opts = chart.options.plugins.btcPriceLabel;
                    if (!opts || !opts.text) return;
                    
                    const { ctx, chartArea: { bottom, left, right }, scales: { x } } = chart;
                    const xVal = x.getPixelForValue(opts.price);
                    
                    if (xVal < left || xVal > right) return;
                    
                    const text = opts.text;
                    ctx.save();
                    ctx.font = 'bold 11px sans-serif';
                    const textWidth = ctx.measureText(text).width + 16;
                    const textHeight = 22;
                    const yPos = bottom + 25;
                    
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
                    ctx.beginPath();
                    const r = 4;
                    ctx.roundRect(xVal - textWidth / 2, yPos, textWidth, textHeight, r);
                    ctx.fill();
                    
                    ctx.beginPath();
                    ctx.moveTo(xVal, yPos);
                    ctx.lineTo(xVal - 5, yPos + 6);
                    ctx.lineTo(xVal + 5, yPos + 6);
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
                    ctx.fill();
                    
                    ctx.fillStyle = '#000';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, xVal, yPos + textHeight / 2);
                    
                    ctx.restore();
                }
            }, {
                id: 'crosshair',
                defaults: {
                    width: 1,
                    color: 'rgba(255, 255, 255, 0.2)',
                    dash: [3, 3]
                },
                afterInit: (chart, args, options) => {
                    chart.crosshair = { x: 0, y: 0, visible: false };
                },
                afterEvent: (chart, args) => {
                    const { inChartArea } = args;
                    const { x, y } = args.event;
                    chart.crosshair = { x, y, visible: inChartArea };
                    args.changed = true;
                },
                afterDraw: (chart, args, options) => {
                    if (chart.crosshair && chart.crosshair.visible) {
                        const { ctx, chartArea: { top, bottom, left, right }, scales: { x: xScale, y: yScale } } = chart;
                        const { x, y } = chart.crosshair;

                        ctx.save();
                        
                        ctx.beginPath();
                        ctx.lineWidth = options.width;
                        ctx.strokeStyle = options.color;
                        ctx.setLineDash(options.dash);
                        
                        ctx.moveTo(x, top);
                        ctx.lineTo(x, bottom);
                        ctx.moveTo(left, y);
                        ctx.lineTo(right, y);
                        ctx.stroke();

                        ctx.font = '11px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        const xValue = xScale.getValueForPixel(x);
                        const xLabel = xValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
                        const xLabelWidth = ctx.measureText(xLabel).width + 12;
                        const xLabelHeight = 20;
                        
                        ctx.fillStyle = 'rgba(7, 12, 26, 0.9)';
                        ctx.fillRect(x - xLabelWidth / 2, bottom, xLabelWidth, xLabelHeight);
                        
                        ctx.fillStyle = '#e2e8f4';
                        ctx.fillText(xLabel, x, bottom + 10);

                        const yValue = yScale.getValueForPixel(y);
                        const yLabel = yValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                        const yLabelWidth = ctx.measureText(yLabel).width + 12;
                        const yLabelHeight = 20;
                        
                        ctx.fillStyle = 'rgba(7, 12, 26, 0.9)';
                        ctx.fillRect(left - yLabelWidth, y - yLabelHeight / 2, yLabelWidth, yLabelHeight);
                        
                        ctx.textAlign = 'right';
                        ctx.fillStyle = '#e2e8f4';
                        ctx.fillText(yLabel, left - 6, y);

                        ctx.restore();
                    }
                }
            }]
        });
        
        if (savedScatterState) scatterChart.isZoomed = true;
    }
}


function renderLiqScatterPlot() {
    const section = document.getElementById('liq-chart-section');
    if (!section) return;

    if (!displayedRows || displayedRows.length === 0) {
        section.style.display = 'none';
        return;
    }

    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const currencyMeta = CURRENCY_META[activeEntryCurrency || 'USD'] || CURRENCY_META.USD;
    const sym = showSymbols ? currencyMeta.symbol : '';
    const entryLabel = `Liquidation Price (${activeEntryCurrency || 'USD'})`;

    // 1. Prepare Data
    const data = displayedRows.map(r => {
        let volBTC = 0;
        if (r.coin === 'BTC') {
            volBTC = Math.abs(r.szi);
        } else if (btcPrice > 0) {
            volBTC = r.positionValue / btcPrice;
        }

        const liqPrice = r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx) : 0;
        
        if (liqPrice <= 0) return null;

        return {
            x: liqPrice,
            y: volBTC,
            _raw: r
        };
    }).filter(d => {
        if (d === null) return false;
        
        const r = d._raw;
        const lev = Math.abs(r.leverageValue);
        
        if (r.side === 'long') {
             // No pre-filtering
        } else { // short
             // No pre-filtering
        }
        return true;
    });

    if (data.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    section.style.height = liqChartHeight + 'px';

    const canvas = document.getElementById('liqChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 2. Prepare Reference Price
    let refPrice = btcPrice;
    if (activeEntryCurrency === 'BTC') {
        refPrice = 1;
    } else if (activeEntryCurrency && activeEntryCurrency !== 'USD') {
        const rate = fxRates[activeEntryCurrency] || 1;
        refPrice = btcPrice * rate;
    }
    
    const priceStr = refPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const labelText = `BTC: ${sym}${priceStr}`;
    
    // Annotations (shared)
    const annotations = {
        currentPriceLine: {
            type: 'line',
            xMin: refPrice,
            xMax: refPrice,
            borderColor: 'rgba(255, 255, 255, 0.5)',
            borderWidth: 1,
            borderDash: [5, 5],
            clip: false
        }
    };

    // 3. Configure Chart based on Mode
    let datasets = [];
    let chartType = 'bubble';
    let scales = {};
    let tooltipCallback = null;

    if (chartMode === 'column') {
        // Histogram Mode
        chartType = 'bar';
        
        // Create Bins
        const xValues = data.map(d => d.x);
        const minX = Math.min(...xValues, refPrice);
        const maxX = Math.max(...xValues, refPrice);
        
        const numBins = aggregationFactor;
        const range = maxX - minX || 1;
        const binSize = range / numBins;
        
        // Initialize bins
        const bins = [];
        for (let i = 0; i < numBins; i++) {
            bins.push({ 
                x: minX + (i * binSize) + (binSize / 2),
                xStart: minX + (i * binSize),
                xEnd: minX + ((i + 1) * binSize),
                long: 0, 
                short: 0 
            });
        }

        // Fill bins
        data.forEach(d => {
            const binIdx = Math.min(Math.floor((d.x - minX) / binSize), numBins - 1);
            if (binIdx >= 0) {
                if (d._raw.side === 'long') bins[binIdx].long += d.y;
                else bins[binIdx].short += d.y;
            }
        });

        datasets = [
            {
                label: 'Longs',
                data: bins.map(b => ({ x: b.x, y: b.long })),
                backgroundColor: 'rgba(34, 197, 94, 0.7)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 1.0
            },
            {
                label: 'Shorts',
                data: bins.map(b => ({ x: b.x, y: b.short })),
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 1.0
            }
        ];

        scales = {
            x: {
                type: 'linear',
                title: { display: true, text: entryLabel, color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                stacked: true,
                offset: false,
                ticks: {
                    color: '#9ca3af',
                    callback: function(value) {
                        return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
                    }
                }
            },
            y: {
                type: 'linear',
                title: { display: true, text: 'Volume (BTC)', color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                stacked: true,
                beginAtZero: true
            }
        };

        tooltipCallback = {
            label: function(context) {
                const raw = context.raw;
                const side = context.dataset.label;
                return `${side}: ${raw.y.toFixed(4)} ₿ @ ~${raw.x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
            }
        };

    } else {
        // Scatter (Bubble) Mode
        chartType = 'bubble';
        
        const maxVol = Math.max(...data.map(d => d.y), 0.0001);
        const minX = Math.min(...data.map(d => d.x));
        const maxX = Math.max(...data.map(d => d.x));
        // For log scale, min cannot be 0.
        const minY = Math.min(...data.map(d => d.y).filter(y => y > 0)) || 0.0001;

        const xPadding = (maxX - minX) * 0.05 || 1;
        
        const bubbleData = data.map(d => {
            const radius = (3 + (Math.sqrt(d.y) / Math.sqrt(maxVol)) * 17) * bubbleScale;
            return {
                x: d.x,
                y: d.y,
                r: radius,
                _raw: d._raw
            };
        });

        const splitVal = parseInt(chartHighLevSplit, 10);
        const longsLow = bubbleData.filter(d => d._raw.side === 'long' && parseFloat(d._raw.leverageValue) <= splitVal);
        const longsHigh = bubbleData.filter(d => d._raw.side === 'long' && parseFloat(d._raw.leverageValue) > splitVal);
        const shortsLow = bubbleData.filter(d => d._raw.side === 'short' && parseFloat(d._raw.leverageValue) <= splitVal);
        const shortsHigh = bubbleData.filter(d => d._raw.side === 'short' && parseFloat(d._raw.leverageValue) > splitVal);

        datasets = [
            {
                label: `Longs (≤${splitVal}x)`,
                data: longsLow,
                backgroundColor: longsLow.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), false)),
                borderColor: longsLow.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), false, true)),
                borderWidth: 1,
                hoverBackgroundColor: longsLow.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), false, true)),
                hoverBorderColor: '#fff',
                hoverBorderWidth: 2
            },
            {
                label: `Longs (>${splitVal}x)`,
                data: longsHigh,
                backgroundColor: longsHigh.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), true)),
                borderColor: longsHigh.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), true, true)),
                borderWidth: 1,
                hoverBackgroundColor: longsHigh.map(d => getPointColor('long', parseFloat(d._raw.leverageValue), true, true)),
                hoverBorderColor: '#fff',
                hoverBorderWidth: 2
            },
            {
                label: `Shorts (≤${splitVal}x)`,
                data: shortsLow,
                backgroundColor: shortsLow.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), false)),
                borderColor: shortsLow.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), false, true)),
                borderWidth: 1,
                hoverBackgroundColor: shortsLow.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), false, true)),
                hoverBorderColor: '#fff',
                hoverBorderWidth: 2
            },
            {
                label: `Shorts (>${splitVal}x)`,
                data: shortsHigh,
                backgroundColor: shortsHigh.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), true)),
                borderColor: shortsHigh.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), true, true)),
                borderWidth: 1,
                hoverBackgroundColor: shortsHigh.map(d => getPointColor('short', parseFloat(d._raw.leverageValue), true, true)),
                hoverBorderColor: '#fff',
                hoverBorderWidth: 2
            }
        ];

        scales = {
            x: {
                type: 'linear',
                title: { display: true, text: entryLabel, color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                min: minX - xPadding,
                max: maxX + xPadding,
                ticks: {
                    color: '#9ca3af',
                    callback: function(value) {
                        return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
                    }
                }
            },
            y: {
                type: 'logarithmic',
                title: { display: true, text: 'Volume (BTC) [Log]', color: '#9ca3af' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                min: minY * 0.9,
                max: maxVol * 1.1,
                ticks: {
                    color: '#9ca3af',
                    callback: function(value) {
                        return Number(value).toLocaleString();
                    }
                }
            }
        };

        tooltipCallback = {
            label: function(context) {
                const d = context.raw;
                const r = d._raw;
                const liqPrice = r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx) : 0;
                const liqStr = liqPrice > 0 ? fmtPriceCcy(liqPrice) : 'N/A';
                
                return [
                    `${r.coin} ${r.side.toUpperCase()} x${r.leverageValue}`,
                    `Liq: ${liqStr}`,
                    `Vol: ${d.y.toFixed(4)} ₿`,
                    `User: ${r.user}`
                ];
            }
        };
    }

    if (liqChartInstance && liqChartInstance.config.type === chartType) {
        // Preserve hidden state by INDEX
        const hiddenIndices = [];
        if (liqChartInstance.data && liqChartInstance.data.datasets) {
            liqChartInstance.data.datasets.forEach((ds, i) => {
                if (!liqChartInstance.isDatasetVisible(i)) {
                    hiddenIndices.push(i);
                }
            });
        }
        
        // Apply hidden state to new datasets
        datasets.forEach((ds, i) => {
            if (hiddenIndices.includes(i)) {
                ds.hidden = true;
            }
        });

        liqChartInstance.data.datasets = datasets;
        
        // Check if we are in a zoomed state (saved or current)
        if (savedLiqState) {
            if (scales.x) { scales.x.min = savedLiqState.x.min; scales.x.max = savedLiqState.x.max; }
            if (scales.y) { scales.y.min = savedLiqState.y.min; scales.y.max = savedLiqState.y.max; }
            liqChartInstance.isZoomed = true;
            const btn = document.getElementById('resetLiqZoomBtn');
            if (btn) btn.style.display = 'block';
        } else {
            const currentX = liqChartInstance.scales.x;
            const currentY = liqChartInstance.scales.y;
            const isZoomed = liqChartInstance.isZoomed;

            if (isZoomed && currentX && currentY) {
                if (scales.x) {
                    scales.x.min = currentX.min;
                    scales.x.max = currentX.max;
                }
                if (scales.y) {
                    scales.y.min = currentY.min;
                    scales.y.max = currentY.max;
                }
            }
        }

        liqChartInstance.options.scales = scales;
        liqChartInstance.options.plugins.annotation.annotations = annotations;
        liqChartInstance.options.plugins.btcPriceLabel = { price: refPrice, text: labelText };
        liqChartInstance.options.plugins.tooltip.callbacks = tooltipCallback;
        
        if (!liqChartInstance.options.layout) liqChartInstance.options.layout = {};
        if (!liqChartInstance.options.layout.padding) liqChartInstance.options.layout.padding = {};
        liqChartInstance.options.layout.padding.bottom = 40;
        
        liqChartInstance.update('none');
        return;
    }

    if (liqChartInstance) {
        liqChartInstance.destroy();
    }

    // Apply saved state to new chart if available
    if (savedLiqState) {
        if (scales.x) { scales.x.min = savedLiqState.x.min; scales.x.max = savedLiqState.x.max; }
        if (scales.y) { scales.y.min = savedLiqState.y.min; scales.y.max = savedLiqState.y.max; }
        const btn = document.getElementById('resetLiqZoomBtn');
        if (btn) btn.style.display = 'block';
    }

    liqChartInstance = new Chart(ctx, {
        type: chartType,
        data: { datasets },
        options: {
            layout: {
                padding: { bottom: 40 }
            },
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: 'nearest',
                axis: 'xy',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#9ca3af',
                        usePointStyle: true,
                        font: { size: 11 },
                        generateLabels: function(chart) {
                            const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                            original.forEach(label => {
                                if (label.text.includes('Longs (≤')) {
                                    label.fillStyle = 'rgba(234, 179, 8, 0.8)';
                                    label.strokeStyle = 'rgba(234, 179, 8, 1)';
                                } else if (label.text.includes('Longs (>')) {
                                    label.fillStyle = 'rgba(34, 197, 94, 0.8)';
                                    label.strokeStyle = 'rgba(34, 197, 94, 1)';
                                } else if (label.text.includes('Shorts (≤')) {
                                    label.fillStyle = 'rgba(217, 70, 239, 0.8)';
                                    label.strokeStyle = 'rgba(217, 70, 239, 1)';
                                } else if (label.text.includes('Shorts (>')) {
                                    label.fillStyle = 'rgba(239, 68, 68, 0.8)';
                                    label.strokeStyle = 'rgba(239, 68, 68, 1)';
                                }
                            });
                            return original;
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    callbacks: tooltipCallback
                },
                annotation: {
                    annotations: annotations
                },
                btcPriceLabel: {
                    price: refPrice,
                    text: labelText
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'xy',
                        modifierKey: null,
                        onPan: ({chart}) => {
                             chart.isZoomed = true;
                             saveSettings();
                             const btn = document.getElementById('resetLiqZoomBtn');
                             if(btn) btn.style.display = 'block';
                        }
                    },
                    zoom: {
                        wheel: { enabled: true, modifierKey: 'ctrl' },
                        drag: { enabled: true, modifierKey: 'shift' },
                        pinch: { enabled: true },
                        mode: 'xy',
                        onZoom: ({chart}) => {
                             chart.isZoomed = true;
                             saveSettings();
                             const btn = document.getElementById('resetLiqZoomBtn');
                             if(btn) btn.style.display = 'block';
                        }
                    }
                }
            },
            scales: scales,
        },
        plugins: [
            {
                id: 'btcPriceLabel',
                afterDraw: (chart) => {
                    const opts = chart.options.plugins.btcPriceLabel;
                    if (!opts || !opts.text) return;
                    
                    const { ctx, chartArea: { bottom, left, right }, scales: { x } } = chart;
                    const xVal = x.getPixelForValue(opts.price);
                    
                    if (xVal < left || xVal > right) return;
                    
                    const text = opts.text;
                    ctx.save();
                    ctx.font = 'bold 11px sans-serif';
                    const textWidth = ctx.measureText(text).width + 16;
                    const textHeight = 22;
                    const yPos = bottom + 25;
                    
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
                    ctx.beginPath();
                    const r = 4;
                    ctx.roundRect(xVal - textWidth / 2, yPos, textWidth, textHeight, r);
                    ctx.fill();
                    
                    ctx.beginPath();
                    ctx.moveTo(xVal, yPos);
                    ctx.lineTo(xVal - 5, yPos + 6);
                    ctx.lineTo(xVal + 5, yPos + 6);
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
                    ctx.fill();
                    
                    ctx.fillStyle = '#000';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, xVal, yPos + textHeight / 2);
                    
                    ctx.restore();
                }
            },
            {
                id: 'crosshair',
                afterInit: (chart) => {
                    chart.crosshair = { x: 0, y: 0, visible: false };
                    const canvas = chart.canvas;
                    canvas.addEventListener('mousemove', (e) => {
                        const rect = canvas.getBoundingClientRect();
                        chart.crosshair.x = e.clientX - rect.left;
                        chart.crosshair.y = e.clientY - rect.top;
                        chart.crosshair.visible = true;
                        chart.draw();
                    });
                    canvas.addEventListener('mouseout', () => {
                        chart.crosshair.visible = false;
                        chart.draw();
                    });
                },
                beforeDatasetsDraw: (chart, args, options) => {
                    args.changed = true;
                },
                afterDraw: (chart, args, options) => {
                    if (chart.crosshair && chart.crosshair.visible) {
                        const { ctx, chartArea: { top, bottom, left, right }, scales: { x: xScale, y: yScale } } = chart;
                        const { x, y } = chart.crosshair;

                        ctx.save();
                        ctx.beginPath();
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                        ctx.setLineDash([3, 3]);
                        ctx.moveTo(x, top);
                        ctx.lineTo(x, bottom);
                        ctx.moveTo(left, y);
                        ctx.lineTo(right, y);
                        ctx.stroke();

                        ctx.font = '11px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        const xValue = xScale.getValueForPixel(x);
                        const xLabel = xValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
                        const xLabelWidth = ctx.measureText(xLabel).width + 12;
                        const xLabelHeight = 20;
                        
                        ctx.fillStyle = 'rgba(7, 12, 26, 0.9)';
                        ctx.fillRect(x - xLabelWidth / 2, bottom, xLabelWidth, xLabelHeight);
                        ctx.fillStyle = '#e2e8f4';
                        ctx.fillText(xLabel, x, bottom + 10);

                        const yValue = yScale.getValueForPixel(y);
                        const yLabel = yValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                        const yLabelWidth = ctx.measureText(yLabel).width + 12;
                        const yLabelHeight = 20;
                        
                        ctx.fillStyle = 'rgba(7, 12, 26, 0.9)';
                        ctx.fillRect(left - yLabelWidth, y - yLabelHeight / 2, yLabelWidth, yLabelHeight);
                        ctx.textAlign = 'right';
                        ctx.fillStyle = '#e2e8f4';
                        ctx.fillText(yLabel, left - 6, y);

                        ctx.restore();
                    }
                }
            }
        ]
    });
}

async function init() {
    setStatus('Initializing...', 'scanning');

    // Initialize all fixed-option comboboxes
    const CURRENCIES = [
        { value: '', label: 'Currency…' },
        { value: 'USD', label: 'USD $' },
        { value: 'BRL', label: 'BRL R$' },
        { value: 'EUR', label: 'EUR €' },
        { value: 'GBP', label: 'GBP £' },
        { value: 'JPY', label: 'JPY ¥' },
        { value: 'ARS', label: 'ARS $' },
        { value: 'CAD', label: 'CAD $' },
        { value: 'AUD', label: 'AUD $' },
        { value: 'BTC', label: 'BTC ₿' },
    ];
    cbInit('currencySelect', CURRENCIES);
    cbInit('entryCurrencySelect', CURRENCIES);
    cbSetValue('currencySelect', 'USD');
    cbSetValue('entryCurrencySelect', 'USD');

    cbInit('sideFilter', [
        { value: '', label: 'L + S' },
        { value: 'long', label: '▲ Long' },
        { value: 'short', label: '▼ Short' },
    ]);
    cbSetValue('sideFilter', '');

    cbInit('levTypeFilter', [
        { value: '', label: 'All types' },
        { value: 'isolated', label: 'Isolated' },
        { value: 'cross', label: 'Cross' },
    ]);
    cbSetValue('levTypeFilter', '');

    try {
        await Promise.all([fetchExchangeRates(), fetchAllMids()]);
        const allCoins = Object.keys(currentPrices).sort();
        if (allCoins.length > 0) {
            updateCoinFilter(allCoins);
        }
        loadSettings();
        updateColumnSelectDisplay(); // Ensure display is updated even if no settings loaded
        loadTableData(); // Load persisted data
        if (allRows.length > 0) {
            updateStats();
            updateCoinFilter();
            renderTable();
            setStatus(`Restored ${allRows.length} positions`, 'done');
        }

        initColumnReorder();
        fetchMarketCapRanking(true);
        setStatus('Ready', 'idle');
    } catch (e) {
        console.warn('Init failed', e);
        setStatus('Init error', 'error');
        loadSettings();
    }
}

// ── Column Reordering & Drag-Drop ───────────────────────────────────

let draggedColumnId = null;

function initColumnReorder() {
    const headers = document.querySelectorAll('thead tr:first-child th');
    headers.forEach(th => {
        th.setAttribute('draggable', 'true');
        th.addEventListener('dragstart', handleDragStart);
        th.addEventListener('dragover', handleDragOver);
        th.addEventListener('drop', handleDrop);
        th.addEventListener('dragenter', handleDragEnter);
        th.addEventListener('dragleave', handleDragLeave);
        th.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    // Only allow dragging if clicking on the header itself or label, not resizer
    if (e.target.classList.contains('resizer')) {
        e.preventDefault();
        return;
    }
    draggedColumnId = this.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.id);
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('thead th').forEach(th => th.classList.remove('drag-over'));
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    
    const targetTh = this;
    const targetId = targetTh.id;
    
    if (draggedColumnId && draggedColumnId !== targetId) {
        // Find keys in columnOrder
        const fromKey = COLUMN_DEFS.find(c => document.getElementById(draggedColumnId).classList.contains(c.key))?.key;
        const toKey = COLUMN_DEFS.find(c => targetTh.classList.contains(c.key))?.key;
        
        if (fromKey && toKey) {
            const fromIdx = columnOrder.indexOf(fromKey);
            const toIdx = columnOrder.indexOf(toKey);
            
            if (fromIdx > -1 && toIdx > -1) {
                // Move item in array
                const item = columnOrder.splice(fromIdx, 1)[0];
                columnOrder.splice(toIdx, 0, item);
                
                applyColumnOrder();
                renderTable();
                saveSettings();
            }
        }
    }
    return false;
}

function applyColumnOrder() {
    const headerRow = document.querySelector('thead tr:first-child');
    const filterRow = document.querySelector('thead tr.filter-row');
    if (!headerRow || !filterRow) return;
    
    // We need to reorder DOM elements based on columnOrder
    // First, map column keys to their DOM elements
    const headerMap = {};
    const filterMap = {};
    
    // Populate maps
    Array.from(headerRow.children).forEach(th => {
        const key = COLUMN_DEFS.find(c => th.classList.contains(c.key))?.key;
        if (key) headerMap[key] = th;
    });
    
    Array.from(filterRow.children).forEach(th => {
        const key = COLUMN_DEFS.find(c => th.classList.contains(c.key))?.key;
        if (key) filterMap[key] = th;
    });
    
    // Re-append in correct order
    columnOrder.forEach(key => {
        if (headerMap[key]) headerRow.appendChild(headerMap[key]);
        if (filterMap[key]) filterRow.appendChild(filterMap[key]);
    });
}


function renderTable() {
    const sideFilter = document.getElementById('sideFilter').value;
    const addressFilter = document.getElementById('addressFilter').value.trim().toLowerCase();
    const minLev = parseFloat(document.getElementById('minLev').value);
    const maxLev = parseFloat(document.getElementById('maxLev').value);
    const minSize = parseFloat(document.getElementById('minSize').value);
    const minFunding = parseFloat(document.getElementById('minFunding').value);
    const levTypeFilter = document.getElementById('levTypeFilter').value;

    const minSzi = parseFloat(document.getElementById('minSzi').value);
    const maxSzi = parseFloat(document.getElementById('maxSzi').value);
    const minValueCcy = parseFloat(document.getElementById('minValueCcy').value);
    const maxValueCcy = parseFloat(document.getElementById('maxValueCcy').value);
    const minEntryCcy = parseFloat(document.getElementById('minEntryCcy').value);
    const maxEntryCcy = parseFloat(document.getElementById('maxEntryCcy').value);
    const minUpnl = parseFloat(document.getElementById('minUpnl').value);
    const maxUpnl = parseFloat(document.getElementById('maxUpnl').value);

    saveSettings();

    let rows = allRows.filter(r => {
        if (selectedCoins.length > 0 && !selectedCoins.includes(r.coin)) return false;
        if (addressFilter) {
            const addr = r.address.toLowerCase();
            const disp = (r.displayName || '').toLowerCase();
            if (!addr.includes(addressFilter) && !disp.includes(addressFilter)) return false;
        }
        if (sideFilter && r.side !== sideFilter) return false;
        if (!isNaN(minLev) && r.leverageValue < minLev) return false;
        if (!isNaN(maxLev) && r.leverageValue > maxLev) return false;
        if (!isNaN(minSize) && r.positionValue < minSize) return false;
        if (!isNaN(minFunding) && Math.abs(r.funding) < minFunding) return false;
        if (levTypeFilter && r.leverageType !== levTypeFilter) return false;

        if (!isNaN(minSzi) && Math.abs(r.szi) < minSzi) return false;
        if (!isNaN(maxSzi) && Math.abs(r.szi) > maxSzi) return false;

        const valCcy = convertToActiveCcy(r.positionValue);
        if (!isNaN(minValueCcy) && valCcy < minValueCcy) return false;
        if (!isNaN(maxValueCcy) && valCcy > maxValueCcy) return false;

        const entCcy = getCorrelatedEntry(r);
        if (!isNaN(minEntryCcy) && entCcy < minEntryCcy) return false;
        if (!isNaN(maxEntryCcy) && entCcy > maxEntryCcy) return false;

        if (!isNaN(minUpnl) && r.unrealizedPnl < minUpnl) return false;
        if (!isNaN(maxUpnl) && r.unrealizedPnl > maxUpnl) return false;

        return true;
    });

    // Sort
    rows.sort((a, b) => {
        let va, vb;
        if (sortKey === 'coin') {
            return sortDir * a.coin.localeCompare(b.coin);
        } else if (sortKey === 'funding') {
            va = a.funding; vb = b.funding;
        } else if (sortKey === 'valueCcy') {
            va = convertToActiveCcy(a.positionValue);
            vb = convertToActiveCcy(b.positionValue);
        } else if (sortKey === 'entryCcy') {
            va = getCorrelatedEntry(a);
            vb = getCorrelatedEntry(b);
        } else if (sortKey === 'liqPx') {
            va = a.liquidationPx > 0 ? getCorrelatedPrice(a, a.liquidationPx) : 0;
            vb = b.liquidationPx > 0 ? getCorrelatedPrice(b, b.liquidationPx) : 0;
        } else {
            va = a[sortKey] ?? 0;
            vb = b[sortKey] ?? 0;
        }
        return sortDir * (vb - va);
    });

    displayedRows = rows;
    renderCharts(); // Update chart with filtered rows
    const tbody = document.getElementById('tableBody');

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" class="empty-cell"><div class="empty-icon">🔍</div><div>No positions match the current filters.</div></td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((r, i) => {
        const side = r.side;
        const pnlClass = r.unrealizedPnl >= 0 ? 'green' : 'red';
        const fundClass = r.funding >= 0 ? 'green' : 'red';

        // Leverage label
        const levType = r.leverageType === 'isolated' ? 'Isolated' : 'Cross';
        const levLabel = `${r.leverageValue}x ${levType}`;

        // Liquidation Price (Correlated)
        const liqPrice = r.liquidationPx > 0 ? getCorrelatedPrice(r, r.liquidationPx) : 0;
        let liqPriceFormatted = '—';
        if (r.liquidationPx > 0) {
            const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
            const sym = showSymbols ? entMeta.symbol : '';
            liqPriceFormatted = sym + liqPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // Distance to liq
        let distHtml = '<span class="muted">—</span>';
        if (r.distPct !== null) {
            const pct = r.distPct;
            const barClass = pct > 30 ? 'safe' : pct > 10 ? 'warn' : 'danger';
            const barW = Math.min(pct, 100).toFixed(0);
            const liqStr = r.liquidationPx > 0 ? (showSymbols ? '$' : '') + r.liquidationPx.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
            distHtml = `
            <div class="liq-cell">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                    <span class="liq-pct ${barClass === 'safe' ? 'green' : barClass === 'warn' ? '' : 'red'}" style="${barClass === 'warn' ? 'color:var(--orange)' : ''}">${pct.toFixed(0)}%</span>
                    <span class="liq-price">${liqStr}</span>
                </div>
                <div class="liq-bar-wrap"><div class="liq-bar ${barClass}" style="width:${barW}%"></div></div>
            </div>`;
        }

        // Size display: show absolute value + coin
        const absSzi = Math.abs(r.szi);
        const sziStr = absSzi >= 1 ? absSzi.toFixed(4) : absSzi.toFixed(6);

        const ccyVal = convertToActiveCcy(r.positionValue);
        const ccyStr = fmtCcy(ccyVal);

        const entVal = getCorrelatedEntry(r);
        let entStr = '';
        const entMeta = CURRENCY_META[activeEntryCurrency] || CURRENCY_META.USD;
        const sym = showSymbols ? entMeta.symbol : '';
        entStr = sym + entVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const usdSym = showSymbols ? '$' : '';

        // Cell Renderers Map
        const cells = {
            'col-num': `<td class="muted col-num" style="font-size:11px">${i + 1}</td>`,
            'col-address': `<td class="col-address">
                <div class="addr-cell">
                    <div class="addr-avatar">${(r.displayName || r.address).slice(0, 2).toUpperCase()}</div>
                    <div>
                        <a class="addr-link" href="https://app.hyperliquid.xyz/explorer/address/${r.address}" target="_blank">
                            <div class="addr-text">${fmtAddr(r.address)}${r.displayName ? ' ★' : ''}</div>
                        </a>
                        ${r.displayName ? `<div class="addr-name">${r.displayName}</div>` : ''}
                    </div>
                </div>
            </td>`,
            'col-coin': `<td class="col-coin">
                <span class="coin-badge ${side}">${r.coin} ${side === 'long' ? '▲' : '▼'}</span>
            </td>`,
            'col-szi': `<td class="mono col-szi">${sziStr}</td>`,
            'col-leverage': `<td class="col-leverage"><span class="lev-badge">${levLabel}</span></td>`,
            'col-positionValue': `<td class="mono col-positionValue">${usdSym}${fmt(r.positionValue)}</td>`,
            'col-valueCcy': `<td class="mono col-valueCcy" style="color:var(--gold);font-weight:600">${ccyStr}</td>`,
            'col-entryPx': `<td class="mono col-entryPx">${r.entryPx.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>`,
            'col-entryCcy': `<td class="mono col-entryCcy" style="color:var(--gold);font-weight:600">${entStr}</td>`,
            'col-unrealizedPnl': `<td class="mono col-unrealizedPnl ${pnlClass}" style="font-weight:600">${fmtUSD(r.unrealizedPnl)}</td>`,
            'col-funding': `<td class="mono col-funding ${fundClass}">${fmtUSD(r.funding)}</td>`,
            'col-liqPx': `<td class="mono col-liqPx" style="color:var(--orange);font-weight:600">${liqPriceFormatted}</td>`,
            'col-distToLiq': `<td class="col-distToLiq">${distHtml}</td>`,
            'col-accountValue': `<td class="mono col-accountValue">${usdSym}${fmt(r.accountValue)}</td>`
        };

        return `<tr>
            ${columnOrder.map(key => cells[key]).join('')}
        </tr>`;
    }).join('');
}

// ── Quotes Panel & Real-time Prices ──────────────────────────────────

function setPriceMode(el) {
    document.querySelectorAll('#priceModeToggle .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    priceMode = el.dataset.mode;
    saveSettings();
    renderQuotesPanel();
}

function updatePriceModeUI() {
    const tabs = document.querySelectorAll('#priceModeToggle .tab');
    tabs.forEach(t => {
        if (t.dataset.mode === priceMode) t.classList.add('active');
        else t.classList.remove('active');
    });
}

async function renderQuotesPanel() {
    const panel = document.getElementById('quotes-panel');
    if (selectedCoins.length === 0) {
        panel.style.display = 'none';
        stopPriceTicker();
        return;
    }

    panel.style.display = 'flex';

    // Initial render with current state
    updateQuotesHTML();

    // Start ticker if in realtime mode
    if (priceMode === 'realtime') {
        startPriceTicker();
    } else {
        stopPriceTicker();
        // Fetch daily closes if missing
        for (const coin of selectedCoins) {
            if (dailyCloseCache[coin] === undefined) {
                await fetchDailyClose(coin);
                updateQuotesHTML();
            }
        }
    }
}

function updateQuotesHTML() {
    const panel = document.getElementById('quotes-panel');
    if (selectedCoins.length === 0) return;

    panel.innerHTML = selectedCoins.map(coin => {
        const price = priceMode === 'realtime'
            ? parseFloat(currentPrices[coin] || 0)
            : (dailyCloseCache[coin] || 0);

        const sym = showSymbols ? '$' : '';
        const priceStr = price > 0 ? sym + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : 'Loading…';
        const label = priceMode === 'realtime' ? 'Mark Price' : 'Daily Close';

        return `
            <div class="quote-card neutral">
                <button class="quote-remove" onclick="removeCoin('${coin}')">✕</button>
                <div class="quote-coin">${coin}</div>
                <div class="quote-price" id="quote-price-${coin}">${priceStr}</div>
                <div class="quote-label">${label}</div>
            </div>
        `;
    }).join('');
}

function startPriceTicker() {
    if (priceTicker) return;
    priceTicker = setInterval(async () => {
        await fetchAllMids();
        if (priceMode === 'realtime') {
            selectedCoins.forEach(coin => {
                const el = document.getElementById(`quote-price-${coin}`);
                if (el) {
                    const price = parseFloat(currentPrices[coin] || 0);
                    const oldStr = el.innerText.replace('$', '').replace(/,/g, '');
                    const oldPrice = parseFloat(oldStr);
                    el.innerText = '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

                    // Add flash effect
                    if (price > oldPrice) {
                        el.classList.add('flash-up');
                        setTimeout(() => el.classList.remove('flash-up'), 500);
                    } else if (price < oldPrice) {
                        el.classList.add('flash-down');
                        setTimeout(() => el.classList.remove('flash-down'), 500);
                    }
                }
            });
            renderTable(); // Update correlated entries and other price-dependent fields
        }
    }, 3000);
}

function stopPriceTicker() {
    if (priceTicker) {
        clearInterval(priceTicker);
        priceTicker = null;
    }
}

function removeCoin(coin) {
    const idx = selectedCoins.indexOf(coin);
    if (idx > -1) {
        selectedCoins.splice(idx, 1);
        updateCoinSearchLabel();
        renderCoinDropdown(document.getElementById('coinSearch').value);
        renderTable();
        renderQuotesPanel();
        fetchMarketCapRanking(); // Update ranking panel selection state
        saveSettings();
    }
}

async function fetchDailyClose(coin) {
    try {
        const endTime = Date.now();
        const startTime = endTime - 48 * 60 * 60 * 1000; // Last 48h to be safe
        const resp = await fetch(INFO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'candleSnapshot',
                req: {
                    coin: coin,
                    interval: '1d',
                    startTime: startTime,
                    endTime: endTime
                }
            })
        });
        const candles = await resp.json();
        if (candles && Array.isArray(candles) && candles.length > 0) {
            // Hyperliquid returns [t, o, h, l, c, v] or objects depending on wrapper
            // Standard info candleSnapshot is an array of objects: {t, T, s, i, o, c, h, l, v, n}
            // We want the most recent "closed" candle.
            // If length is 1, it's the current open candle.
            // If length > 1, the one before last is definitely closed.
            const target = candles.length > 1 ? candles[candles.length - 2] : candles[candles.length - 1];
            if (target && target.c) {
                dailyCloseCache[coin] = parseFloat(target.c);
            }
        }
    } catch (e) {
        console.warn(`Failed to fetch daily close for ${coin}`, e);
        dailyCloseCache[coin] = 0;
    }
}

// ── Chart Resizing ──

let isChartResizing = false;
let startChartY = 0;
let startChartH = 0;

function startChartResize(e) {
    isChartResizing = true;
    startChartY = e.clientY;
    const section = document.getElementById('chart-section');
    startChartH = section.offsetHeight;
    
    document.addEventListener('mousemove', chartResize);
    document.addEventListener('mouseup', stopChartResize);
    
    // Add active class for visual feedback
    const resizer = document.querySelector('.chart-resizer');
    if (resizer) resizer.classList.add('active');
    
    document.body.style.cursor = 'ns-resize';
    e.preventDefault(); // prevent text selection
}

function chartResize(e) {
    if (!isChartResizing) return;
    const dy = e.clientY - startChartY;
    const newH = Math.max(200, startChartH + dy); // min 200px
    const section = document.getElementById('chart-section');
    section.style.height = newH + 'px';
    chartHeight = newH; // Update global state
    
    // Resize chart instance if needed (Chart.js usually handles this with responsive: true, but explicit update helps)
    if (scatterChart) scatterChart.resize();
}

function stopChartResize() {
    isChartResizing = false;
    document.removeEventListener('mousemove', chartResize);
    document.removeEventListener('mouseup', stopChartResize);
    
    const resizer = document.querySelector('.chart-resizer');
    if (resizer) resizer.classList.remove('active');
    
    document.body.style.cursor = '';
    saveSettings(); // Save new height
}

// ── Liquidation Chart Resizing ──

let isLiqChartResizing = false;
let startLiqChartY = 0;
let startLiqChartH = 0;

function startLiqChartResize(e) {
    isLiqChartResizing = true;
    startLiqChartY = e.clientY;
    const section = document.getElementById('liq-chart-section');
    startLiqChartH = section.offsetHeight;
    
    document.addEventListener('mousemove', liqChartResize);
    document.addEventListener('mouseup', stopLiqChartResize);
    
    // Add active class for visual feedback
    const resizer = document.querySelector('#liq-chart-section .chart-resizer');
    if (resizer) resizer.classList.add('active');
    
    document.body.style.cursor = 'ns-resize';
    e.preventDefault(); // prevent text selection
}

function liqChartResize(e) {
    if (!isLiqChartResizing) return;
    const dy = e.clientY - startLiqChartY;
    const newH = Math.max(200, startLiqChartH + dy); // min 200px
    const section = document.getElementById('liq-chart-section');
    section.style.height = newH + 'px';
    liqChartHeight = newH; // Update global state
    
    // Resize chart instance if needed
    if (liqChartInstance) liqChartInstance.resize();
}

function stopLiqChartResize() {
    isLiqChartResizing = false;
    document.removeEventListener('mousemove', liqChartResize);
    document.removeEventListener('mouseup', stopLiqChartResize);
    
    const resizer = document.querySelector('#liq-chart-section .chart-resizer');
    if (resizer) resizer.classList.remove('active');
    
    document.body.style.cursor = '';
    saveSettings(); // Save new height
}

// ── Column Resizing ──────────────────────────────────────────────────

function startResizing(e, resizer) {
    e.preventDefault();
    e.stopPropagation();

    const th = resizer.parentElement;
    const startX = e.pageX;
    const startWidth = th.offsetWidth;

    document.body.classList.add('resizing');

    const onMouseMove = (e) => {
        const width = startWidth + (e.pageX - startX);
        if (width > 30) {
            th.style.width = width + 'px';
            columnWidths[th.id] = width;
        }
    };

    const onMouseUp = () => {
        document.body.classList.remove('resizing');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        saveSettings();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

function applyColumnWidths() {
    for (const id in columnWidths) {
        const th = document.getElementById(id);
        if (th) {
            th.style.width = columnWidths[id] + 'px';
        }
    }
}

// ── Market Cap Ranking ───────────────────────────────────────────────

function updateRankingLimit() {
    const val = parseInt(document.getElementById('rankingLimit').value);
    if (!isNaN(val) && val > 0) {
        rankingLimit = val;
        saveSettings();
        fetchMarketCapRanking(true);
    }
}

async function fetchMarketCapRanking(force = false) {
    const panel = document.getElementById('ranking-panel');
    if (!panel) return;

    try {
        if (force || marketCapData.length === 0) {
            const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${rankingLimit}&page=1&sparkline=false&price_change_percentage=24h`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('CoinGecko API error');
            marketCapData = await resp.json();
        }

        panel.innerHTML = marketCapData.map(coin => {
            const sym = coin.symbol.toUpperCase();
            const isSel = selectedCoins.includes(sym);
            const mcap = coin.market_cap >= 1e9
                ? (coin.market_cap / 1e9).toFixed(2) + 'B'
                : (coin.market_cap / 1e6).toFixed(1) + 'M';

            const change = coin.price_change_percentage_24h || 0;
            const changeClass = change >= 0 ? 'up' : 'down';
            const changeSign = change >= 0 ? '+' : '';

            return `
                <div class="ranking-card${isSel ? ' selected' : ''}" onclick="selectCoin('${sym}', '${sym}')">
                    <div class="ranking-rank">#${coin.market_cap_rank}</div>
                    <div class="ranking-coin">${sym}</div>
                    <div class="ranking-mcap">$${mcap}</div>
                    <div class="ranking-change ${changeClass}">${changeSign}${change.toFixed(2)}%</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.warn('Market Cap fetch failed', e);
        if (marketCapData.length === 0) {
            panel.innerHTML = `<div style="padding:10px; font-size:11px; color:var(--muted)">Ranking unavailable (Rate limited)</div>`;
        }
    }
}

// ── Column Visibility ───────────────────────────────────────────────

function openColumnCombobox() {
    Object.keys(CB_OPTIONS).forEach(id => cbClose(id));
    const cb = document.getElementById('columnCombobox');
    if (!cb) return;
    cb.classList.add('open');
    renderColumnDropdown();
}

function closeColumnComboboxDelayed() {
    _columnCloseTimer = setTimeout(() => {
        const cb = document.getElementById('columnCombobox');
        if (cb) cb.classList.remove('open');
    }, 180);
}

function renderColumnDropdown() {
    const dd = document.getElementById('columnDropdown');
    if (!dd) return;

    let html = COLUMN_DEFS.map(c => {
        const isSel = visibleColumns.includes(c.key);
        return `<div class="combobox-item${isSel ? ' selected' : ''}" onmousedown="event.preventDefault(); toggleColumn('${c.key}')">` +
            `<span class="item-label">${c.label}</span>${isSel ? '<span class="item-remove">✓</span>' : ''}</div>`;
    }).join('');

    // Add "Select All" / "Deselect All" options
    html += `<div class="combobox-separator"></div>`;
    html += `<div class="combobox-item" onmousedown="event.preventDefault(); toggleAllColumns(true)">Show All</div>`;
    html += `<div class="combobox-item" onmousedown="event.preventDefault(); toggleAllColumns(false)">Hide All</div>`;

    dd.innerHTML = html;
}

function toggleColumn(key) {
    if (_columnCloseTimer) { clearTimeout(_columnCloseTimer); _columnCloseTimer = null; }
    
    const idx = visibleColumns.indexOf(key);
    if (idx > -1) {
        if (visibleColumns.length > 1) { // Prevent hiding all columns one by one
            visibleColumns.splice(idx, 1);
        }
    } else {
        visibleColumns.push(key);
    }
    
    applyColumnVisibility();
    updateColumnSelectDisplay();
    renderColumnDropdown();
    saveSettings();
}

function toggleAllColumns(show) {
    if (_columnCloseTimer) { clearTimeout(_columnCloseTimer); _columnCloseTimer = null; }
    
    if (show) {
        visibleColumns = COLUMN_DEFS.map(c => c.key);
    } else {
        // Keep at least one column (e.g. Address or Coin) to avoid empty table issues?
        // Let's just keep Coin and Address
        visibleColumns = ['col-coin', 'col-address'];
    }
    
    applyColumnVisibility();
    updateColumnSelectDisplay();
    renderColumnDropdown();
    saveSettings();
}

function updateColumnSelectDisplay() {
    const search = document.getElementById('columnSelectDisplay');
    if (!search) return;
    
    if (visibleColumns.length === COLUMN_DEFS.length) {
        search.value = 'All Columns';
    } else {
        search.value = `${visibleColumns.length} Visible`;
    }
}

function applyColumnVisibility() {
    let style = document.getElementById('col-visibility-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'col-visibility-style';
        document.head.appendChild(style);
    }
    
    // Find hidden columns
    const hidden = COLUMN_DEFS.filter(c => !visibleColumns.includes(c.key));
    
    if (hidden.length === 0) {
        style.textContent = '';
        return;
    }
    
    const css = hidden.map(c => `.${c.key} { display: none !important; }`).join('\n');
    style.textContent = css;
}

// Initialize
init();

function resetChartZoom() {
    if (scatterChart) {
        scatterChart.resetZoom();
        scatterChart.isZoomed = false;
        savedScatterState = null;
        saveSettings();
        const btn = document.getElementById('resetZoomBtn');
        if (btn) btn.style.display = 'none';
    }
}

function resetLiqChartZoom() {
    if (liqChartInstance) {
        liqChartInstance.resetZoom();
        liqChartInstance.isZoomed = false;
        savedLiqState = null;
        saveSettings();
        const btn = document.getElementById('resetLiqZoomBtn');
        if (btn) btn.style.display = 'none';
    }
}

// ── Chart Scale Resizing ──
function enableChartScaleResizing(canvasId, getChartInstance, resetBtnId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    let isDragging = false;
    let dragAxis = null;
    let startPos = 0;
    let initialMin = 0;
    let initialMax = 0;

    canvas.addEventListener('mousedown', (e) => {
        const chart = getChartInstance();
        if (!chart) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const { left, right, top, bottom } = chart.chartArea;
        
        // Y Axis (Left)
        if (x < left && y >= top && y <= bottom) {
            isDragging = true;
            dragAxis = 'y';
            startPos = y;
            initialMin = chart.scales.y.min;
            initialMax = chart.scales.y.max;
            e.preventDefault();
        }
        // X Axis (Bottom)
        else if (y > bottom && x >= left && x <= right) {
            isDragging = true;
            dragAxis = 'x';
            startPos = x;
            initialMin = chart.scales.x.min;
            initialMax = chart.scales.x.max;
            e.preventDefault();
        }

        if (isDragging) {
            chart.isZoomed = true;
            if (resetBtnId) {
                const btn = document.getElementById(resetBtnId);
                if (btn) btn.style.display = 'block';
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || !dragAxis) return;
        const chart = getChartInstance();
        if (!chart) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scale = chart.scales[dragAxis];
        const isLog = scale.type === 'logarithmic';
        const sensitivity = 2.0;

        if (dragAxis === 'y') {
            const delta = y - startPos; // Drag down > 0
            const height = chart.chartArea.bottom - chart.chartArea.top;
            const factor = (delta / height) * sensitivity;

            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const logRange = logMax - logMin;
                
                const newLogRange = logRange * (1 + factor);
                const logCenter = (logMax + logMin) / 2;
                
                const newLogMin = logCenter - newLogRange / 2;
                const newLogMax = logCenter + newLogRange / 2;
                
                chart.options.scales.y.min = Math.exp(newLogMin);
                chart.options.scales.y.max = Math.exp(newLogMax);
            } else {
                const range = initialMax - initialMin;
                const newRange = range * (1 + factor);
                const center = (initialMax + initialMin) / 2;
                
                chart.options.scales.y.min = center - newRange / 2;
                chart.options.scales.y.max = center + newRange / 2;
            }
        } else if (dragAxis === 'x') {
            const delta = x - startPos; // Drag right > 0
            const width = chart.chartArea.right - chart.chartArea.left;
            // Drag Right -> Zoom In -> Negative factor
            const factor = -(delta / width) * sensitivity;
            
            if (isLog) {
                if (initialMin <= 0) initialMin = 0.0001;
                const logMin = Math.log(initialMin);
                const logMax = Math.log(initialMax);
                const logRange = logMax - logMin;
                
                const newLogRange = logRange * (1 + factor);
                const logCenter = (logMax + logMin) / 2;
                
                const newLogMin = logCenter - newLogRange / 2;
                const newLogMax = logCenter + newLogRange / 2;
                
                chart.options.scales.x.min = Math.exp(newLogMin);
                chart.options.scales.x.max = Math.exp(newLogMax);
            } else {
                const range = initialMax - initialMin;
                const newRange = range * (1 + factor);
                const center = (initialMax + initialMin) / 2;
                
                chart.options.scales.x.min = center - newRange / 2;
                chart.options.scales.x.max = center + newRange / 2;
            }
        }

        chart.update('none');
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragAxis = null;
            const chart = getChartInstance();
            if (chart) {
                chart.isZoomed = true;
                saveSettings();
            }
        }
    });
}

// Enable resizing for both charts
enableChartScaleResizing('scatterChart', () => scatterChart, 'resetZoomBtn');
enableChartScaleResizing('liqChart', () => liqChartInstance, 'resetLiqZoomBtn');
