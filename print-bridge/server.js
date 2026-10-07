#!/usr/bin/env node
"use strict";

/**
 * Print bridge for Wanderer's Rest — a tiny local HTTP(S) server that
 * relays raw ESC/POS bytes to a WiFi thermal printer over a plain TCP
 * socket.
 *
 * Why this exists: a browser (iPad Safari included) can only print
 * through the OS print dialog, which requires the printer to support
 * AirPrint. A thermal printer that just has a WiFi IP and listens for raw
 * ESC/POS bytes on a TCP port (commonly 9100) never shows up in that
 * dialog at all. Browsers CAN make a plain fetch() to another device on
 * the same LAN, though — so the app sends the receipt/ticket bytes here
 * instead, and this program does the one thing a browser can't: open a
 * raw socket to the printer and write them.
 *
 * Why HTTPS too: Wanderer's Rest is served over https:// in production.
 * A page loaded over https:// is blocked by the browser (mixed content)
 * from fetching a plain http:// address, even to another device on the
 * same WiFi, with no user-facing override — this is what "kitchen ticket
 * print failed: couldn't reach the print bridge" usually means even when
 * the IP/port are correct. So on first run this also generates a
 * self-signed certificate and starts a second, HTTPS listener; visiting
 * that address once in Safari (see below) tells it to trust this
 * specific bridge, after which fetches from the https:// app succeed.
 *
 * Setup:
 *   1. In this folder, run `npm install` once (pulls in a small library
 *      used only to generate the self-signed certificate below).
 *   2. Run this on a PC/Mac that's always on and on the same WiFi as the
 *      printer (and as the iPad/tablet using the POS):
 *        node server.js
 *   3. Find that computer's LAN IP (e.g. `ipconfig` on Windows, `ifconfig`
 *      / System Settings → Wi-Fi → Details on Mac) — also printed by this
 *      program itself on startup.
 *   4. If the app is loaded over https:// (the normal case): on the
 *      iPad/tablet, open Safari and visit https://<that IP>:9124/health
 *      once. Tap "Show Details" → "visit this website" to accept the
 *      one-time warning (it's just because the certificate is
 *      self-signed, not because anything's actually wrong). You only
 *      need to do this once per device.
 *   5. In Wanderer's Rest → Back Office → Settings → Checkout → Network
 *      thermal printer, set:
 *        Print bridge URL: https://<that computer's LAN IP>:9124
 *          (or http://<IP>:9123 if the app itself is loaded over plain
 *          http://, e.g. testing locally — then step 4 isn't needed)
 *        Printer IP / Port: the thermal printer's own WiFi IP (and its
 *          raw-printing port — check the printer's own network settings
 *          page/manual; 9100 is the common default, used here too).
 */

const http = require("http");
const https = require("https");
const net = require("net");
const os = require("os");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PRINT_BRIDGE_PORT ? Number(process.env.PRINT_BRIDGE_PORT) : 9123;
const HTTPS_PORT = process.env.PRINT_BRIDGE_HTTPS_PORT
  ? Number(process.env.PRINT_BRIDGE_HTTPS_PORT)
  : 9124;
const PRINT_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const CERT_PATH = path.join(__dirname, "cert.pem");
const KEY_PATH = path.join(__dirname, "key.pem");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

function handlePrint(req, res) {
  let body = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on("end", () => {
    if (tooLarge) return;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
    const ip = parsed && parsed.ip;
    const data = parsed && parsed.data;
    const port = Number(parsed && parsed.port) || 9100;
    if (!ip || typeof ip !== "string") {
      sendJson(res, 400, { error: "Missing printer ip" });
      return;
    }
    let bytes;
    try {
      bytes = Buffer.from(data, "base64");
    } catch {
      sendJson(res, 400, { error: "Invalid data (expected base64)" });
      return;
    }
    if (bytes.length === 0) {
      sendJson(res, 400, { error: "Empty print data" });
      return;
    }

    const socket = new net.Socket();
    let settled = false;
    const finish = (status, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socket.destroy();
      sendJson(res, status, result);
    };
    const timeoutId = setTimeout(() => {
      finish(504, { error: `Timed out connecting to ${ip}:${port}` });
    }, PRINT_TIMEOUT_MS);
    socket.on("error", (err) => {
      finish(502, { error: `Could not reach printer at ${ip}:${port}: ${err.message}` });
    });
    socket.connect(port, ip, () => {
      socket.write(bytes, () => finish(200, { ok: true }));
    });
  });
}

function requestHandler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && req.url === "/print") {
    handlePrint(req, res);
    return;
  }
  sendJson(res, 404, { error: "Not found" });
}

/** Every non-internal IPv4 address this machine has — usually just the
 * WiFi adapter's, but a laptop can have more than one (WiFi + Ethernet,
 * a VPN, etc.), so the certificate covers all of them rather than
 * guessing which one the app will be pointed at. */
function localIPv4Addresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

/**
 * Generates (once, then reuses from disk) a self-signed certificate for
 * the HTTPS listener. Cached to disk rather than regenerated on every
 * start — a new certificate would mean the "trust this device once" step
 * in Safari has to be redone after every restart, since Safari's
 * exception is tied to the exact certificate.
 */
async function loadOrCreateCertificate() {
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    return { cert: fs.readFileSync(CERT_PATH, "utf8"), key: fs.readFileSync(KEY_PATH, "utf8") };
  }
  let selfsigned;
  try {
    selfsigned = require("selfsigned");
  } catch {
    return null;
  }
  const ips = localIPv4Addresses();
  const pems = await selfsigned.generate([{ name: "commonName", value: "print-bridge.local" }], {
    keySize: 2048,
    days: 3650,
    algorithm: "sha256",
    extensions: [
      { name: "basicConstraints", cA: true },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
          ...ips.map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });
  fs.writeFileSync(CERT_PATH, pems.cert);
  fs.writeFileSync(KEY_PATH, pems.private);
  return { cert: pems.cert, key: pems.private };
}

async function main() {
  const httpServer = http.createServer(requestHandler);
  httpServer.listen(PORT);

  const ips = localIPv4Addresses();
  const ipList = ips.length > 0 ? ips.join(", ") : "(couldn't detect a LAN IP — run ipconfig/ifconfig)";

  console.log(`Print bridge (HTTP) listening on http://0.0.0.0:${PORT}`);
  console.log(`This computer's LAN IP address(es): ${ipList}`);

  const cert = await loadOrCreateCertificate();
  if (cert) {
    const httpsServer = https.createServer(cert, requestHandler);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`Print bridge (HTTPS) listening on https://0.0.0.0:${HTTPS_PORT}`);
      console.log("");
      console.log("If Wanderer's Rest loads as https:// in your browser (the normal case):");
      console.log(`  1. On the iPad/tablet, open Safari and visit https://<this computer's IP>:${HTTPS_PORT}/health`);
      console.log('     once, then tap "Show Details" -> "visit this website" on the warning.');
      console.log(`  2. Set "Print bridge URL" in Settings to https://<this computer's IP>:${HTTPS_PORT}`);
      console.log("");
      console.log("If it loads as plain http://, just use the HTTP address/port above instead.");
    });
  } else {
    console.log("");
    console.log('HTTPS not available yet — run "npm install" in this folder and restart to enable it.');
    console.log("Needed if Wanderer's Rest loads as https:// in your browser (the normal case) —");
    console.log("otherwise the browser silently blocks requests to this bridge's plain http:// address.");
  }
}

main();
