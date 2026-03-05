const MAX_REASONABLE_PRICE = 10000000;
const MAX_ALLOWED_BANDS = 5000;
const MIN_VALID_COIN_PRICE = 0.0001;

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE CRITICAL: Object Pooling para bandas
// Evita criação excessiva de objetos em loops quentes (GC pressure)
// ═══════════════════════════════════════════════════════════════════════════════
const bandPool = [];
const setPool = [];
const MAX_POOL_SIZE = 1000; // Limitar tamanho do pool para evitar memory bloat

/**
 * Obtém uma banda do pool ou cria nova se pool estiver vazio
 * Reseta todas as propriedades antes de retornar
 * @param {number} bandKey - Chave da banda (faixaDe)
 * @param {number} bandSize - Tamanho da banda
 * @returns {Object} Banda pronta para uso
 */
function getBandFromPool(bandKey, bandSize) {
    let band = bandPool.pop();
    if (!band) {
        // Criar nova banda apenas se pool estiver vazio
        band = {
            faixaDe: 0, faixaAte: 0,
            qtdLong: 0, notionalLong: 0,
            qtdShort: 0, notionalShort: 0,
            sumLiqNotionalLong: 0, sumLiqNotionalShort: 0,
            liqVolLong: 0, liqVolShort: 0,
            ativosLong: null, ativosShort: null,
            whalesLong: null, whalesShort: null,
            positionsLong: [], positionsShort: [],
            isEmpty: false
        };
    }
    // Reset valores - reutilizar objeto existente evita alocação de memória
    band.faixaDe = bandKey;
    band.faixaAte = bandKey + bandSize;
    band.qtdLong = band.qtdShort = 0;
    band.notionalLong = band.notionalShort = 0;
    band.sumLiqNotionalLong = band.sumLiqNotionalShort = 0;
    band.liqVolLong = band.liqVolShort = 0;
    // Obter Sets do pool em vez de criar novos
    band.ativosLong = getSetFromPool();
    band.ativosShort = getSetFromPool();
    band.whalesLong = getSetFromPool();
    band.whalesShort = getSetFromPool();
    // Limpar arrays reutilizando memória alocada
    band.positionsLong.length = 0;
    band.positionsShort.length = 0;
    band.isEmpty = true;
    return band;
}

/**
 * Obtém um Set do pool ou cria novo se pool estiver vazio
 * @returns {Set} Set vazio pronto para uso
 */
function getSetFromPool() {
    const set = setPool.pop();
    if (set) {
        set.clear(); // Reutilizar - apenas limpar
        return set;
    }
    return new Set();
}

/**
 * Devolve banda ao pool para reutilização
 * Limpa Sets e libera referências para ajudar GC
 * @param {Object} band - Banda a ser reciclada
 */
function releaseBandToPool(band) {
    if (!band) return;
    // Devolver Sets ao pool para reutilização
    if (band.ativosLong) {
        band.ativosLong.clear();
        if (setPool.length < MAX_POOL_SIZE) setPool.push(band.ativosLong);
    }
    if (band.ativosShort) {
        band.ativosShort.clear();
        if (setPool.length < MAX_POOL_SIZE) setPool.push(band.ativosShort);
    }
    if (band.whalesLong) {
        band.whalesLong.clear();
        if (setPool.length < MAX_POOL_SIZE) setPool.push(band.whalesLong);
    }
    if (band.whalesShort) {
        band.whalesShort.clear();
        if (setPool.length < MAX_POOL_SIZE) setPool.push(band.whalesShort);
    }
    // Limpar referências para ajudar GC
    band.positionsLong.length = 0;
    band.positionsShort.length = 0;
    if (bandPool.length < MAX_POOL_SIZE) bandPool.push(band);
}

/**
 * Limpa o pool de bandas e Sets
 * Útil para forçar liberação de memória
 */
function clearPools() {
    bandPool.length = 0;
    setPool.length = 0;
}

// Helper: Convert USD value to active currency (BTC or Fiat)
function convertToActiveCcy(valUSD, overrideCcy = null, activeCurrency, fxRates, currentPrices) {
    const ccy = overrideCcy || activeCurrency;
    if (ccy === 'USD') return valUSD;
    if (ccy === 'BTC') {
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        return btcPrice > 0 ? valUSD / btcPrice : 0;
    }
    const rate = fxRates[ccy] || 1;
    return valUSD * rate;
}

