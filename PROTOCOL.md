# Protocol — rssi-demo

This demo uses the **shared bridge serial format** defined in
`packet-inspector-demo/PROTOCOL.md` (line-JSON over USB, 115200 8N1, with
`hello` / `pkt` / `idle` lines). Only the payload differs.

## Payload (20 bytes, little-endian, msg_type 0x20)

| Off | Len | Field        | Type | Notes                                   |
|-----|-----|--------------|------|-----------------------------------------|
| 0   | 1   | `magic`      | u8   | 0xA5                                    |
| 1   | 1   | `version`    | u8   | 0x01                                    |
| 2   | 1   | `node_id`    | u8   | sender id                               |
| 3   | 1   | `msg_type`   | u8   | 0x20 = rssi-demo                        |
| 4   | 4   | `seq`        | u32  | sequence number                         |
| 8   | 4   | `uptime_ms`  | u32  | ms since sender boot                    |
| 12  | 2   | `tx_dbm_x10` | s16  | **actual** tx power × 10 (−40 = −4.0 dBm)|
| 14  | 2   | `reserved`   | u16  | 0                                       |
| 16  | 4   | `crc32`      | u32  | CRC32 (zlib) of bytes 0..15             |

The bridge emits the decoded power as `fields.tx_dbm` (a float in dBm).

## What the page uses

- `obj.rssi` — received signal strength (dBm), straight from the ESP-NOW packet.
- `obj.gap` — packets missing since the last one; the page counts these as loss.
- `obj.fields.tx_dbm` — the sender’s current transmit power.

## TX power

The sender’s button steps `wifi.radio.tx_power` through `[-12, -4, 4, 10]` dBm,
then **reads the value back** and sends whatever the radio actually accepted —
the C3 clamps to the levels it supports, so the readout is the true power, not
the requested one.
