'use strict';

/*
 * app.js — rssi-demo UI.
 * Shows link strength as a volunteer walks the TX node away from the bridge:
 *  - a live RSSI readout and a success-rate gauge (over a sliding window)
 *  - a scrolling RSSI time series
 *  - "Mark distance": tag the current reading at a taped floor mark, building
 *    a bar chart of average RSSI and loss vs distance that persists for the
 *    group to look at.
 */

import { Bridge } from './bridge.js';
import { SimBridge } from './sim.js';
import { initViews } from './views.js';
import { initInstall } from './install.js';
import { initPresenter } from './presenter.js';
import { CaptureLogger, bindLogPanel } from './logger.js';

const $ = s => document.querySelector(s);
const logEl = $('#log');
function log(t) { logEl.textContent += t; if (logEl.textContent.length > 20000) logEl.textContent = logEl.textContent.slice(-15000); logEl.scrollTop = logEl.scrollHeight; }
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

// Size a canvas bitmap to its on-screen size × devicePixelRatio so lines and
// labels stay crisp; CSS controls the layout size. Returns CSS-pixel W/H and
// leaves the context scaled so drawing code works in CSS pixels.
function fitCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W: canvas.clientWidth, H: canvas.clientHeight };
}

let bridge = null, simulated = false;

// ---- sliding window for success rate (count received vs expected via gaps) ----
const WIN = 40; // packets
let recent = []; // {rssi, lost} per received packet; lost = gap before it
function windowStats() {
  let recv = recent.length, lost = 0, rssiSum = 0;
  for (const r of recent) { lost += r.lost; rssiSum += r.rssi; }
  const expected = recv + lost;
  return { successPct: expected ? recv / expected * 100 : 0, avgRssi: recv ? rssiSum / recv : null, recv, lost };
}

let lastRssi = null, lastTxDbm = null;

// ---- time series ----
const tsCanvas = $('#series'), tsCtx = tsCanvas.getContext('2d');
const tsData = []; const TS_MAX = 240; let tsCount = 0;
function drawSeries() {
  const { W, H } = fitCanvas(tsCanvas, tsCtx);
  tsCtx.clearRect(0, 0, W, H);
  const lo = -100, hi = -20;
  // gridlines every 20 dB
  tsCtx.strokeStyle = cssVar('--grid'); tsCtx.fillStyle = cssVar('--muted'); tsCtx.font = '11px system-ui, sans-serif';
  for (let db = lo; db <= hi; db += 20) {
    const y = H - (db - lo) / (hi - lo) * H;
    tsCtx.globalAlpha = 0.5; tsCtx.beginPath(); tsCtx.moveTo(0, y); tsCtx.lineTo(W, y); tsCtx.stroke(); tsCtx.globalAlpha = 1;
    tsCtx.fillText(db + ' dBm', 4, y - 2);
  }
  // labelled marks from the logging panel
  tsCtx.save(); tsCtx.strokeStyle = cssVar('--magenta'); tsCtx.fillStyle = cssVar('--magenta'); tsCtx.font = '10px system-ui, sans-serif';
  for (const m of markTicks) { const idx = m.at - (tsCount - tsData.length); if (idx < 0 || idx > tsData.length) continue; const x = idx / (TS_MAX - 1) * W; tsCtx.beginPath(); tsCtx.moveTo(x, 0); tsCtx.lineTo(x, H); tsCtx.stroke(); tsCtx.fillText(m.label, x + 3, 10); }
  tsCtx.restore();
  tsCtx.strokeStyle = cssVar('--accent'); tsCtx.lineWidth = 1.5; tsCtx.beginPath();
  tsData.forEach((v, i) => {
    const x = i / (TS_MAX - 1) * W;
    const y = H - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * H;
    i ? tsCtx.lineTo(x, y) : tsCtx.moveTo(x, y);
  });
  tsCtx.stroke();
}

