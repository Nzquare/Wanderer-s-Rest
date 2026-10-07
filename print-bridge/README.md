# Print bridge

For a WiFi thermal printer that doesn't support AirPrint (e.g. the Barigan
PR-01W) — it won't show up in an iPad's or any browser's print picker,
because browsers can only print through the OS print dialog, and that
requires AirPrint. This printer just has a WiFi IP and listens for raw
ESC/POS bytes on a TCP port instead.

This little program bridges the two: the app sends it the print job over
plain HTTP(S) (something a browser *can* do to another device on the same
WiFi), and it relays those bytes to the printer over a raw TCP socket
(something only a program like this can do, not a browser).

## Setup

1. Make sure [Node.js](https://nodejs.org) (v18+) is installed on a PC or
   Mac that stays on and connected to the same WiFi network as both the
   printer and the iPad/tablet running the POS.
2. In this folder, run:
   ```
   npm install
   ```
   (only needed once — this pulls in a small library used to generate a
   certificate, see "About the HTTPS address" below).
3. Run:
   ```
   node server.js
   ```
   You should see something like:
   ```
   Print bridge (HTTP) listening on http://0.0.0.0:9123
   This computer's LAN IP address(es): 192.168.1.50
   Print bridge (HTTPS) listening on https://0.0.0.0:9124
   ```
   Leave this window open — closing it stops the bridge. Note the IP
   address it printed (yours will be different).
4. **If Wanderer's Rest opens with `https://` in the address bar** (true
   for the normal hosted version) — do this one-time step on the
   iPad/tablet:
   - Open Safari and go to `https://<the IP from step 3>:9124/health`
   - You'll see a warning that the connection isn't private — this is
     expected (it's a self-signed certificate, not a sign anything's
     wrong). Tap **Show Details**, then **visit this website**, and
     confirm. You should see `{"ok":true}`.
   - You only need to do this once per device, not every time.
5. In Wanderer's Rest, go to **Back Office → Settings → Checkout →
   Network thermal printer** and set:
   - **Print bridge URL**:
     - `https://<that computer's LAN IP>:9124` if you did step 4, or
     - `http://<that computer's LAN IP>:9123` if the app opens with plain
       `http://` instead (e.g. only while testing locally) — then step 4
       isn't needed at all.
   - **Printer IP**: the thermal printer's own WiFi IP address (check the
     printer's network settings page, usually printed on a self-test
     page, or in its manual/app).
   - **Printer port**: usually `9100` (the default raw-printing port most
     ESC/POS thermal printers use — check the printer's manual if kitchen
     tickets/receipts don't print).
6. Save, then try printing a kitchen ticket or receipt from the Cashier
   screen. It should go straight to the printer with no print dialog.

## About the HTTPS address

Wanderer's Rest normally loads over `https://`. Browsers (Safari
included) flatly refuse to let an `https://` page talk to a plain
`http://` address — even to another device on the same WiFi, with no
setting to allow it. That's "mixed content" blocking, and it's the most
common reason printing silently fails even when the IP/port are all
correct.

To get around that, this program also starts an HTTPS listener using a
certificate it generates for itself the first time it runs (saved as
`cert.pem`/`key.pem` in this folder — don't delete those, or you'll have
to redo the one-time Safari trust step). Because it signs its own
certificate instead of getting one from a trusted authority, every
browser will show a warning the first time — that's normal and expected
for a private, local-only tool like this; the "visit this website" step
in Setup above tells Safari to remember trusting this one bridge.

## Troubleshooting

- **"Couldn't reach the print bridge"** — the computer running
  `server.js` is off, asleep, not on the same WiFi, or a firewall is
  blocking incoming connections on port 9123/9124. On Windows, the first
  time you run it you may get a firewall prompt — allow access on
  "Private networks". Also double check you're using the `https://`
  address (port 9124) if the app itself loads as `https://` — see above.
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
