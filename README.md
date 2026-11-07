# rssi-demo

A browser demo of wireless range: carry one Seeed XIAO ESP32-C3 away from
another and watch the signal strength fall and packets start to drop. Live RSSI
and success-rate gauges, a scrolling RSSI trace, and a bar chart of signal and
loss vs. distance you build by marking taped floor positions. Over Web Serial,
no install, no server.

**Live page:** <https://interactive-hardware-interfacing.github.io/rssi-demo/>
· **Try without hardware** runs the whole page against a built-in simulator.

Part of [Interactive Hardware Interfacing](https://interactive-hardware-interfacing.github.io/).
Self-contained — copies nothing from the other demos at runtime.

## What you see

- **RSSI** (dBm) and **success rate** over a sliding window, plus the sender’s **TX power**.
- **RSSI over time** — a scrolling trace as the sender moves.
- **Signal vs distance** — press *Mark distance* at each floor mark to add a bar.

## Hardware

Two XIAO ESP32-C3 boards with u.FL antennas:

- **Bridge** — plugged into the laptop; runs [`firmware/bridge/code.py`](firmware/bridge/code.py).
- **TX** — USB-bank powered, with a pushbutton on D1→GND; runs [`firmware/tx/code.py`](firmware/tx/code.py).

The button steps transmit power (“turn up the volume”). No wiring between the
boards — they talk over the air. See [`wiring/`](wiring/) and [`PROTOCOL.md`](PROTOCOL.md).

## Putting the firmware on the boards

The page does it. Open the **Firmware** tab, plug in a XIAO ESP32-C3, click
**Install bridge** or **Install TX**, pick the port. The page writes `code.py`
through CircuitPython's raw REPL over Web Serial (the C3 has no `CIRCUITPY`
drive, so this is the only USB path), verifies size and CRC32 on the board,
reboots it, and waits for the firmware to announce itself.

A board that has never run CircuitPython needs it installed once: download
the `.bin` for the XIAO ESP32-C3 from
[circuitpython.org](https://circuitpython.org/board/seeed_xiao_esp32c3/),
pick it on the Firmware tab, click **Flash CircuitPython**. That path uses
[esptool-js](https://github.com/espressif/esptool-js), kept in
[`flasher/`](flasher/) under its own licence.

## What's in the repo

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/app.js` | The page: instrument, plus Hardware / Firmware / About views (`js/views.js`). |
| `js/bridge.js`, `js/sim.js` | Web Serial reader for the bridge's line-JSON, and a simulator that walks a fake sender away. |
| `js/install.js`, `js/device/` | The Firmware tab: CircuitPython raw REPL over Web Serial (write, verify, reboot). |
| `flasher/` | CircuitPython flashing for a bare board (esptool-js). Apache-2.0, see `LICENSES.md`. |
| `firmware/bridge/code.py`, `firmware/tx/code.py` | One CircuitPython file per role. |
| `PROTOCOL.md`, `wiring/` | The serial contract and the hookup. |

## Logging data

The **Data logging** panel records while connected (simulator included) and
hands over one `.zip`: `packets.csv` (every packet: seq, RSSI, gap, TX
power, CRC), `distance.csv` (every *Mark distance*: avg RSSI, success rate,
counts), and `marks.csv` (labelled events from the **Mark** box — "antenna
off", "door closed"). Nothing touches disk until you click Download.

**Walk test** marks a distance automatically every 5–20 s and bumps the
label by a fixed step, so one person can pace the hallway alone. The
**free-space path-loss curve** (−20·log₁₀ d, fitted to the first mark) is
drawn over the bars; the gap between it and the measurements is the room.

**Presenter** (or press `P`) hides the log and settings and enlarges the
charts and numbers for a projector. `Esc` leaves it; the choice is remembered.

## Run locally

```
python -m http.server 8000
```

then open <http://localhost:8000/>. Web Serial needs HTTPS or localhost; ES
modules won’t load from `file://`.

## Browser support

Chrome or Edge on a laptop/desktop. The simulator works anywhere.

## License

GPL-2.0 (see [`LICENSE`](LICENSE)), except `flasher/`, which is Apache-2.0
because it bundles esptool-js — see [`LICENSES.md`](LICENSES.md).
Maintained by [LC Linkous](https://github.com/LC-Linkous).
