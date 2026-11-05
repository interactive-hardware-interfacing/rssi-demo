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

## Run locally

```
python -m http.server 8000
```

then open <http://localhost:8000/>. Web Serial needs HTTPS or localhost; ES
modules won’t load from `file://`.

## Browser support

Chrome or Edge on a laptop/desktop. The simulator works anywhere.

## License

GPL-2.0 (see [`LICENSE`](LICENSE)). Maintained by [LC Linkous](https://github.com/LC-Linkous).
