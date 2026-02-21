import { INFO_URL, RETRY_DELAY_MS } from '../config.js';
import {
    setAllRows, getAllRows, setLoadedCount, setScanning, getCurrentPrices, getScanning,
    getIsPaused, getRenderPending, getLastSaveTime, getLastSeenAccountValues, setLastSeenAccountValues
} from '../state.js';

// ── Rate Limiter ──────────────────────────────────────────────────────
class RateLimiter {
    constructor(requestsPerSecond) {
        this.delay = 1000 / requestsPerSecond;
        this.lastCall = 0;
    }

    async acquire() {
        const now = Date.now();
        const nextCall = Math.max(now, this.lastCall + this.delay);
        const waitTime = nextCall - now;
        this.lastCall = nextCall;
        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }
    }
}

const apiRateLimiter = new RateLimiter(9.5); // Stay safe under 10 req/s

// ── Concurrency-limited streaming loader ──────────────────────────────
// Fires MAX_CONCURRENCY requests at a time. As each resolves, the next
// whale is immediately dispatched — keeping the pipeline full without
// ever exceeding the rate limit. Retries on 429 with exponential backoff.

export async function fetchWithRetry(whale, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            await apiRateLimiter.acquire();
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

export function processState(whale, state, allRows) {
    if (!state) return;
    const currentPrices = getCurrentPrices();
    const positions = (state.assetPositions || []).filter(p => {
        const size = parseFloat(p.position.szi);
        if (size === 0) return false;

        // Validate position data integrity
        const pos = p.position;
        if (pos.entryPx === null || pos.entryPx === undefined) {
            console.warn(`Invalid entry price for ${whale.ethAddress} in ${pos.coin}`);
            return false;
        }

        return true;
    });

    // Check for account value consistency
    let accountValue = parseFloat(whale.accountValue);
    if (state.marginSummary && state.marginSummary.accountValue) {
        const chAccountValue = parseFloat(state.marginSummary.accountValue);
        const diff = Math.abs(accountValue - chAccountValue);
        const pctDiff = accountValue > 0 ? (diff / accountValue) * 100 : 0;

        // If significant difference, use clearinghouse value
        if (pctDiff > 20) {
            console.warn(`Account value mismatch for ${whale.ethAddress}: LB $${accountValue.toLocaleString()} vs CH $${chAccountValue.toLocaleString()} (${pctDiff.toFixed(1)}% diff)`);
            accountValue = chAccountValue;
        }
    }

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
            accountValue: accountValue, // Use validated account value
            windowPerformances: whale.windowPerformances, // Store directly to save space
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

export async function streamPositions(whaleList, minVal, maxConcurrency, callbacks) {
    const { updateStats, updateCoinFilter, renderTable, saveTableData, setStatus, setProgress, finishScan, setLastSaveTime, setRenderPending } = callbacks;
    const lastSaveTime = getLastSaveTime();
    let localLastSaveTime = lastSaveTime;
    const allRows = getAllRows();
    const lastSeenAccountValues = getLastSeenAccountValues();
    const newSeenAccountValues = { ...lastSeenAccountValues };

    document.getElementById('autoLoading').style.display = 'block';
    document.getElementById('stopBtn').style.display = 'inline-block';
    const queue = [...whaleList];
    let active = 0;
    let done = 0;
    const total = queue.length;

    // Track skipped whales for Delta Scanning
    let skippedCount = 0;

    function processWhale(whale) {
        // Delta Scanning: check if account value changed
        const currentVal = parseFloat(whale.accountValue);
        const lastVal = lastSeenAccountValues[whale.ethAddress];

        // Only skip if we already have rows for this address (to be safe)
        const hasData = allRows.some(r => r.address === whale.ethAddress);

        if (lastVal && Math.abs(currentVal - lastVal) < 0.01 && hasData) {
            skippedCount++;
            done++;
            setLoadedCount(done);
            const pct = 15 + (done / total) * 80;
            setProgress(Math.min(pct, 95));
            return Promise.resolve(null);
        }

        return fetchWithRetry(whale).then(state => {
            if (state) {
                // Remove old rows for this address before adding new ones
                const rowsBefore = allRows.length;
                for (let i = allRows.length - 1; i >= 0; i--) {
                    if (allRows[i].address === whale.ethAddress) {
                        allRows.splice(i, 1);
                    }
                }
                processState(whale, state, allRows);
                newSeenAccountValues[whale.ethAddress] = currentVal;
            }
            done++;
            setLoadedCount(done);
            const pct = 15 + (done / total) * 80;
            setProgress(Math.min(pct, 95));
            return state;
        });
    }

    function scheduleRender() {
        if (getRenderPending()) return;
        setRenderPending(true);

        // Use longer debounce during scanning to reduce render frequency
        const renderDelay = getScanning() ? 1000 : 400;

        setTimeout(() => {
            setRenderPending(false);
            updateStats(false, allRows);
            updateCoinFilter(allRows);
            renderTable();

            // Periodic save to handle mid-scan refreshes
            const now = Date.now();
            if (now - localLastSaveTime > 2000) {
                saveTableData();
                setLastSaveTime(now);
                localLastSaveTime = now;
            }
        }, renderDelay);
    }

    await new Promise(resolve => {
        async function dispatch() {
            // Stop if user requested
            if (!getScanning()) {
                if (active === 0) resolve();
                return;
            }
            // Fill up to maxConcurrency slots
            while (getScanning() && active < maxConcurrency && queue.length > 0) {
                const whale = queue.shift();
                active++;

                // If paused, wait before fetching
                while (getScanning() && getIsPaused()) {
                    await new Promise(r => setTimeout(r, 500));
                }

                processWhale(whale).then(state => {
                    active--;
                    const statusMsg = skippedCount > 0
                        ? `Loading ${done}/${total} whales… (Skipped ${skippedCount} unchanged)`
                        : `Loading ${done}/${total} whales…`;
                    setStatus(statusMsg, 'scanning');
                    scheduleRender();
                    if (!getScanning()) {
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
    updateStats(false, allRows);
    updateCoinFilter(allRows);
    renderTable();
    saveTableData(); // Save final data
    setLastSeenAccountValues(newSeenAccountValues);
    finishScan(setStatus, setProgress);
}
