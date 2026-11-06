# Wiring — rssi-demo

Source of truth for the page’s hardware/wiring tables. `wiring.svg` is the
diagram; the page embeds an inline, theme-aware copy.

Two XIAO ESP32-C3 boards talking over the air (ESP-NOW). The only wiring is USB
plus one pushbutton on the TX board. Which board is which is set by the
firmware file it was given (the page's Firmware tab installs either).

## Pin names

The XIAO ESP32-C3's top silkscreen prints function names on the right-hand
header. The one pin this demo uses is on the left:

| This doc says | Printed on the board | ESP32-C3 GPIO |
|---------------|----------------------|---------------|
| D1            | D1 / A1              | GPIO3         |
| GND           | GND                  | —             |

If you add wiring of your own, keep anything tied to ground at power-up off
D0 (GPIO2), D8 (SCK, GPIO8) and D9 (MISO, GPIO9): they are strapping pins the
chip samples to choose its boot mode.

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

- Identical boards; only the TX board has the button.
- Both pin Wi-Fi channel 6.
- No level shifting, no external resistors.
