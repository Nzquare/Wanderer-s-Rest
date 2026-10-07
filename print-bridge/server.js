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
 * same WiFi, with no user-facing override — this is what "couldn't reach
 * the print bridge" usually means even when the IP/port are correct.
 *
 * Why a local CA instead of just a self-signed cert: a self-signed
 * certificate you manually "trust this once" in Safari only grants that
 * exception to the regular Safari browsing context — it does NOT carry
 * over to a web app added to the Home Screen (a separate, standalone
 * context on iOS), so printing from the Home Screen icon kept failing
 * even after trusting the warning in Safari. Issuing the bridge's own
 * certificate from a locally-generated Certificate Authority, and
 * installing *that CA* once as a trusted profile (a real iOS device
 * setting, not a per-site browser exception), makes every context on
 * the device — Safari tabs, Home Screen icons, everything — trust it
 * permanently, with no more warning screens at all.
 *
 * Setup:
 *   1. In this folder, run `npm install` once (pulls in a small library
 *      used only to generate certificates below).
 *   2. Run this on a PC/Mac that's always on and on the same WiFi as the
 *      printer (and as the iPad/tablet using the POS):
 *        node server.js
 *   3. It prints this computer's LAN IP and a URL for the next step.
 *   4. If the app is loaded over https:// (the normal case) — on the
 *      iPad/tablet, once per device: open Safari and visit
 *      http://<that IP>:9123/ca-profile, tap "Allow" to download the
 *      profile, then go to Settings app -> General -> VPN & Device
 *      Management -> tap the downloaded profile -> Install (enter your
 *      passcode). Then go to Settings -> General -> About -> Certificate
 *      Trust Settings, and turn on full trust for "Wanderer's Rest Print
 *      Bridge CA". That's it — permanently, on that device, for this
 *      bridge, in every app including a Home Screen icon.
 *   5. In Wanderer's Rest → Back Office → Settings → Checkout → Network
 *      thermal printer, set:
 *        Print bridge URL: https://<that computer's LAN IP>:9124
 *          (or http://<IP>:9123 if the app itself is loaded over plain
 *          http:// — e.g. testing locally — then step 4 isn't needed)
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
const crypto = require("crypto");

const PORT = process.env.PRINT_BRIDGE_PORT ? Number(process.env.PRINT_BRIDGE_PORT) : 9123;
const HTTPS_PORT = process.env.PRINT_BRIDGE_HTTPS_PORT
  ? Number(process.env.PRINT_BRIDGE_HTTPS_PORT)
  : 9124;
const PRINT_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const CA_CERT_PATH = path.join(__dirname, "ca-cert.pem");
const CA_KEY_PATH = path.join(__dirname, "ca-key.pem");
const CERT_PATH = path.join(__dirname, "cert.pem");
const KEY_PATH = path.join(__dirname, "key.pem");
const CA_NAME = "Wanderer's Rest Print Bridge CA";

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

/** The CA profile only needs to be reachable over plain HTTP — a direct
 * Safari address-bar visit/download is a top-level navigation, not a
 * page fetch()/subresource load, so the https-page mixed-content rule
 * that blocks /print and /health from the app doesn't apply here. That
 * also sidesteps the chicken-and-egg problem of needing HTTPS trust
 * before you've installed the thing that grants HTTPS trust. */
function handleCaProfile(req, res) {
  let caCertPem;
  try {
    caCertPem = fs.readFileSync(CA_CERT_PATH, "utf8");
  } catch {
    sendJson(res, 404, { error: "No CA certificate yet — restart the bridge after npm install" });
    return;
  }
  const profile = buildMobileConfig(caCertPem);
  res.writeHead(200, {
    "Content-Type": "application/x-apple-aspen-config",
    "Content-Disposition": 'attachment; filename="wanderers-rest-print-bridge.mobileconfig"',
    ...CORS_HEADERS,
  });
  res.end(profile);
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
  if (req.method === "GET" && req.url === "/ca-profile") {
    handleCaProfile(req, res);
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

/** A device-installable configuration profile (.mobileconfig — an Apple
 * property-list XML format) carrying just the CA's PUBLIC certificate
 * (never its private key) as a trusted root. The PEM's base64 body is
 * already the base64 of the DER-encoded certificate iOS expects inside
 * a <data> element — no re-encoding needed, just strip the PEM header/
 * footer lines. */
function buildMobileConfig(caCertPem) {
  const base64 = caCertPem
    .split("\n")
    .filter((line) => line && !line.startsWith("-----"))
    .join("\n");
  const certUuid = crypto.randomUUID().toUpperCase();
  const profileUuid = crypto.randomUUID().toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key>
      <string>ca.cer</string>
      <key>PayloadContent</key>
      <data>${base64}</data>
      <key>PayloadDescription</key>
      <string>Trusts the local print bridge so kitchen tickets and receipts can print, from any browser tab or Home Screen icon.</string>
      <key>PayloadDisplayName</key>
      <string>${CA_NAME}</string>
      <key>PayloadIdentifier</key>
      <string>com.wanderersrest.printbridge.ca</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>${certUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Trusts this cafe's local print bridge for Wanderer's Rest.</string>
  <key>PayloadDisplayName</key>
  <string>Wanderer's Rest Print Bridge</string>
  <key>PayloadIdentifier</key>
  <string>com.wanderersrest.printbridge</string>
  <key>PayloadRemovable</key>
  <true/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${profileUuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}

/** True if the certificate at `certPath` expires within 30 days (or
 * can't be read/parsed at all) — used to auto-reissue the leaf
 * certificate (never the CA) well before Apple's devices would start
 * silently rejecting it, with no manual step needed on any device. */
function isExpiringSoon(certPath) {
  try {
    const cert = new crypto.X509Certificate(fs.readFileSync(certPath));
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    return new Date(cert.validTo).getTime() - Date.now() < THIRTY_DAYS_MS;
  } catch {
    return true;
  }
}

/**
 * Loads (or creates once, then reuses from disk) the local Certificate
 * Authority, and separately loads (or (re)creates) the server leaf
 * certificate it signs. These are intentionally two independent caches,
 * not one: regenerating the CA would mean the install-the-profile step
 * on every device has to be redone (a device trusts this exact CA
 * certificate, not "whatever the bridge currently has"), but the leaf
 * certificate alone is expected to need reissuing occasionally — it
 * can't be valid for more than ~820 days at a time (see below) — and
 * that should never force every device to redo the CA install too.
 */
async function loadOrCreateCertificates() {
  let selfsigned;
  try {
    selfsigned = require("selfsigned");
  } catch {
    return null;
  }

  const notBefore = new Date();
  const addDays = (days) => new Date(notBefore.getTime() + days * 24 * 60 * 60 * 1000);

  let ca;
  if (fs.existsSync(CA_CERT_PATH) && fs.existsSync(CA_KEY_PATH)) {
    ca = { cert: fs.readFileSync(CA_CERT_PATH, "utf8"), private: fs.readFileSync(CA_KEY_PATH, "utf8") };
  } else {
    // selfsigned v5 has no "days" option (older docs/versions did) — it's
    // notBeforeDate/notAfterDate only, defaulting to just 365 days if
    // omitted, so this has to be explicit.
    ca = await selfsigned.generate([{ name: "commonName", value: CA_NAME }], {
      keySize: 2048,
      notBeforeDate: notBefore,
      notAfterDate: addDays(3650),
      algorithm: "sha256",
      extensions: [
        { name: "basicConstraints", cA: true, critical: true },
        { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
      ],
    });
    fs.writeFileSync(CA_CERT_PATH, ca.cert);
    fs.writeFileSync(CA_KEY_PATH, ca.private);
  }

  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH) && !isExpiringSoon(CERT_PATH)) {
    return { cert: fs.readFileSync(CERT_PATH, "utf8"), key: fs.readFileSync(KEY_PATH, "utf8") };
  }

  const ips = localIPv4Addresses();
  const server = await selfsigned.generate([{ name: "commonName", value: "print-bridge.local" }], {
    keySize: 2048,
    // Apple enforces a ~825-day maximum validity on any TLS server
    // certificate it evaluates — even one chaining to a CA you've
    // manually installed and fully trusted — and silently rejects
    // anything longer (no warning, just a failed connection). The CA
    // certificate itself is exempt from that rule (it's a root, not a
    // server cert), so only this leaf needs to stay under the limit.
    notBeforeDate: notBefore,
    notAfterDate: addDays(820),
    algorithm: "sha256",
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
      // Also required by Apple's trust evaluation for a server
      // certificate — without it, iOS rejects the cert the same
      // silent way as the validity issue above.
      { name: "extKeyUsage", serverAuth: true },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
          ...ips.map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
    ca: { key: ca.private, cert: ca.cert },
  });
  fs.writeFileSync(CERT_PATH, server.cert);
  fs.writeFileSync(KEY_PATH, server.private);
  return { cert: server.cert, key: server.private };
}

async function main() {
  const httpServer = http.createServer(requestHandler);
  httpServer.listen(PORT);

  const ips = localIPv4Addresses();
  const ipList = ips.length > 0 ? ips.join(", ") : "(couldn't detect a LAN IP — run ipconfig/ifconfig)";
  const primaryIp = ips[0] ?? "<this computer's IP>";

  console.log(`Print bridge (HTTP) listening on http://0.0.0.0:${PORT}`);
  console.log(`This computer's LAN IP address(es): ${ipList}`);

  const cert = await loadOrCreateCertificates();
  if (cert) {
    const httpsServer = https.createServer(cert, requestHandler);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`Print bridge (HTTPS) listening on https://0.0.0.0:${HTTPS_PORT}`);
      console.log("");
      console.log("If Wanderer's Rest loads as https:// in your browser (the normal case),");
      console.log("do this once per device (works for Safari tabs AND Home Screen icons):");
      console.log(`  1. On the iPad/tablet, open Safari and visit http://${primaryIp}:${PORT}/ca-profile`);
      console.log('     — tap "Allow" to download the profile.');
      console.log("  2. Open the Settings app -> General -> VPN & Device Management -> tap the");
      console.log('     downloaded profile -> Install (enter your passcode).');
      console.log("  3. Then Settings -> General -> About -> Certificate Trust Settings, and turn");
      console.log(`     on full trust for "${CA_NAME}".`);
      console.log(`  4. Set "Print bridge URL" in Settings to https://${primaryIp}:${HTTPS_PORT}`);
      console.log("");
      console.log("If it loads as plain http://, just use the HTTP address/port above instead —");
      console.log("none of the above is needed then.");
    });
  } else {
    console.log("");
    console.log('HTTPS not available yet — run "npm install" in this folder and restart to enable it.');
    console.log("Needed if Wanderer's Rest loads as https:// in your browser (the normal case) —");
    console.log("otherwise the browser silently blocks requests to this bridge's plain http:// address.");
  }
}

main();
