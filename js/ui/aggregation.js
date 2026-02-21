// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Aggregation Table
// ═══════════════════════════════════════════════════════════

import { getDisplayedRows, getCurrentPrices, getFxRates, getActiveEntryCurrency, getAggInterval } from '../state.js';
import { getCorrelatedEntry } from '../utils/currency.js';
import { fmtUSD } from '../utils/formatters.js';

export function renderAggregationTable() {
    console.log('Rendering Aggregation Table...');
    const rows = getDisplayedRows();
    const currentPrices = getCurrentPrices();
    const fxRates = getFxRates();
    const activeEntryCurrency = getActiveEntryCurrency();

    if (!rows || rows.length === 0) {
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="13" class="empty-cell">Sem dados disponíveis.</td></tr>';
        document.getElementById('aggStatsBar').innerHTML = '';
        return;
    }

    const bandSize = getAggInterval();
    const bands = {};

    let totalLongNotional = 0;
    let totalShortNotional = 0;
    let posCount = rows.length;
    let bandsWithPosCount = 0;

    // Build bands map
    for (const r of rows) {
        // Calculate correlated entry price
        const entryCcy = getCorrelatedEntry(r, activeEntryCurrency, currentPrices, fxRates);
        if (isNaN(entryCcy) || entryCcy <= 0) continue;

        // Determine band
        const bandDown = Math.floor(entryCcy / bandSize) * bandSize;

        if (!bands[bandDown]) {
            bands[bandDown] = {
                faixaDe: bandDown,
                faixaAte: bandDown + bandSize,
                qtdLong: 0,
                notionalLong: 0,
                qtdShort: 0,
                notionalShort: 0,
                ativosLong: new Set(),
                ativosShort: new Set()
            };
        }

        const b = bands[bandDown];
        const val = r.positionValue; // USD value

        if (r.side === 'long') {
            b.qtdLong++;
            b.notionalLong += val;
            b.ativosLong.add(r.coin);
            totalLongNotional += val;
        } else if (r.side === 'short') {
            b.qtdShort++;
            b.notionalShort += val;
            b.ativosShort.add(r.coin);
            totalShortNotional += val;
        }
    }

    // Convert bands to array and sort descending
    const bandArray = Object.values(bands).sort((a, b) => b.faixaDe - a.faixaDe);
    bandsWithPosCount = bandArray.length;

    // Calculate max and min bands to fill "vacuos" (empty bands)
    if (bandArray.length > 0) {
        const maxBand = bandArray[0].faixaDe;
        const minBand = bandArray[bandArray.length - 1].faixaDe;
        const totalBands = Math.floor((maxBand - minBand) / bandSize) + 1;

        // Create full array including vacuos
        const fullBandArray = [];
        let vacuosCount = 0;

        for (let base = maxBand; base >= minBand; base -= bandSize) {
            fullBandArray.push(bands[base] || {
                faixaDe: base,
                faixaAte: base + bandSize,
                qtdLong: 0,
                notionalLong: 0,
                qtdShort: 0,
                notionalShort: 0,
                ativosLong: new Set(),
                ativosShort: new Set(),
                isEmpty: true
            });
            if (!bands[base]) vacuosCount++;
        }

        // Top Stats
        const ratioLS = totalShortNotional > 0 ? (totalLongNotional / totalShortNotional).toFixed(3) : '∞';
        const statsHtml = `
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Long Total <span style="color:#22c55e;font-weight:700;font-family:monospace">${fmtUsdCompact(totalLongNotional)}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Short Total <span style="color:#ef4444;font-weight:700;font-family:monospace">${fmtUsdCompact(totalShortNotional)}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Ratio L/S <span style="color:#60a5fa;font-weight:700">${ratioLS}x</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Posições <span style="font-weight:700">${posCount}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">c/ Posições <span style="color:#22c55e;font-weight:700">${bandsWithPosCount}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Vácuos <span style="color:#6b7280;font-weight:700">${vacuosCount}</span></div>
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px">Total faixas <span style="font-weight:700">${totalBands}</span></div>
        `;
        document.getElementById('aggStatsBar').innerHTML = statsHtml;

        // Render rows
        let html = '';
        for (const b of fullBandArray) {
            const totalNotional = b.notionalLong + b.notionalShort;
            const isEmpty = b.isEmpty;

            let domType = 'VACUO';
            let domPct = 0;
            let domBg = '';
            let domColor = '#6b7280';

            if (totalNotional > 0) {
                if (b.notionalLong > b.notionalShort) {
                    domType = 'COMPRA';
                    domColor = '#22c55e'; // Green text
                    domBg = 'rgba(34,197,94,0.1)';
                    domPct = (b.notionalLong / totalNotional) * 100;
                } else if (b.notionalShort > b.notionalLong) {
                    domType = 'VENDA';
                    domColor = '#ef4444'; // Red text
                    domBg = 'rgba(239,68,68,0.1)';
                    domPct = (b.notionalShort / totalNotional) * 100;
                } else {
                    domType = 'NEUTRO';
                    domColor = '#9ca3af';
                    domPct = 50;
                }
            }

            let intType = '—';
            let intColor = '#6b7280';
            if (totalNotional >= 100_000_000) { intType = 'EXTREMA >100M'; intColor = '#f59e0b'; } // Orange
            else if (totalNotional >= 30_000_000) { intType = 'FORTE >30M'; intColor = '#22c55e'; }   // Green
            else if (totalNotional >= 10_000_000) { intType = 'MEDIA >10M'; intColor = '#60a5fa'; }  // Blue
            else if (totalNotional > 3_000_000) { intType = 'FRACA >3M'; intColor = '#9ca3af'; }  // Gray/light blue
            else if (totalNotional > 0) { intType = 'MUITO FRACA'; intColor = '#4b5563'; }

            let zoneType = isEmpty ? 'Zona Vazia' : '—';
            let zoneColor = '#4b5563';
            if (!isEmpty) {
                const isForte = domPct === 100 || totalNotional >= 30_000_000;
                const baseStr = domType === 'COMPRA' ? 'Compra' : domType === 'VENDA' ? 'Venda' : 'Neutro';
                if (domPct === 50) {
                    zoneType = 'Indecisão';
                } else if (isForte) {
                    zoneType = baseStr + ' Forte';
                    zoneColor = domType === 'COMPRA' ? '#22c55e' : '#ef4444';
                } else if (totalNotional >= 10_000_000) {
                    zoneType = baseStr + ' Leve';
                    zoneColor = domType === 'COMPRA' ? '#4ade80' : '#f87171'; // Lighter
                } else {
                    zoneType = baseStr;
                    zoneColor = domType === 'COMPRA' ? '#22c55e' : '#ef4444';
                }
            }

            const formatVal = (v) => v > 0 ? fmtUsdCompact(v) : '—';
            const formatQty = (v) => v > 0 ? v : '—';

            const longCol = b.notionalLong > 0 ? '#4ade80' : '#4b5563';
            const shortCol = b.notionalShort > 0 ? '#f87171' : '#4b5563';

            const trStyle = isEmpty ? 'opacity:0.6;background:transparent' : '';
            const valBg = totalNotional >= 10_000_000 ? 'background:rgba(59,130,246,0.1)' : '';

            html += `
            <tr style="${trStyle}">
                <td style="font-family:monospace; font-weight:700; color:#d1d5db">$${b.faixaDe.toLocaleString()}</td>
                <td style="font-family:monospace; color:#9ca3af">$${b.faixaAte.toLocaleString()}</td>
                <td style="color:${longCol}; text-align:center">${formatQty(b.qtdLong)}</td>
                <td style="color:${b.notionalLong > 0 ? '#22c55e' : '#4b5563'}; font-family:monospace; font-weight:${b.notionalLong > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalLong)}</td>
                <td style="color:${shortCol}; text-align:center">${formatQty(b.qtdShort)}</td>
                <td style="color:${b.notionalShort > 0 ? '#ef4444' : '#4b5563'}; font-family:monospace; font-weight:${b.notionalShort > 30_000_000 ? '700' : '400'}">${formatVal(b.notionalShort)}</td>
                <td style="font-family:monospace; color:#bfdbfe; font-weight:600; ${valBg}">${formatVal(totalNotional)}</td>
                <td style="color:${domColor}; font-weight:700; background:${domBg} !important">${domType}</td>
                <td style="color:${domColor}; font-weight:700; background:${domBg} !important">${domPct > 0 ? domPct.toFixed(1) + '%' : '—'}</td>
                <td style="color:${intColor}; font-size:11px; font-weight:600">${intType}</td>
                <td style="color:${zoneColor}; font-weight:600">${zoneType}</td>
                <td style="color:#4ade80; font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosLong).join(' ')}">${Array.from(b.ativosLong).join(' ')}</td>
                <td style="color:#f87171; font-size:11px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${Array.from(b.ativosShort).join(' ')}">${Array.from(b.ativosShort).join(' ')}</td>
            </tr>`;
        }
        document.getElementById('aggTableBody').innerHTML = html;
    } else {
        document.getElementById('aggTableBody').innerHTML = '<tr><td colspan="13" class="empty-cell">Sem dados disponíveis.</td></tr>';
    }
}

function fmtUsdCompact(val) {
    if (val === 0) return '$0';
    if (val >= 1_000_000_000) return '$' + (val / 1_000_000_000).toFixed(2) + 'B';
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(2) + 'M';
    if (val >= 1_000) return '$' + (val / 1_000).toFixed(2) + 'K';
    return '$' + val.toFixed(2);
}