// ---- distance marks + bar chart ----
let marks = []; // {distance, avgRssi, successPct, n}
const barCanvas = $('#bars'), barCtx = barCanvas.getContext('2d');
function drawBars() {
  const { W, H } = fitCanvas(barCanvas, barCtx), pad = 28;
  barCtx.clearRect(0, 0, W, H);
  if (!marks.length) {
    barCtx.fillStyle = cssVar('--muted'); barCtx.font = '12px system-ui, sans-serif';
    barCtx.fillText('Press “Mark distance” at each floor mark', pad, H / 2 - 7);
    barCtx.fillText('to build this chart.', pad, H / 2 + 9);
    return;
  }
  const n = marks.length, bw = (W - pad * 2) / n;
  const lo = -100, hi = -20;
  marks.forEach((m, i) => {
    const x = pad + i * bw + bw * 0.15, w = bw * 0.7;
    // RSSI bar (height from floor)
    const h = (Math.max(lo, Math.min(hi, m.avgRssi)) - lo) / (hi - lo) * (H - pad - 20);
    barCtx.fillStyle = cssVar('--accent');
    barCtx.fillRect(x, H - pad - h, w, h);
    // loss overlay: a thin red cap whose width is the share of packets lost
    const lossFrac = Math.max(0, Math.min(1, (100 - m.successPct) / 100));
    barCtx.fillStyle = cssVar('--err');
    if (lossFrac > 0) barCtx.fillRect(x, H - pad - h - 6, w * lossFrac, 4);
    barCtx.save(); barCtx.fillStyle = cssVar('--muted'); barCtx.font = '10px system-ui, sans-serif'; barCtx.textAlign = 'center';
    barCtx.fillText(m.distance, x + w / 2, H - pad + 12);
    barCtx.fillText(m.avgRssi.toFixed(0), x + w / 2, H - pad - h - 10);
    barCtx.restore();
  });
  // Free-space path loss: RSSI(d) = RSSI(d0) - 20·log10(d/d0). Fitted to the
  // first numeric mark, drawn behind the bars. The gap between the curve and
  // the bars is the room: walls, bodies, reflections, antenna orientation.
  const numeric = marks.map((m, i) => ({ i, d: parseFloat(m.distance), r: m.avgRssi })).filter(p => Number.isFinite(p.d) && p.d > 0);
  if ($('#showmodel').checked && numeric.length >= 2) {
    const ref = numeric[0];
    barCtx.save(); barCtx.strokeStyle = cssVar('--yellow'); barCtx.setLineDash([6, 4]); barCtx.lineWidth = 2.5; barCtx.beginPath();
    const dmin = numeric[0].d, dmax = numeric[numeric.length - 1].d;
    for (let k = 0; k <= 40; k++) {
      const d = dmin + (dmax - dmin) * k / 40;
      const rssi = ref.r - 20 * Math.log10(d / ref.d);
      // x: place by interpolating between bar centres so the curve lines up with the bars it describes
      let x;
      if (d <= dmin) x = pad + ref.i * bw + bw / 2;
      else { let j = 0; while (j < numeric.length - 1 && numeric[j + 1].d < d) j++; const a = numeric[j], b = numeric[Math.min(j + 1, numeric.length - 1)]; const f = b.d === a.d ? 0 : (d - a.d) / (b.d - a.d); x = pad + (a.i + (b.i - a.i) * f) * bw + bw / 2; }
      const y = H - pad - (Math.max(lo, Math.min(hi, rssi)) - lo) / (hi - lo) * (H - pad - 20);
      k ? barCtx.lineTo(x, y) : barCtx.moveTo(x, y);
    }
    barCtx.stroke(); barCtx.restore();
  }
  barCtx.fillStyle = cssVar('--muted'); barCtx.font = '10px system-ui, sans-serif';
  barCtx.fillText('avg RSSI (bar) · red cap = share of packets lost' + ($('#showmodel').checked && numeric.length >= 2 ? ' · dashed = free-space model' : ''), pad, 12);
}

