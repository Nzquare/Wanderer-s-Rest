# Print bridge

For a WiFi thermal printer that doesn't support AirPrint (e.g. the Barigan
PR-01W) — it won't show up in an iPad's or any browser's print picker,
because browsers can only print through the OS print dialog, and that
requires AirPrint. This printer just has a WiFi IP and listens for raw
ESC/POS bytes on a TCP port instead.

This little program bridges the two: the app sends it the print job over
plain HTTP (something a browser *can* do to another device on the same
WiFi), and it relays those bytes to the printer over a raw TCP socket
(something only a program like this can do, not a browser).

## Setup

1. Make sure [Node.js](https://nodejs.org) (v18+) is installed on a PC or
   Mac that stays on and connected to the same WiFi network as both the
   printer and the iPad/tablet running the POS.
2. In this folder, run:
   ```
   node server.js
   ```
   You should see `Print bridge listening on http://0.0.0.0:9123`. Leave
   this window open — closing it stops the bridge.
3. Find this computer's LAN IP address:
   - **Windows**: open Command Prompt, run `ipconfig`, look for "IPv4
     Address" under your WiFi adapter.
   - **Mac**: System Settings → Wi-Fi → Details (or `ifconfig en0` in
     Terminal), look for "inet".
4. In Wanderer's Rest, go to **Back Office → Settings → Checkout →
   Network thermal printer** and set:
   - **Print bridge URL**: `http://<this computer's LAN IP>:9123`
   - **Printer IP**: the thermal printer's own WiFi IP address (check the
     printer's network settings page, usually printed on a self-test
     page, or in its manual/app).
   - **Printer port**: usually `9100` (the default raw-printing port most
     ESC/POS thermal printers use — check the printer's manual if kitchen
     tickets/receipts don't print).
5. Save, then try printing a kitchen ticket or receipt from the Cashier
   screen. It should go straight to the printer with no print dialog.

## Troubleshooting

- **"Couldn't reach the print bridge"** — the computer running
  `server.js` is off, asleep, not on the same WiFi, or a firewall is
  blocking incoming connections on port 9123. On Windows, the first time
  you run it you may get a firewall prompt — allow access on
  "Private networks".
- **"Could not reach printer at ..."** — double-check the printer IP/port
  in Settings, and that the printer itself is on and connected to WiFi
  (most have a self-test/status print you can trigger from a button on
  the printer to show its current IP).
- **Printed, but garbled or blank** — try the other printer port, and if
  problems persist with non-English text, the printer's built-in
  character set may not support it; ESC/POS codepage support varies a lot
  between budget thermal printer models.

## Keeping it running automatically

For everyday use, you'll want this running in the background without
having to remember to start it:

- **Windows**: create a shortcut to `node server.js` (run from this
  folder) in `shell:startup` so it launches at login, or use Task
  Scheduler.
- **Mac**: use `launchd`, or a tool like [pm2](https://pm2.keymetrics.io/)
  (`npm install -g pm2` then `pm2 start server.js` and `pm2 save`).

This is optional — for a quick start, just leave a terminal window open
with `node server.js` running.
