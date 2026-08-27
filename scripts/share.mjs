#!/usr/bin/env node
/**
 * Point Markova at a forwarded address so somebody else can reach it.
 *
 * The web app is not self-contained: the browser it runs in calls the API
 * directly, so forwarding port 3001 alone gives the visitor a login page whose
 * every request goes to *their* localhost:3000. That is the "Cannot reach the
 * server" they see, and the CORS errors underneath it.
 *
 * Two ports have to be forwarded and two settings have to agree:
 *
 *   web/.env.local   NEXT_PUBLIC_API_URL  → the forwarded API, ending in /api
 *   backend/.env     CORS_ORIGINS         → the forwarded web origin
 *
 * This writes both from one address and tells you what to restart.
 *
 *   node scripts/share.mjs https://v0k7pbb7-3001.inc1.devtunnels.ms
 *   node scripts/share.mjs --local          # put it back to localhost
 *
 * Nothing here hosts anything. Both servers keep running on this machine;
 * the tunnel only carries the traffic.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ENV = join(root, "web", ".env.local");
const API_ENV = join(root, "backend", ".env");

const LOCAL_WEB = "http://localhost:3001";
const LOCAL_API = "http://localhost:3000/api";

/**
 * The API's address, worked out from the web one.
 *
 * Every forwarding tool that gives a hostname per port encodes the port in
 * it — `<id>-3001.<region>.devtunnels.ms`, `<id>-3001.ngrok.io` — so the API
 * address is the same name with 3000 in place of 3001. Where the port is not
 * in the hostname there is nothing to infer, and the caller is asked.
 */
export function apiUrlFrom(webUrl) {
  const trimmed = webUrl.trim().replace(/\/+$/, "");
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // localhost:3001 → localhost:3000
  if (url.port === "3001") {
    url.port = "3000";
    return `${url.origin}/api`;
  }

  // <something>-3001.<rest> → <something>-3000.<rest>
  if (/-3001\./.test(url.hostname)) {
    url.hostname = url.hostname.replace("-3001.", "-3000.");
    return `${url.origin}/api`;
  }

  return null;
}

/** The value a key already has in an env file, or "" when it has none. */
export function readEnv(contents, key) {
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(contents);
  return match ? match[1].trim() : "";
}

/**
 * The origins the API should answer, with the forwarded one added.
 *
 * Added, not substituted: whatever is already in the file is there because
 * somebody put it there — a phone on the LAN, a second machine — and losing
 * it while sharing would break their setup silently.
 */
export function mergeOrigins(existing, ...wanted) {
  const seen = [
    ...existing.split(",").map((o) => o.trim()).filter(Boolean),
    ...wanted.filter(Boolean),
  ];
  return [...new Set(seen)].join(",");
}

/** Set one key in an env file, leaving every other line untouched. */
export function setEnv(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) return contents.replace(pattern, line);
  return `${contents.replace(/\n*$/, "")}\n${line}\n`;
}

function readOrEmpty(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function main() {
  const arg = process.argv[2];

  if (!arg || arg === "--help" || arg === "-h") {
    console.log(
      [
        "Usage:",
        "  node scripts/share.mjs <forwarded web address>",
        "  node scripts/share.mjs --local",
        "",
        "Example:",
        "  node scripts/share.mjs https://v0k7pbb7-3001.inc1.devtunnels.ms",
        "",
        "Forward BOTH 3001 and 3000, and make both public.",
      ].join("\n"),
    );
    process.exit(arg ? 0 : 1);
  }

  const local = arg === "--local";
  const webOrigin = local ? LOCAL_WEB : arg.trim().replace(/\/+$/, "");
  const apiUrl = local ? LOCAL_API : apiUrlFrom(webOrigin);

  if (!apiUrl) {
    console.error(
      [
        `Could not work out the API address from ${webOrigin}.`,
        "",
        "This expects the forwarded name to carry the port, the way dev",
        "tunnels and ngrok do: <id>-3001.<host>. Set both by hand instead:",
        "",
        "  web/.env.local   NEXT_PUBLIC_API_URL=<forwarded 3000>/api",
        "  backend/.env     CORS_ORIGINS=<forwarded 3001>",
      ].join("\n"),
    );
    process.exit(1);
  }

  // The web origin has to be allowed by the API. Localhost is kept so this
  // machine still works, and so is anything already configured.
  const apiEnv = readOrEmpty(API_ENV);
  const origins = mergeOrigins(
    readEnv(apiEnv, "CORS_ORIGINS"),
    LOCAL_WEB,
    "http://localhost:8081",
    local ? "" : webOrigin,
  );

  writeFileSync(WEB_ENV, setEnv(readOrEmpty(WEB_ENV), "NEXT_PUBLIC_API_URL", apiUrl));
  writeFileSync(API_ENV, setEnv(apiEnv, "CORS_ORIGINS", origins));

  console.log(local ? "Back to localhost.\n" : "Sharing.\n");
  console.log(`  web/.env.local  NEXT_PUBLIC_API_URL = ${apiUrl}`);
  console.log(`  backend/.env    CORS_ORIGINS        = ${origins}\n`);
  console.log("Restart both servers — NEXT_PUBLIC_* is read at build time,");
  console.log("so the web app will keep using the old address until it is.\n");
  if (!local) {
    console.log(`  Forward 3001 AND 3000, and set both to public visibility.`);
    console.log(`  Then send: ${webOrigin}`);
  }
}

// Only run when invoked directly, so the helpers above stay testable.
if (process.argv[1] && process.argv[1].endsWith("share.mjs")) main();