// Helper: Calculate correlated price (BTC equivalent) and convert to target fiat if needed
function getCorrelatedPrice(row, rawPrice, activeEntryCurrency, currentPrices, fxRates) {
    const targetCcy = activeEntryCurrency || 'USD';
    const btcPrice = parseFloat(currentPrices['BTC'] || 0);
    const coinPrice = parseFloat(currentPrices[row.coin] || row.markPrice || 0);
    const isValidCoinPrice = coinPrice >= MIN_VALID_COIN_PRICE;
    let correlatedVal = rawPrice;
    if (row.coin !== 'BTC' && btcPrice > 0 && isValidCoinPrice) {
        correlatedVal = rawPrice * (btcPrice / coinPrice);
    }
    if (targetCcy === 'USD' || targetCcy === 'BTC') return correlatedVal;
    const rate = fxRates[targetCcy] || 1;
    return correlatedVal * rate;
}

function getCorrelatedEntry(row, activeEntryCurrency, currentPrices, fxRates) {
    return getCorrelatedPrice(row, row.entryPx, activeEntryCurrency, currentPrices, fxRates);
}

// PERFORMANCE: Process rows in async chunks to avoid blocking the worker thread
const CHUNK_SIZE = 1000;
async function processRowsInChunks(rows, currentPrices, fxRates, activeCurrency, activeEntryCurrency, btcPrice) {
    const result = new Array(rows.length);
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const end = Math.min(i + CHUNK_SIZE, rows.length);
        for (let j = i; j < end; j++) {
            const r = rows[j];
            const coinPrice = parseFloat(currentPrices[r.coin] || r.markPrice || 0);

            // PERFORMANCE: Avoid object spreading {...r}. Direct assignment is 3-5x faster.
            const newRow = Object.assign({}, r);

            if (!isNaN(coinPrice) && coinPrice > 0) {
                newRow.markPrice = coinPrice;
                const posVal = Math.abs(newRow.szi) * coinPrice;
                newRow.positionValue = posVal;
                if (newRow.leverageValue > 0) newRow.marginUsed = posVal / newRow.leverageValue;
                newRow.unrealizedPnl = (coinPrice - newRow.entryPx) * newRow.szi;
                newRow.distPct = newRow.liquidationPx > 0 ? Math.abs((coinPrice - newRow.liquidationPx) / coinPrice) * 100 : null;
                newRow._volBTC = btcPrice > 0 ? posVal / btcPrice : 0;
                newRow._sqrtPosVal = Math.sqrt(posVal);
            }
            newRow._valCcy = convertToActiveCcy(newRow.positionValue, null, activeCurrency, fxRates, currentPrices);
            newRow._entCcy = getCorrelatedEntry(newRow, activeEntryCurrency, currentPrices, fxRates);
            newRow._liqPxCcy = newRow.liquidationPx > 0 ? getCorrelatedPrice(newRow, newRow.liquidationPx, activeEntryCurrency, currentPrices, fxRates) : 0;

            result[j] = newRow;
        }
        if (i + CHUNK_SIZE < rows.length) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return result;
}

// Worker-side persistent logic
let cachedAllRows = null;
let cachedWhaleMeta = null;
let cachedUpdatedRows = null;
let lastPriceUpdateVersion = -1;

