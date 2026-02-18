const INFO_URL = 'https://api.hyperliquid.xyz/info';
const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

// State
let whaleList = [];       // from leaderboard
let allRows = [];         // flat: one row per position
let displayedRows = [];   // after filters
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

function getCorrelatedEntry(row) {
    const targetCcy = activeEntryCurrency || 'USD';

    // 1. Calculate Base Correlated Price (The "Holy Grail" Logic)
    // Formula: Entry * (BTC_Price / Coin_Price)
    // This projects the entry price to the equivalent BTC price level.
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || 0);
    
    let correlatedVal = row.entryPx; // Default to raw entry if data missing
    
    if (row.coin !== 'BTC' && btcPrice > 0 && coinPrice > 0) {
        correlatedVal = row.entryPx * (btcPrice / coinPrice);
    } else if (row.coin === 'BTC') {
        correlatedVal = row.entryPx;
    }

    // 2. If target is USD, return the correlated value (which is in USD)
    if (targetCcy === 'USD') {
        return correlatedVal;
    }

    // 3. If target is BTC, user likely wants "Entry Price in BTC terms"
    // Since correlatedVal is "The BTC Price equivalent", converting it to BTC = 1 (useless).
    // So for BTC selection, we return the raw entry price converted to BTC.
    if (targetCcy === 'BTC') {
        if (btcPrice > 0) return row.entryPx / btcPrice;
        return 0;
    }

    // 4. If target is Fiat (BRL, EUR, etc), convert the Correlated USD Value to that Fiat
    const rate = fxRates[targetCcy] || 1;
    return correlatedVal * rate;
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
    const settings = {
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
        sortKey: sortKey,
        sortDir: sortDir,
        showSymbols: showSymbols,
        chartHeight: chartHeight
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
        const s = JSON.parse(saved);
        if (s.showSymbols !== undefined) {
            showSymbols = s.showSymbols;
            const btn = document.getElementById('btnShowSym');
            if (btn) {
                btn.textContent = showSymbols ? 'On' : 'Off';
                btn.classList.toggle('active', showSymbols);
            }
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
            if (section) section.style.height = chartHeight + 'px';
        }
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
            leverageValue: pos.leverage?.value || 1,
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

// ── Chart Logic ──
let scatterChart = null;

function renderScatterPlot() {
    const section = document.getElementById('chart-section');
    if (!section) return;

    if (!displayedRows || displayedRows.length === 0) {
        section.style.display = 'none';
        return;
    }

    const btcPrice = parseFloat(currentPrices['BTC'] || 0);

    // Find max volume for scaling
    const maxVol = Math.max(...displayedRows.map(r => {
        if (r.coin === 'BTC') return Math.abs(r.szi);
        if (btcPrice > 0) return r.positionValue / btcPrice;
        return 0;
    }), 0.0001); // Avoid div by zero

    const data = displayedRows.map(r => {
        let volBTC = 0;
        if (r.coin === 'BTC') {
            volBTC = Math.abs(r.szi);
        } else if (btcPrice > 0) {
            volBTC = r.positionValue / btcPrice;
        }

        const entryCorr = getCorrelatedEntry(r);

        // Scale radius: Min 3px, Max 20px
        // Using square root to make area proportional to volume (better visual perception)
        const radius = 3 + (Math.sqrt(volBTC) / Math.sqrt(maxVol)) * 17;

        return {
            x: entryCorr,
            y: volBTC,
            r: radius, // Chart.js bubble radius
            _raw: r    // Store raw data for tooltip
        };
    });

    if (data.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    const longs = data.filter(d => d._raw.side === 'long');
    const shorts = data.filter(d => d._raw.side === 'short');

    const canvas = document.getElementById('scatterChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const entryLabel = `Entry Price (${activeEntryCurrency || 'USD'})`;

    // Prepare annotation for current BTC price (or reference price)
    // If activeEntryCurrency is USD, we show BTC price in USD.
    // If activeEntryCurrency is BTC, we show 1.0.
    // If activeEntryCurrency is other, we convert BTC price to that currency.
    let refPrice = btcPrice;
    if (activeEntryCurrency === 'BTC') {
        refPrice = 1;
    } else if (activeEntryCurrency && activeEntryCurrency !== 'USD') {
        const rate = fxRates[activeEntryCurrency] || 1;
        refPrice = btcPrice * rate;
    }

    const currencyMeta = CURRENCY_META[activeEntryCurrency || 'USD'] || CURRENCY_META.USD;
    const sym = showSymbols ? currencyMeta.symbol : '';
    const priceStr = refPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const labelText = `BTC: ${sym}${priceStr}`;

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

    if (scatterChart) {
        scatterChart.data.datasets[0].data = longs;
        scatterChart.data.datasets[1].data = shorts;
        scatterChart.options.scales.x.title.text = entryLabel;
        scatterChart.options.plugins.annotation.annotations = annotations;
        
        // Update BTC Price Label data
        scatterChart.options.plugins.btcPriceLabel = { price: refPrice, text: labelText };

        // Ensure padding is updated for existing chart
        if (!scatterChart.options.layout) scatterChart.options.layout = {};
        if (!scatterChart.options.layout.padding) scatterChart.options.layout.padding = {};
        scatterChart.options.layout.padding.bottom = 40; 
        
        scatterChart.update();
    } else {
        Chart.defaults.color = '#9ca3af';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

        scatterChart = new Chart(ctx, {
            type: 'bubble', // Changed from 'scatter' to 'bubble' for explicit radius support
            data: {
                datasets: [
                    {
                        label: 'Longs',
                        data: longs,
                        backgroundColor: 'rgba(34, 197, 94, 0.6)', // Green with 0.6 opacity
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 1,
                        hoverBackgroundColor: 'rgba(34, 197, 94, 0.9)',
                        hoverBorderColor: '#fff',
                        hoverBorderWidth: 2
                    },
                    {
                        label: 'Shorts',
                        data: shorts,
                        backgroundColor: 'rgba(239, 68, 68, 0.6)', // Red with 0.6 opacity
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 1,
                        hoverBackgroundColor: 'rgba(239, 68, 68, 0.9)',
                        hoverBorderColor: '#fff',
                        hoverBorderWidth: 2
                    }
                ]
            },
            options: {
                layout: {
                    padding: {
                        bottom: 40
                    }
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
                    zoom: {
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'xy',
                        },
                        pan: {
                            enabled: true,
                            mode: 'xy',
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
                        // Allow auto positioning to avoid covering info
                        caretPadding: 30,
                        padding: 10,
                        backgroundColor: 'rgba(7, 12, 26, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        titleColor: '#fff',
                        bodyColor: '#e2e8f4',
                        callbacks: {
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
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: entryLabel, color: '#9ca3af' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
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
                        beginAtZero: true
                    }
                }
            },
            plugins: [{
                id: 'btcPriceLabel',
                afterDraw: (chart) => {
                    const opts = chart.options.plugins.btcPriceLabel;
                    if (!opts || !opts.text) return;
                    
                    const { ctx, chartArea: { bottom, left, right }, scales: { x } } = chart;
                    const xVal = x.getPixelForValue(opts.price);
                    
                    // Only draw if within chart horizontal bounds
                    if (xVal < left || xVal > right) return;
                    
                    const text = opts.text;
                    ctx.save();
                    ctx.font = 'bold 11px sans-serif';
                    const textWidth = ctx.measureText(text).width + 16;
                    const textHeight = 22;
                    const yPos = bottom + 25; // Position below axis ticks
                    
                    // Draw Label Background (pill shape)
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
                    ctx.beginPath();
                    const r = 4;
                    ctx.roundRect(xVal - textWidth / 2, yPos, textWidth, textHeight, r);
                    ctx.fill();
                    
                    // Small triangle pointer pointing up
                    ctx.beginPath();
                    ctx.moveTo(xVal, yPos);
                    ctx.lineTo(xVal - 5, yPos + 6);
                    ctx.lineTo(xVal + 5, yPos + 6);
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
                    ctx.fill();
                    
                    // Draw Text
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
                        
                        // Draw lines
                        ctx.beginPath();
                        ctx.lineWidth = options.width;
                        ctx.strokeStyle = options.color;
                        ctx.setLineDash(options.dash);
                        
                        ctx.moveTo(x, top);
                        ctx.lineTo(x, bottom);
                        ctx.moveTo(left, y);
                        ctx.lineTo(right, y);
                        ctx.stroke();

                        // Draw Labels
                        ctx.font = '11px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        // X-Axis Label
                        const xValue = xScale.getValueForPixel(x);
                        // Using toLocaleString for consistent formatting
                        const xLabel = xValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
                        const xLabelWidth = ctx.measureText(xLabel).width + 12;
                        const xLabelHeight = 20;
                        
                        // Draw X Label Background
                        ctx.fillStyle = 'rgba(7, 12, 26, 0.9)';
                        ctx.fillRect(x - xLabelWidth / 2, bottom, xLabelWidth, xLabelHeight);
                        
                        // Draw X Label Text
                        ctx.fillStyle = '#e2e8f4';
                        ctx.fillText(xLabel, x, bottom + 10);

                        // Y-Axis Label
                        const yValue = yScale.getValueForPixel(y);
                        const yLabel = yValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                        const yLabelWidth = ctx.measureText(yLabel).width + 12;
                        const yLabelHeight = 20;
                        
                        // Draw Y Label Background
                        ctx.fillStyle = 'rgba(7, 12, 26, 0.9)';
                        ctx.fillRect(left - yLabelWidth, y - yLabelHeight / 2, yLabelWidth, yLabelHeight);
                        
                        // Draw Y Label Text
                        ctx.textAlign = 'right';
                        ctx.fillStyle = '#e2e8f4';
                        ctx.fillText(yLabel, left - 6, y);

                        ctx.restore();
                    }
                }
            }]
        });
    }
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
        loadTableData(); // Load persisted data
        if (allRows.length > 0) {
            updateStats();
            updateCoinFilter();
            renderTable();
            setStatus(`Restored ${allRows.length} positions`, 'done');
        }

        fetchMarketCapRanking(true);
        setStatus('Ready', 'idle');
    } catch (e) {
        console.warn('Init failed', e);
        setStatus('Init error', 'error');
        loadSettings();
    }
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
        } else {
            va = a[sortKey] ?? 0;
            vb = b[sortKey] ?? 0;
        }
        return sortDir * (vb - va);
    });

    displayedRows = rows;
    renderScatterPlot(); // Update chart with filtered rows
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

        return `<tr>
        <td class="muted" style="font-size:11px">${i + 1}</td>
        <td>
            <div class="addr-cell">
                <div class="addr-avatar">${(r.displayName || r.address).slice(0, 2).toUpperCase()}</div>
                <div>
                    <a class="addr-link" href="https://app.hyperliquid.xyz/explorer/address/${r.address}" target="_blank">
                        <div class="addr-text">${fmtAddr(r.address)}${r.displayName ? ' ★' : ''}</div>
                    </a>
                    ${r.displayName ? `<div class="addr-name">${r.displayName}</div>` : ''}
                </div>
            </div>
        </td>
        <td>
            <span class="coin-badge ${side}">${r.coin} ${side === 'long' ? '▲' : '▼'}</span>
        </td>
        <td class="mono">${sziStr}</td>
        <td><span class="lev-badge">${levLabel}</span></td>
        <td class="mono">${usdSym}${fmt(r.positionValue)}</td>
        <td class="mono" style="color:var(--gold);font-weight:600">${ccyStr}</td>
        <td class="mono">${r.entryPx.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
        <td class="mono" style="color:var(--gold);font-weight:600">${entStr}</td>
        <td class="mono ${pnlClass}" style="font-weight:600">${fmtUSD(r.unrealizedPnl)}</td>
        <td class="mono ${fundClass}">${fmtUSD(r.funding)}</td>
        <td>${distHtml}</td>
        <td class="mono">${usdSym}${fmt(r.accountValue)}</td>
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
    e.target.classList.add('active');
    document.body.style.cursor = 'ns-resize';
    e.preventDefault(); // prevent text selection
}

function chartResize(e) {
    if (!isChartResizing) return;
    const dy = e.clientY - startChartY;
    const newH = Math.max(200, startChartH + dy); // min 200px
    const section = document.getElementById('chart-section');
    section.style.height = newH + 'px';
    
    // Resize chart instance if needed (Chart.js usually handles this with responsive: true, but explicit update helps)
    if (scatterChart) scatterChart.resize();
}

function stopChartResize() {
    isChartResizing = false;
    document.removeEventListener('mousemove', chartResize);
    document.removeEventListener('mouseup', stopChartResize);
    document.body.style.cursor = '';
    
    const resizers = document.querySelectorAll('.chart-resizer');
    resizers.forEach(r => r.classList.remove('active'));
    
    // Save new height
    const section = document.getElementById('chart-section');
    chartHeight = section.offsetHeight;
    saveSettings();
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

// Initialize
init();

function resetChartZoom() {
    if (scatterChart) {
        scatterChart.resetZoom();
    }
}
