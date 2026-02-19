// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Leaderboard API
// ═══════════════════════════════════════════════════════════

import { LEADERBOARD_URL } from '../config.js';
import { 
    setAllRows, setLoadedCount, setScanning, setIsPaused, setWhaleList,
    getScanning, getIsPaused, getMaxConcurrency, getFxReady, getFxRates, getActiveCurrency
} from '../state.js';
import { streamPositions } from './hyperliquid.js';

export async function startScan(callbacks) {
    const { setStatus, setProgress, fetchAllMids, updateStats, updateCoinFilter, renderTable, saveTableData, finishScan, setLastSaveTime, setRenderPending } = callbacks;
    const minVal = parseFloat(document.getElementById('minValue').value) || 2500000;
    document.getElementById('scanBtn').disabled = true;
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').textContent = '⏸ Pause';
    setIsPaused(false);
    document.getElementById('tableBody').innerHTML = `<tr><td colspan="13" class="empty-cell"><span class="spinner"></span> Fetching leaderboard…</td></tr>`;
    setAllRows([]);
    setLoadedCount(0);

    setStatus('Fetching leaderboard…', 'scanning');
    setProgress(5);

    try {
        // Refresh prices before scanning to ensure accuracy
        await fetchAllMids();

        const lbResp = await fetch(LEADERBOARD_URL);
        if (!lbResp.ok) throw new Error(`Leaderboard HTTP ${lbResp.status}`);
        const lbData = await lbResp.json();
        const rows = lbData.leaderboardRows || [];

        // Filter whales by account value with validation
        const whaleList = rows
            .filter(r => {
                const accountValue = parseFloat(r.accountValue);
                if (accountValue < minVal) return false;
                
                // Filter out suspicious entries
                if (accountValue > 1_000_000_000 && !r.displayName) {
                    console.warn(`Filtering suspicious whale: ${r.ethAddress} with $${(accountValue/1_000_000_000).toFixed(1)}B and no display name`);
                    return false;
                }
                
                return true;
            })
            .sort((a, b) => parseFloat(b.accountValue) - parseFloat(a.accountValue));
        setWhaleList(whaleList);

        setProgress(15);
        const fxRates = getFxRates();
        const activeCurrency = getActiveCurrency();
        const fxReady = getFxReady();
        const fxStatus = fxReady ? `FX: 1 USD = ${(fxRates[activeCurrency] ?? 1).toFixed(2)} ${activeCurrency}` : '';
        setStatus(`Found ${whaleList.length} whales. Loading positions… ${fxStatus}`, 'scanning');

        // Start the concurrency-limited streaming loader
        setScanning(true);
        const maxConcurrency = getMaxConcurrency();
        await streamPositions(whaleList, minVal, maxConcurrency, callbacks);

    } catch (e) {
        console.error(e);
        document.getElementById('tableBody').innerHTML = `<tr><td colspan="13" class="empty-cell" style="color:var(--red)">Error: ${e.message}</td></tr>`;
        setStatus('Error', 'error');
        document.getElementById('scanBtn').disabled = false;
    }
}

export function stopScan(setStatus) {
    setScanning(false);
    setIsPaused(false);
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    setStatus('Stopping…', 'scanning');
}

export function togglePause(setStatus) {
    const isPaused = getIsPaused();
    setIsPaused(!isPaused);
    const btn = document.getElementById('pauseBtn');
    btn.textContent = !isPaused ? '▶ Continue' : '⏸ Pause';
    setStatus(!isPaused ? 'Paused' : 'Resuming...', 'scanning');
}

export function finishScan(setStatus, setProgress) {
    setProgress(100);
    const scanning = getScanning();
    const stoppedEarly = !scanning;
    const label = stoppedEarly ? '⏹ Stopped' : '✓ Done';
    setStatus(label, 'done');
    document.getElementById('scanBtn').disabled = false;
    setTimeout(() => setProgress(0), 1500);
}
