# Wiring — rssi-demo

Source of truth for the page’s hardware/wiring tables. `wiring.svg` is the
diagram; the page embeds an inline, theme-aware copy.

Two XIAO ESP32-C3 boards talking over the air (ESP-NOW). The only wiring is USB
plus one pushbutton on the TX board.

## Bridge node (required)

| Signal           | XIAO C3 pin | Goes to | Note                          |
|------------------|-------------|---------|-------------------------------|
| USB data + power | USB-C       | Laptop  | The only required connection  |
| Antenna          | u.FL        | Whip    | Clip on firmly                |

Runs `../firmware/bridge/code.py`.

## TX node (required)

| Signal    | XIAO C3 pin | Goes to           | Note                                    |
|-----------|-------------|-------------------|-----------------------------------------|
| Button    | D1          | GND               | Momentary; internal pull-up, no resistor|
| USB power | USB-C       | USB bank          | Keep it portable                        |
| Antenna   | u.FL        | Whip              | Clip on firmly                          |

Runs `../firmware/tx/code.py`. The button steps `wifi.radio.tx_power` through
a short list; the firmware reports the value the radio actually accepts.

## Notes

- Same hardware as the rest of the family; only the TX board has the button.
- Both pin Wi-Fi channel 6.
- No level shifting, no external resistors.