self.onmessage = async function (e) {
    const {
        id, // Correlation ID for callback matching
        allRows: incomingAllRows,
        whaleMeta: incomingWhaleMeta,
        filterState,
        sortState,
        currencyState,
        aggParams,
        priceUpdateVersion
    } = e.data;

    if (incomingAllRows) {
        // Ajuda GC marcando como null primeiro
        cachedAllRows = null;
        cachedUpdatedRows = null;
        cachedAllRows = incomingAllRows;
    }
    if (incomingWhaleMeta) cachedWhaleMeta = incomingWhaleMeta;
    if (!cachedAllRows) return;

    const { activeCurrency, activeEntryCurrency, currentPrices, fxRates } = currencyState;

    if (!cachedUpdatedRows || lastPriceUpdateVersion !== priceUpdateVersion || incomingAllRows) {
        const btcPrice = parseFloat(currentPrices['BTC'] || 0);
        cachedUpdatedRows = await processRowsInChunks(cachedAllRows, currentPrices, fxRates, activeCurrency, activeEntryCurrency, btcPrice);
        lastPriceUpdateVersion = priceUpdateVersion;
    }

    const { selectedCoins, addressFilter, sideFilter, minLev, maxLev, minSize, minFunding, levTypeFilter, minSzi, maxSzi, minValueCcy, maxValueCcy, minEntryCcy, maxEntryCcy, minUpnl, maxUpnl } = filterState;
    const addressFilterRegex = addressFilter ? new RegExp(addressFilter, 'i') : null;
    const selectedCoinSet = (selectedCoins && selectedCoins.length > 0) ? new Set(selectedCoins) : null;

    // 1. Filter
    let rows;
    // Pré-filtrar com substring match antes do regex
    if (addressFilterRegex) {
        const candidates = cachedUpdatedRows.filter(r =>
            r.address.includes(addressFilter) ||
            (cachedWhaleMeta[r.address]?.displayName || '').includes(addressFilter)
        );
        rows = candidates.filter(r => {
            const meta = cachedWhaleMeta[r.address];
            return addressFilterRegex.test(r.address) ||
                   addressFilterRegex.test(meta?.displayName || '');
        });
    } else {
        rows = cachedUpdatedRows;
    }

    rows = rows.filter(r => {
        if (selectedCoinSet && !selectedCoinSet.has(r.coin)) return false;
        if (sideFilter && r.side !== sideFilter) return false;
        if (!isNaN(minLev) && r.leverageValue < minLev) return false;
        if (!isNaN(maxLev) && r.leverageValue > maxLev) return false;
        if (!isNaN(minSize) && r.positionValue < minSize) return false;
        if (!isNaN(minFunding) && Math.abs(r.funding) < minFunding) return false;
        if (levTypeFilter && r.leverageType !== levTypeFilter) return false;
        if (!isNaN(minSzi) && Math.abs(r.szi) < minSzi) return false;
        if (!isNaN(maxSzi) && Math.abs(r.szi) > maxSzi) return false;
        if (!isNaN(minValueCcy) && r._valCcy < minValueCcy) return false;
        if (!isNaN(maxValueCcy) && r._valCcy > maxValueCcy) return false;
        if (!isNaN(minEntryCcy) && r._entCcy < minEntryCcy) return false;
        if (!isNaN(maxEntryCcy) && r._entCcy > maxEntryCcy) return false;
        if (!isNaN(minUpnl) && r.unrealizedPnl < minUpnl) return false;
        if (!isNaN(maxUpnl) && r.unrealizedPnl > maxUpnl) return false;
        return true;
    });

    // 2. Sort
    const { sortKey, sortDir } = sortState;
    rows.sort((a, b) => {
        let va, vb;
        if (sortKey === 'coin') return sortDir * a.coin.localeCompare(b.coin);
        if (sortKey === 'valueCcy') { va = a._valCcy; vb = b._valCcy; }
        else if (sortKey === 'entryCcy') { va = a._entCcy; vb = b._entCcy; }
        else if (sortKey === 'liqPx') { va = a._liqPxCcy; vb = b._liqPxCcy; }
        else { va = a[sortKey] ?? 0; vb = b[sortKey] ?? 0; }
        return sortDir * (vb - va);
    });

    // 3. Single-Pass Stats, Aggregation & Chart Data Pre-calc
    const { bandSize, minPriceFull, maxPriceFull, minPriceSummary, maxPriceSummary } = aggParams || {};
    const fullBands = {};
    const resBands = {};

    const scatterPoints = [];
    const liqPoints = [];
    const bubbleScale = filterState.bubbleScale || 1.0;

    const stats = {
        whalesWithPos: 0, whalesLong: 0, whalesShort: 0,
        positionsLongCount: 0, positionsShortCount: 0,
        totalUpnl: 0, upnlLong: 0, upnlShort: 0,
        totalCap: 0, capLong: 0, capShort: 0,
        largest: 0, coinStats: {}, uniqueCoins: [],
        aggFull: null, aggRes: null,
        scatterPoints, liqPoints
    };

    const whalesWithPosSet = new Set();
    const whalesLongSet = new Set();
    const whalesShortSet = new Set();
    const processedWhalesForCap = new Set();

    // PERFORMANCE: Usar object pooling em vez de criar novos objetos
    const createBand = (priceVal) => getBandFromPool(priceVal, bandSize || 0);

    const isInRange = (price, min, max) => (min <= 0 || max <= 0) || (price >= min && price <= max);

    let totalLongNotional = 0;
    let totalShortNotional = 0;

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const addr = r.address;

        whalesWithPosSet.add(addr);
        stats.totalUpnl += r.unrealizedPnl;
        if (r.side === 'long') {
            whalesLongSet.add(addr);
            stats.upnlLong += r.unrealizedPnl;
            stats.positionsLongCount++;
        } else {
            whalesShortSet.add(addr);
            stats.upnlShort += r.unrealizedPnl;
            stats.positionsShortCount++;
        }

        if (!processedWhalesForCap.has(addr)) {
            const meta = cachedWhaleMeta[addr];
            const val = meta?.accountValue || 0;
            stats.totalCap += val;
            if (val > stats.largest) stats.largest = val;
            if (whalesLongSet.has(addr)) stats.capLong += val;
            if (whalesShortSet.has(addr)) stats.capShort += val;
            processedWhalesForCap.add(addr);
        }

        if (!stats.coinStats[r.coin]) stats.coinStats[r.coin] = { totalPositionValue: 0, count: 0, whaleCount: 0, _whales: new Set() };
        const cs = stats.coinStats[r.coin];
        cs.totalPositionValue += r.positionValue;
        cs.count++;
        if (!cs._whales.has(addr)) {
            cs.whaleCount++;
            cs._whales.add(addr);
        }

        if (r._volBTC > 0) {
            const commonPointData = {
                y: r._volBTC,
                r: r._sqrtPosVal / 1000 * bubbleScale,
                _raw: r
            };
            scatterPoints.push({ x: r._entCcy, ...commonPointData });
            if (r._liqPxCcy > 0) {
                liqPoints.push({ x: r._liqPxCcy, ...commonPointData });
            }
        }

        if (aggParams) {
            const entryCcy = r._entCcy;
            const val = r.positionValue;
            const liqPriceCorr = r._liqPxCcy;
            const bandKey = Math.floor(entryCcy / bandSize) * bandSize;

            if (isInRange(entryCcy, minPriceFull, maxPriceFull)) {
                if (!fullBands[bandKey]) fullBands[bandKey] = createBand(bandKey);
                const b = fullBands[bandKey];
                b.isEmpty = false;
                if (r.side === 'long') {
                    b.qtdLong++; b.notionalLong += val;
                    if (liqPriceCorr > 0) b.sumLiqNotionalLong += (liqPriceCorr * val);
                    b.ativosLong.add(r.coin);
                    b.positionsLong.push(r);
                    b.whalesLong.add(addr);
                    totalLongNotional += val;
                } else {
                    b.qtdShort++; b.notionalShort += val;
                    if (liqPriceCorr > 0) b.sumLiqNotionalShort += (liqPriceCorr * val);
                    b.ativosShort.add(r.coin);
                    b.positionsShort.push(r);
                    b.whalesShort.add(addr);
                    totalShortNotional += val;
                }
            }

            if (isInRange(entryCcy, minPriceSummary, maxPriceSummary)) {
                if (!resBands[bandKey]) resBands[bandKey] = createBand(bandKey);
                const b = resBands[bandKey];
                b.isEmpty = false;
                if (r.side === 'long') {
                    b.qtdLong++; b.notionalLong += val;
                    if (liqPriceCorr > 0) b.sumLiqNotionalLong += (liqPriceCorr * val);
                    b.ativosLong.add(r.coin);
                    b.positionsLong.push(r);
                    b.whalesLong.add(addr);
                } else {
                    b.qtdShort++; b.notionalShort += val;
                    if (liqPriceCorr > 0) b.sumLiqNotionalShort += (liqPriceCorr * val);
                    b.ativosShort.add(r.coin);
                    b.positionsShort.push(r);
                    b.whalesShort.add(addr);
                }
            }

            if (liqPriceCorr > 0) {
                const liqBandKey = Math.floor(liqPriceCorr / bandSize) * bandSize;
                if (isInRange(liqPriceCorr, minPriceFull, maxPriceFull)) {
                    if (!fullBands[liqBandKey]) fullBands[liqBandKey] = createBand(liqBandKey);
                    fullBands[liqBandKey].isEmpty = false;
                    if (r.side === 'long') fullBands[liqBandKey].liqVolLong += val;
                    else fullBands[liqBandKey].liqVolShort += val;
                }
                if (isInRange(liqPriceCorr, minPriceSummary, maxPriceSummary)) {
                    if (!resBands[liqBandKey]) resBands[liqBandKey] = createBand(liqBandKey);
                    resBands[liqBandKey].isEmpty = false;
                    if (r.side === 'long') resBands[liqBandKey].liqVolLong += val;
                    else resBands[liqBandKey].liqVolShort += val;
                }
            }
        }
    }

    const coins = Object.keys(stats.coinStats).sort();
    stats.uniqueCoins = coins;

    // PERFORMANCE CRITICAL: Criar novo objeto sem _whales em vez de deletar propriedade
    // Deletar propriedades causa reshape de hidden class (deoptimization V8)
    for (let i = 0; i < coins.length; i++) {
        const coin = coins[i];
        const cs = stats.coinStats[coin];
        // Shape estável: criar novo objeto com mesmas propriedades, sem _whales
        stats.coinStats[coin] = {
            totalPositionValue: cs.totalPositionValue,
            count: cs.count,
            whaleCount: cs.whaleCount
        };
    }

    stats.whalesWithPos = whalesWithPosSet.size;
    stats.whalesLong = whalesLongSet.size;
    stats.whalesShort = whalesShortSet.size;

    if (aggParams) {
        // PERFORMANCE CRITICAL: Bucket sort O(N) + lazy evaluation
        const finalize = (bandsMap) => {
            const keys = Object.keys(bandsMap);
            if (keys.length === 0) {
                return { bandArray: [], totalLongNotional, totalShortNotional, bandsWithPosCount: 0 };
            }

            // Bucket sort: encontrar min/max e iterar na ordem desejada O(N)
            let minBand = Infinity;
            let maxBand = -Infinity;
            for (let i = 0; i < keys.length; i++) {
                const bandVal = Number(keys[i]);
                if (bandVal < minBand) minBand = bandVal;
                if (bandVal > maxBand) maxBand = bandVal;
            }

            // Construir array ordenado de maior para menor (ordem decrescente) O(N)
            const arr = [];
            const bandSizeLocal = bandSize || 1;
            for (let band = maxBand; band >= minBand; band -= bandSizeLocal) {
                if (bandsMap[band]) {
                    arr.push(bandsMap[band]);
                }
            }

            // Lazy evaluation: só ordenar posições se necessário
            for (let i = 0; i < arr.length; i++) {
                const b = arr[i];
                if (!b.isEmpty) {
                    // Ordenar apenas se houver múltiplas posições (evita sort de 0-1 elementos)
                    if (b.positionsLong.length > 1) {
                        b.positionsLong.sort((x, y) => y.positionValue - x.positionValue);
                    }
                    if (b.positionsShort.length > 1) {
                        b.positionsShort.sort((x, y) => y.positionValue - x.positionValue);
                    }
                    // Converter Sets para Arrays apenas quando necessário (serialização)
                    b.ativosLong = Array.from(b.ativosLong);
                    b.ativosShort = Array.from(b.ativosShort);
                    b.whalesLongCount = b.whalesLong.size;
                    b.whalesShortCount = b.whalesShort.size;
                    // PERFORMANCE: Liberar Sets de whales para o pool em vez de deletar
                    if (b.whalesLong) {
                        b.whalesLong.clear();
                        if (setPool.length < MAX_POOL_SIZE) setPool.push(b.whalesLong);
                        b.whalesLong = null; // Remover referência, não deletar propriedade
                    }
                    if (b.whalesShort) {
                        b.whalesShort.clear();
                        if (setPool.length < MAX_POOL_SIZE) setPool.push(b.whalesShort);
                        b.whalesShort = null;
                    }
                }
            }

            // Contar bandas não-vazias
            let bandsWithPosCount = 0;
            for (let i = 0; i < arr.length; i++) {
                if (!arr[i].isEmpty) bandsWithPosCount++;
            }

            return { bandArray: arr, totalLongNotional, totalShortNotional, bandsWithPosCount };
        };

        stats.aggFull = finalize(fullBands);
        const aggRes = finalize(resBands);

        if (aggRes.bandArray) {
            aggRes.bandArray = aggRes.bandArray.filter(b => {
                if (b.isEmpty) return false;
                return (b.notionalLong + b.notionalShort >= 10_000_000) ||
                    (b.liqVolLong >= 10_000_000 || b.liqVolShort >= 10_000_000);
            });
        }
        stats.aggRes = aggRes;
    }

    self.postMessage({ id, rows, stats });
};
