'use strict';

/*
 * sim.js — fake bridge for rssi-demo. Emits the shared line-JSON. RSSI falls
 * off with a simulated "distance" that you can drive from the page's own
 * Mark-distance flow isn't available offline, so instead the simulator slowly
 * sweeps RSSI up and down and drops more packets as the signal weakens, which
 * is enough to exercise the gauges, the time series and the loss display.
 * The power-step button affects the simulated RSSI offset too.
 */

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

const POWER_STEPS = [-12.0, -4.0, 4.0, 10.0];

function buildPayload(seq, txDbm) {
  const b = new Uint8Array(20), dv = new DataView(b.buffer);
  b[0] = 0xa5; b[1] = 1; b[2] = 1; b[3] = 0x20;
  dv.setUint32(4, seq >>> 0, true);
  dv.setUint32(8, (seq * 100) >>> 0, true);
  dv.setInt16(12, Math.round(txDbm * 10), true);
  dv.setUint16(14, 0, true);
  dv.setUint32(16, crc32(b.subarray(0, 16)), true);
  return b;
}
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

export class SimBridge {
  constructor() { this.onLine = () => {}; this.onRaw = () => {}; this.onClose = () => {}; this._t = null; this.connected = false; this.powerIdx = POWER_STEPS.length - 1; }

  async connect() {
    this.connected = true; this.seq = 0; this.lastSeq = null; this.phase = 0;
    this._emit({ t: 'hello', role: 'bridge', proto: 1, channel: 6, simulated: true });
    this._t = setInterval(() => this._tick(), 100); // 10 Hz like the TX node
    return true;
  }
  _emit(o) { this.onRaw(JSON.stringify(o) + '\n'); this.onLine(o); }

  stepPower() { this.powerIdx = (this.powerIdx + 1) % POWER_STEPS.length; }

  _tick() {
    this.seq++;
    this.phase += 0.015;
    const txDbm = POWER_STEPS[this.powerIdx];
    // base RSSI wanders with phase (simulated walk); higher power = stronger.
    const walk = 18 * Math.sin(this.phase);           // -18..+18
    const powerBump = (txDbm + 12) * 1.2;             // 0..~26
    let rssi = -82 + powerBump - walk + (Math.random() * 4 - 2);
    rssi = Math.max(-100, Math.min(-28, Math.round(rssi)));
    // Weaker signal -> more loss. Map rssi -100..-40 to loss prob 0.6..0.0
    const lossP = Math.max(0, Math.min(0.9, (-40 - rssi) / 60 + 0.02));
    if (Math.random() < lossP) return;                 // dropped packet
    let gap = 0;
    if (this.lastSeq !== null) gap = this.seq - this.lastSeq - 1;
    this.lastSeq = this.seq;
    const b = buildPayload(this.seq, txDbm);
    this._emit({
      t: 'pkt', seq: this.seq, mac: '7c9ebda10f20', rssi,
      len: 20, hex: hex(b), crc_ok: true, ms: this.seq * 100,
      fields: { node_id: 1, seq: this.seq, uptime_ms: this.seq * 100, tx_dbm: txDbm }, gap,
    });
  }

  async send() {}
  async disconnect() { this.connected = false; clearInterval(this._t); this._t = null; }
}
