# code.py — TX node for rssi-demo
#
# Runs on a XIAO ESP32-C3 in CircuitPython. Broadcasts sequenced ESP-NOW
# packets at a steady rate so the bridge can measure received-signal strength
# and packet loss as a volunteer carries this board away from the bridge.
#
# A button (D1 -> GND) steps the transmit power through a short list — the
# "turn up the volume" control. We SET wifi.radio.tx_power, then READ IT BACK
# and send whatever the radio actually reports, because the C3 clamps to the
# levels it supports and we want the page to show the true value.
#
# Payload (20 bytes, little-endian), msg_type 0x20:
#   off 0  1B  magic     0xA5
#   off 1  1B  version   0x01
#   off 2  1B  node_id   0x01
#   off 3  1B  msg_type  0x20
#   off 4  4B  seq       u32
#   off 8  4B  uptime_ms u32
#   off 12 2B  tx_dbm_x10 s16  actual tx power * 10 (e.g. -40 = -4.0 dBm)
#   off 14 2B  reserved  u16   (0)
#   off 16 4B  crc32     u32   CRC32 of bytes 0..15

import time
import struct
import binascii
import board
import digitalio
import wifi
import espnow

NODE_ID = 0x01
MSG_TYPE = 0x20
BROADCAST = b"\xff\xff\xff\xff\xff\xff"
CHANNEL = 6
RATE_HZ = 10                       # steady 10 packets/sec

# Target power steps in dBm. The radio clamps these to what it supports; we
# report back whatever it actually set.
POWER_STEPS = [-12.0, -4.0, 4.0, 10.0]
power_idx = len(POWER_STEPS) - 1   # start at the top ("loud")

wifi.radio.enabled = True
try:
    wifi.radio.start_ap(ssid="rssi-demo-tx", channel=CHANNEL)
except Exception as ex:
    print("channel pin warning:", ex)

def apply_power(idx):
    try:
        wifi.radio.tx_power = POWER_STEPS[idx]
    except Exception as ex:
        print("tx_power set warning:", ex)
    try:
        return float(wifi.radio.tx_power)
    except Exception:
        return POWER_STEPS[idx]

actual_dbm = apply_power(power_idx)
print("tx node ready, power ~", actual_dbm, "dBm")

# Button on D1 with internal pull-up; press = connect to GND.
button = digitalio.DigitalInOut(board.D1)
button.direction = digitalio.Direction.INPUT
button.pull = digitalio.Pull.UP
prev = button.value

e = espnow.ESPNow()
peer = espnow.Peer(mac=BROADCAST, channel=CHANNEL)
e.peers.append(peer)

seq = 0
next_send = time.monotonic()

while True:
    # Debounced falling edge on the button -> step power.
    now_btn = button.value
    if prev and not now_btn:          # pressed
        power_idx = (power_idx + 1) % len(POWER_STEPS)
        actual_dbm = apply_power(power_idx)
        print("power step ->", actual_dbm, "dBm")
        time.sleep(0.05)              # debounce
    prev = now_btn

    now = time.monotonic()
    if now >= next_send:
        next_send += 1.0 / RATE_HZ
        uptime_ms = time.monotonic_ns() // 1_000_000 & 0xFFFFFFFF
        tx_x10 = int(round(actual_dbm * 10))
        body = struct.pack("<BBBB I I h H", 0xA5, 0x01, NODE_ID, MSG_TYPE,
                           seq & 0xFFFFFFFF, uptime_ms, tx_x10, 0)  # 16 bytes
        crc = binascii.crc32(body) & 0xFFFFFFFF
        packet = body + struct.pack("<I", crc)                     # 20 bytes
        try:
            e.send(packet, peer)
        except Exception as ex:
            print("send error:", ex)
        seq += 1
