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

    if (ccy === 'BTC') {
        return sign + meta.symbol + abs.toFixed(abs >= 1 ? 4 : 8);
    }

    if (abs >= 1e9) return sign + meta.symbol + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + meta.symbol + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + meta.symbol + (abs / 1e3).toFixed(1) + 'K';
    return sign + meta.symbol + abs.toFixed(0);
}

function getCorrelatedEntry(row) {
    // Benchmark logic: ETH correlated to BTC, BTC correlated to ETH
    let benchmark = 'BTC';
    if (row.coin === 'BTC') benchmark = 'ETH';
    else if (row.coin !== 'ETH') return row.entryPx; // No benchmark for others

    const assetPrice = parseFloat(currentPrices[row.coin] || 0);
    const benchPrice = parseFloat(currentPrices[benchmark] || 0);

    if (assetPrice > 0 && benchPrice > 0) {
        // Result = EntryPx * (BenchPrice / AssetPrice)
        return row.entryPx * (benchPrice / assetPrice);
    }
    return row.entryPx;
}

function fmtPriceCcy(value, overrideCcy = null) {
    const ccy = overrideCcy || activeCurrency;
    const meta = CURRENCY_META[ccy] || CURRENCY_META.USD;
    const abs = Math.abs(value);
    const sign = value >= 0 ? '' : '-';

    if (ccy === 'BTC') {
        return sign + meta.symbol + abs.toFixed(8);
    }

    // For prices, we want more precision than total values
    if (abs >= 1) {
        return sign + meta.symbol + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    return sign + meta.symbol + abs.toFixed(6);
}

function onCurrencyChange() {
    activeCurrency = document.getElementById('currencySelect').value;
    activeEntryCurrency = document.getElementById('entryCurrencySelect').value;

    // Update column headers
    const thVal = document.getElementById('th-valueCcy');
    if (thVal) thVal.textContent = `Value (${activeCurrency}) ↕`;
    const thEntry = document.getElementById('th-entryCcy');
    if (thEntry) thEntry.textContent = `Entry Corr (USD) ↕`;

    renderTable();
}
// Rate limit: 1200 weight/min, clearinghouseState = weight 2 → max 600 req/min = 10 req/s
// We use 8 concurrent requests to stay safely under the limit.
const MAX_CONCURRENCY = 8;
const RETRY_DELAY_MS = 2000;  // wait 2s on 429 before retry
let currentPrices = {};   // coin -> mark price

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
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
    return sign + '$' + abs.toFixed(0);
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
function saveSettings() {
    const settings = {
        minValue: document.getElementById('minValue').value,
        coinFilter: document.getElementById('coinFilter').value,
        sideFilter: document.getElementById('sideFilter').value,
        minLev: document.getElementById('minLev').value,
        maxLev: document.getElementById('maxLev').value,
        minSize: document.getElementById('minSize').value,
        minFunding: document.getElementById('minFunding').value,
        levTypeFilter: document.getElementById('levTypeFilter').value,
        currencySelect: document.getElementById('currencySelect').value,
        entryCurrencySelect: document.getElementById('entryCurrencySelect').value,
        minValueCcy: document.getElementById('minValueCcy').value,
        maxValueCcy: document.getElementById('maxValueCcy').value,
        minEntryCcy: document.getElementById('minEntryCcy').value,
        maxEntryCcy: document.getElementById('maxEntryCcy').value,
        addressFilter: document.getElementById('addressFilter').value,
        selectedCoins: selectedCoins,
        activeWindow: activeWindow,
        sortKey: sortKey,
        sortDir: sortDir
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
        const s = JSON.parse(saved);
        if (s.minValue) document.getElementById('minValue').value = s.minValue;
        if (s.coinFilter) {
            document.getElementById('coinFilter').value = s.coinFilter;
            document.getElementById('coinSearch').value = s.coinFilter;
        }
        if (s.sideFilter) cbSetValue('sideFilter', s.sideFilter);
        if (s.minLev) document.getElementById('minLev').value = s.minLev;
        if (s.maxLev) document.getElementById('maxLev').value = s.maxLev;
        if (s.minSize) document.getElementById('minSize').value = s.minSize;
        if (s.minFunding) document.getElementById('minFunding').value = s.minFunding;
        if (s.levTypeFilter) cbSetValue('levTypeFilter', s.levTypeFilter);
        if (s.currencySelect) cbSetValue('currencySelect', s.currencySelect);
        if (s.entryCurrencySelect) cbSetValue('entryCurrencySelect', s.entryCurrencySelect);
        onCurrencyChange();
        if (s.minValueCcy) document.getElementById('minValueCcy').value = s.minValueCcy;
        if (s.maxValueCcy) document.getElementById('maxValueCcy').value = s.maxValueCcy;
        if (s.minEntryCcy) document.getElementById('minEntryCcy').value = s.minEntryCcy;
        if (s.maxEntryCcy) document.getElementById('maxEntryCcy').value = s.maxEntryCcy;
        if (s.addressFilter) document.getElementById('addressFilter').value = s.addressFilter;
        if (s.selectedCoins) {
            selectedCoins = s.selectedCoins;
            updateCoinSearchLabel();
        }
        if (s.activeWindow) {
            activeWindow = s.activeWindow;
            document.querySelectorAll('.tab').forEach(t => {
                t.classList.toggle('active', t.dataset.window === activeWindow);
            });
        }
        if (s.sortKey) sortKey = s.sortKey;
        if (s.sortDir) sortDir = s.sortDir;
    } catch (e) { console.warn('Failed to load settings', e); }
}

function sortBy(key) {
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = -1; }
    document.querySelectorAll('th[id^="th-"]').forEach(t => {
        t.classList.remove('sorted');
        t.textContent = t.textContent.replace(' ▲', '').replace(' ▼', '');
    });
    const th = document.getElementById('th-' + key);
    if (th) { th.classList.add('sorted'); th.textContent += sortDir === -1 ? ' ▼' : ' ▲'; }
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
function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    setTimeout(() => {
        renderPending = false;
        updateStats();
        updateCoinFilter();
        renderTable();
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
            // Fill up to MAX_CONCURRENCY slots
            while (scanning && active < MAX_CONCURRENCY && queue.length > 0) {
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
    document.getElementById('sCapital').textContent = '$' + fmt(totalCap);
    const upnlEl = document.getElementById('sUpnl');
    upnlEl.textContent = fmtUSD(totalUpnl);
    upnlEl.className = 'stat-value ' + (totalUpnl >= 0 ? 'green' : 'red');
    const largest = Math.max(...allRows.map(r => r.accountValue), 0);
    document.getElementById('sLargest').textContent = '$' + fmt(largest);
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
    if (!query) selectCoin('', '');
    renderCoinDropdown(query);
}

function renderCoinDropdown(query = '') {
    const dd = document.getElementById('coinDropdown');
    if (!dd) return;
    const q = query.trim().toUpperCase();
    const filtered = q ? _coinOptions.filter(c => c.toUpperCase().includes(q)) : _coinOptions;

    let html = `<div class="combobox-item all-item ${selectedCoins.length === 0 ? 'selected' : ''}" onmousedown="selectCoin('','')">All coins</div>`;
    if (filtered.length === 0) {
        html += `<div class="combobox-empty">No match</div>`;
    } else {
        html += filtered.map(c => {
            const isSel = selectedCoins.includes(c);
            return `<div class="combobox-item${isSel ? ' selected' : ''}" onmousedown="selectCoin('${c}','${c}')">` +
                `${isSel ? '✓ ' : ''}${c}</div>`;
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
    // Do not close the combobox for multi-select, unless it's a reset
    if (value === '') {
        const cb = document.getElementById('coinCombobox');
        if (cb) cb.classList.remove('open');
    }
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
    const minValueCcy = parseFloat(document.getElementById('minValueCcy').value);
    const maxValueCcy = parseFloat(document.getElementById('maxValueCcy').value);
    const minEntryCcy = parseFloat(document.getElementById('minEntryCcy').value);
    const maxEntryCcy = parseFloat(document.getElementById('maxEntryCcy').value);

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
        const ccyVal = convertToActiveCcy(r.positionValue, activeCurrency);
        if (!isNaN(minValueCcy) && ccyVal < minValueCcy) return false;
        if (!isNaN(maxValueCcy) && ccyVal > maxValueCcy) return false;

        const entryCcyVal = getCorrelatedEntry(r);
        if (!isNaN(minEntryCcy) && entryCcyVal < minEntryCcy) return false;
        if (!isNaN(maxEntryCcy) && entryCcyVal > maxEntryCcy) return false;

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
            const liqStr = r.liquidationPx > 0 ? '$' + r.liquidationPx.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
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
        <td class="mono">$${fmt(r.positionValue)}</td>
        <td class="mono" style="color:var(--gold);font-weight:600">${ccyStr}</td>
        <td class="mono">${r.entryPx.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
        <td class="mono" style="color:var(--gold);font-weight:600">${fmtPriceCcy(getCorrelatedEntry(r), 'USD')}</td>
        <td class="mono ${pnlClass}" style="font-weight:600">${fmtUSD(r.unrealizedPnl)}</td>
        <td class="mono ${fundClass}">${fmtUSD(r.funding)}</td>
        <td>${distHtml}</td>
        <td class="mono">$${fmt(r.accountValue)}</td>
    </tr>`;
    }).join('');
}

// Initialize
init();