// ---- line handler ----
function setLink(up) { const el = $('#link'); el.textContent = up ? 'LINK UP' : 'LINK LOST'; el.className = up ? 'ok' : 'bad'; }

function onLine(obj) {
  if (obj.t === 'hello') { log(`[bridge] channel ${obj.channel}${obj.simulated ? ' (sim)' : ''}\n`); return; }
  if (obj.t === 'idle') { setLink(false); return; }
  if (obj.t !== 'pkt') return;
  setLink(true);
  lastRssi = typeof obj.rssi === 'number' ? obj.rssi : lastRssi;
  if (obj.fields && typeof obj.fields.tx_dbm === 'number') lastTxDbm = obj.fields.tx_dbm;
  recent.push({ rssi: lastRssi, lost: obj.gap || 0 });
  logger.push('packets', [new Date().toISOString(), obj.seq, lastRssi, obj.gap || 0, lastTxDbm, obj.crc_ok === false ? 0 : 1]);
  while (recent.length > WIN) recent.shift();
  tsData.push(lastRssi); tsCount++; while (tsData.length > TS_MAX) tsData.shift();

  const s = windowStats();
  $('#rssi').textContent = lastRssi == null ? '—' : lastRssi;
  $('#success').textContent = s.successPct.toFixed(0) + '%';
  $('#txpow').textContent = lastTxDbm == null ? '—' : lastTxDbm.toFixed(1);
  // success gauge bar
  $('#succbar').style.width = Math.max(0, Math.min(100, s.successPct)) + '%';
  drawSeries();
}

// ---- controls ----
function setStatus(t, c) { if (!c && logger.recording) logger.stop(); paintLog(logger); $('#status').textContent = t; $('#status').className = c ? 'ok' : ''; $('#connect').disabled = c; $('#sim').disabled = c; $('#disconnect').disabled = !c; $('#power').disabled = !c; }

async function start(useSim) {
  simulated = useSim;
  bridge = useSim ? new SimBridge() : new Bridge();
  bridge.onLine = onLine;
  bridge.onRaw = t => { if (!useSim) log(t); };
  bridge.onClose = e => { log(`\n[closed] ${e?.message || ''}\n`); setStatus('Disconnected', false); setLink(false); bridge = null; };
  try {
    log(useSim ? '[sim] starting\n' : '[serial] requesting port\n');
    await bridge.connect();
    setStatus(useSim ? 'Simulator running' : 'Bridge connected', true);
  } catch (e) { log(`[error] ${e.message}\n`); setStatus(e.message, false); bridge = null; }
}
async function stop() { walkStop(); if (bridge) { try { await bridge.disconnect(); } catch {} } bridge = null; setStatus('Not connected', false); setLink(false); log('[disconnected]\n'); }

$('#connect').addEventListener('click', () => start(false));
$('#sim').addEventListener('click', () => start(true));
$('#disconnect').addEventListener('click', stop);

function markDistance(step = 5) {
  const dist = $('#distance').value.trim() || (marks.length + 1) + '';
  const s = windowStats();
  if (s.avgRssi == null) { log('[mark] no packets yet\n'); return false; }
  marks.push({ distance: dist, avgRssi: s.avgRssi, successPct: s.successPct, n: s.recv });
  log(`[mark] ${dist}: avg ${s.avgRssi.toFixed(1)} dBm, ${s.successPct.toFixed(0)}% over ${s.recv} pkts\n`);
  logger.push('distance', [new Date().toISOString(), dist, s.avgRssi, s.successPct, s.recv, s.lost, lastTxDbm]);
  drawBars();
  // bump the default next distance if it's a number
  const num = parseFloat(dist); if (!Number.isNaN(num)) $('#distance').value = (num + step) + '';
  return true;
}
$('#mark').addEventListener('click', () => markDistance(Number($('#walkstep').value) || 5));
$('#showmodel').addEventListener('change', drawBars);

