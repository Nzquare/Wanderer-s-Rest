#!/usr/bin/env node
"use strict";

/**
 * Print bridge for Wanderer's Rest — a tiny local HTTP server that relays
 * raw ESC/POS bytes to a WiFi thermal printer over a plain TCP socket.
 *
 * Why this exists: a browser (iPad Safari included) can only print
 * through the OS print dialog, which requires the printer to support
 * AirPrint. A thermal printer that just has a WiFi IP and listens for raw
 * ESC/POS bytes on a TCP port (commonly 9100) never shows up in that
 * dialog at all. Browsers CAN make a plain HTTP fetch() to another device
 * on the same LAN, though — so the app sends the receipt/ticket bytes
 * here instead, and this program does the one thing a browser can't: open
 * a raw socket to the printer and write them.
 *
 * Setup:
 *   1. Run this on a PC/Mac that's always on and on the same WiFi as the
 *      printer (and as the iPad/tablet using the POS).
 *        node server.js
 *   2. Find that computer's LAN IP (e.g. `ipconfig` on Windows, `ifconfig`
 *      / System Settings → Wi-Fi → Details on Mac) and note this port
 *      (default 9123).
 *   3. In Wanderer's Rest → Back Office → Settings → Checkout → Network
 *      thermal printer, set:
 *        Print bridge URL: http://<that computer's LAN IP>:9123
 *        Printer IP / Port: the thermal printer's own WiFi IP (and its
 *          raw-printing port — check the printer's own network settings
 *          page/manual; 9100 is the common default, used here too).
 *
 * No dependencies — just Node's built-in http/net modules, so there's
 * nothing to `npm install` beyond having Node itself.
 */

const http = require("http");
const net = require("net");

const PORT = process.env.PRINT_BRIDGE_PORT ? Number(process.env.PRINT_BRIDGE_PORT) : 9123;
const PRINT_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

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

const server = http.createServer((req, res) => {
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
});

server.listen(PORT, () => {
  console.log(`Print bridge listening on http://0.0.0.0:${PORT}`);
  console.log(`Set this as the "Print bridge URL" in Back Office → Settings → Checkout.`);
});