// ---- walk test: one person, no helper. Marks itself every N seconds. ----
let walkTimer = null, walkLeft = 0;
function walkStop() { clearInterval(walkTimer); walkTimer = null; $('#walkcount').textContent = ''; $('#walkauto').checked = false; }
$('#walkauto').addEventListener('change', () => {
  if (!$('#walkauto').checked) { walkStop(); return; }
  if (!bridge) { log('[walk] connect first\n'); $('#walkauto').checked = false; return; }
  const every = Number($('#walkevery').value);
  walkLeft = every;
  log(`[walk] auto-marking every ${every} s — start walking\n`);
  walkTimer = setInterval(() => {
    walkLeft--;
    $('#walkcount').textContent = walkLeft + 's';
    if (walkLeft <= 0) { if (!markDistance(Number($('#walkstep').value) || 5)) log('[walk] no packets — link lost?\n'); walkLeft = every; }
  }, 1000);
});

$('#resetrun').addEventListener('click', () => {
  walkStop();
  marks = []; recent = []; tsData.length = 0;
  drawBars(); drawSeries();
  $('#rssi').textContent = '—'; $('#success').textContent = '—'; $('#succbar').style.width = '0%';
  log('[run reset]\n');
});

$('#power').addEventListener('click', async () => {
  if (simulated && bridge?.stepPower) { bridge.stepPower(); log('[sim] power stepped\n'); return; }
  log('Press the button on the TX node to change power (no serial command for it).\n');
});

$('#logsend').addEventListener('click', async () => {
  const cmd = $('#logcmd').value.trim(); if (!cmd) return;
  if (simulated || !bridge) { log('(no command sent)\n'); return; }
  try { await bridge.send(cmd); log('→ ' + cmd + '\n'); } catch (e) { log('[error] ' + e.message + '\n'); }
});

// ---- doc views + firmware install ----
const views = initViews(
  $('#instrument'),
  { hardware: $('#hardware'), firmware: $('#firmware'), about: $('#about') },
  [...document.querySelectorAll('nav a[data-view]')],
);
initInstall({
  installBridge: $('#fwInstallBridge'), installTx: $('#fwInstallTx'), status: $('#fwStatus'), bar: $('#fwBar'), log: $('#fwLog'), noRepl: $('#fwNoRepl'),
  cpFile: $('#cpFile'), cpLoad: $('#cpLoad'), cpName: $('#cpName'), cpFlash: $('#cpFlash'),
}, { releaseSerial: async () => { if (bridge && !simulated) await stop(); } });
new ResizeObserver(() => { drawSeries(); drawBars(); }).observe(tsCanvas);

if (!navigator.serial) $('#nowebserial').hidden = false;

// ---- presenter mode + data logging ----
initPresenter($('#presenter'));
const logger = new CaptureLogger({
  packets:  ['iso_time', 'seq', 'rssi_dbm', 'gap', 'tx_dbm', 'crc_ok'],
  distance: ['iso_time', 'distance', 'avg_rssi_dbm', 'success_pct', 'received', 'lost', 'tx_dbm'],
}, 'rssi-demo');
const paintLog = bindLogPanel(logger, $, {
  isConnected: () => !!bridge,
  meta: () => ({ source: simulated ? 'simulator' : 'board', notes: 'packets.csv: one row per received packet; gap = packets missing before it.\ndistance.csv: one row per Mark distance, averaged over the last ' + WIN + ' packets.' }),
  log,
});
// marks also show on the time series as a tick
const markTicks = [];
window.addEventListener('logmark', e => { markTicks.push({ at: tsCount, label: e.detail.label }); drawSeries(); });

setStatus('Not connected', false); setLink(false);
drawBars(); drawSeries();
log('Ready. "Try without hardware" for the simulator, or "Connect bridge".\n');
