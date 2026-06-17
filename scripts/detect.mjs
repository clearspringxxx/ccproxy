#!/usr/bin/env node
/**
 * Proxy Detection Engine for Claude Code
 *
 * Network-layer domain classification (no hardcoded domain lists):
 *   - Direct TCP probe with speed measurement
 *   - 3-attempt retry to prevent false positives
 *   - Speed threshold: < 500ms = fast, >= 500ms = slow
 *
 * Proxy detection:
 *   - Process scan (20+ proxy software)
 *   - Dynamic port discovery via netstat
 *   - HTTP CONNECT validation
 *
 * Usage:
 *   node detect.mjs                         # full detection report
 *   node detect.mjs --json                  # JSON output
 *   node detect.mjs --test-domain <domain>  # test domain connectivity (3 attempts)
 *   node detect.mjs --test-proxy <host:port> # test proxy port reachability
 *   node detect.mjs --validate <host:port>  # HTTP CONNECT validation
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { argv } from "process";
import { createConnection } from "net";
import { request as httpRequest } from "http";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ── Constants ───────────────────────────────────────────────────────
const SPEED_THRESHOLD_MS = 500;   // Direct connection speed threshold
const CONNECT_TIMEOUT_MS = 3000;  // TCP probe timeout
const RETRY_COUNT = 3;            // Number of attempts for domain test
const RETRY_DELAY_MS = 1000;      // Delay between retries

// ── Known proxy software ────────────────────────────────────────────
const PROXY_SOFTWARE = [
  { name: "Clash Verge",       patterns: ["clash-verge", "verge-mihomo", "clash-verge-service"], defaultPort: 7897, type: "http" },
  { name: "Clash Verge Rev",   patterns: ["clash-verge-rev", "verge-mihomo"],        defaultPort: 7897, type: "http" },
  { name: "Clash for Windows", patterns: ["clash-for-windows"],                  defaultPort: 7890, type: "http" },
  { name: "Clash Meta",        patterns: ["clash-meta", "mihomo"],               defaultPort: 7890, type: "http" },
  { name: "Fast Client",       patterns: ["fast_client", "fastclient"],          defaultPort: 10808, type: "http" },
  { name: "V2Ray",             patterns: ["v2ray", "v2ray-core"],                defaultPort: 10809, type: "http" },
  { name: "V2RayN",            patterns: ["v2rayn"],                             defaultPort: 10809, type: "http" },
  { name: "V2RayA",            patterns: ["v2raya"],                             defaultPort: 2017, type: "http" },
  { name: "Xray",              patterns: ["xray", "xray-core"],                  defaultPort: 10809, type: "http" },
  { name: "Shadowsocks",       patterns: ["ss-local", "shadowsocks"],            defaultPort: 1080, type: "socks5" },
  { name: "ShadowsocksR",      patterns: ["shadowsocksr", "ssr-local"],          defaultPort: 1080, type: "socks5" },
  { name: "Trojan",            patterns: ["trojan", "trojan-go"],                defaultPort: 1080, type: "socks5" },
  { name: "Hysteria",          patterns: ["hysteria", "hysteria2"],              defaultPort: 1080, type: "socks5" },
  { name: "Sing-box",          patterns: ["sing-box", "singbox"],                defaultPort: 2080, type: "http" },
  { name: "NekoRay",           patterns: ["nekoray", "nekobox"],                 defaultPort: 2080, type: "http" },
  { name: "Hiddify",           patterns: ["hiddify"],                            defaultPort: 2080, type: "http" },
  { name: "Proxifier",         patterns: ["proxifier"],                          defaultPort: 1080, type: "socks5" },
  { name: "Surge",             patterns: ["surge"],                              defaultPort: 6152, type: "http" },
  { name: "Quantumult X",      patterns: ["quantumultx", "quantumult-x"],        defaultPort: 9527, type: "http" },
  { name: "Stash",             patterns: ["stash"],                              defaultPort: 6152, type: "http" },
];

// ── Helpers ─────────────────────────────────────────────────────────

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10000 }).trim();
  } catch {
    return "";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probePort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.setTimeout(timeoutMs);
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
    sock.on("error", () => { sock.destroy(); resolve(false); });
  });
}

// ── Domain connectivity test (network-layer, no lists) ──────────────
// Returns: { reachable: bool, fast: bool, latencyMs: number, attempts: number }
async function testDomainDirect(hostname, port = 443, attempts = RETRY_COUNT) {
  const results = [];

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(RETRY_DELAY_MS);

    const start = Date.now();
    const reachable = await new Promise((resolve) => {
      const sock = createConnection({ host: hostname, port }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.setTimeout(CONNECT_TIMEOUT_MS);
      sock.on("timeout", () => { sock.destroy(); resolve(false); });
      sock.on("error", () => { sock.destroy(); resolve(false); });
    });

    const latency = Date.now() - start;
    results.push({ reachable, latencyMs: latency });
  }

  const reachable = results.some((r) => r.reachable);
  const fast = results.some((r) => r.reachable && r.latencyMs < SPEED_THRESHOLD_MS);
  const bestLatency = Math.min(...results.filter((r) => r.reachable).map((r) => r.latencyMs));

  return {
    reachable,
    fast,
    latencyMs: reachable ? bestLatency : null,
    attempts: results.length,
    results,
  };
}

// ── Process detection ───────────────────────────────────────────────
function detectProcesses(softwareList) {
  const isWin = process.platform === "win32";
  const tasklist = isWin ? sh("tasklist /FO CSV /NH 2>nul") : sh("ps aux 2>/dev/null");
  if (!tasklist) return [];

  const found = [];
  for (const sw of softwareList) {
    for (const pat of sw.patterns) {
      const escaped = pat.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      if (new RegExp(escaped, "i").test(tasklist)) {
        found.push({ ...sw, matchedPattern: pat });
        break;
      }
    }
  }
  return found;
}

// ── Dynamic port discovery ──────────────────────────────────────────
function discoverListeningPorts() {
  const isWin = process.platform === "win32";
  const lines = isWin ? sh("netstat -ano -p tcp 2>nul") : sh("ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null");
  if (!lines) return [];

  const ports = new Set();
  for (const line of lines.split("\n")) {
    const m = isWin
      ? line.match(/TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/)
      : line.match(/LISTEN\s+\S+\s+\S+\s+\S+:(\d+)\s/);
    if (m) {
      const port = parseInt(m[1], 10);
      const pid = isWin ? parseInt(m[2], 10) : 0;
      if (port >= 1024 && port <= 65535) {
        ports.add(`${port}:${pid}`);
      }
    }
  }

  return [...ports].map((s) => {
    const [port, pid] = s.split(":");
    return { port: parseInt(port, 10), pid: parseInt(pid, 10) };
  });
}

// ── Batch process name resolution ───────────────────────────────────
function batchGetProcessNames(pids) {
  const result = {};
  if (!pids.length) return result;
  const pidSet = new Set(pids);

  if (process.platform === "win32") {
    const out = sh("tasklist /FO CSV /NH 2>nul");
    for (const line of out.split("\n")) {
      const m = line.match(/"([^"]+)","(\d+)"/);
      if (m) {
        const pid = parseInt(m[2], 10);
        if (pidSet.has(pid)) result[pid] = m[1].toLowerCase();
      }
    }
  } else {
    for (const pid of pids) {
      const out = sh(`ps -p ${pid} -o comm= 2>/dev/null`);
      if (out) result[pid] = out.toLowerCase();
    }
  }
  return result;
}

// ── Load user config ────────────────────────────────────────────────
function loadConfig() {
  const configPath = join(homedir(), ".claude", "skills", "ccproxy", "config.json");
  try {
    if (existsSync(configPath)) return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {}
  return null;
}

// ── HTTP CONNECT validation ─────────────────────────────────────────
function validateProxyHttpConnect(proxyHost, proxyPort, testHost = "github.com", timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = httpRequest({
      host: proxyHost,
      port: proxyPort,
      method: "CONNECT",
      path: `${testHost}:443`,
      timeout: timeoutMs,
    });
    req.on("connect", (res, socket) => {
      socket.destroy();
      resolve({ ok: res.statusCode === 200, statusCode: res.statusCode });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    req.end();
  });
}

// ── Full proxy detection ────────────────────────────────────────────
async function detectProxy(softwareList) {
  const detected = detectProcesses(softwareList);
  const listeningPorts = discoverListeningPorts();
  const listeningPortSet = new Set(listeningPorts.map((p) => p.port));

  // Probe extra ports (detected software defaults) not in listening list
  const extraPorts = [...new Set(detected.map((d) => d.defaultPort))]
    .filter((p) => !listeningPortSet.has(p));
  const extraOpen = [];
  if (extraPorts.length > 0) {
    const results = await Promise.all(
      extraPorts.map(async (port) => ({ port, open: await probePort("127.0.0.1", port) }))
    );
    for (const r of results) {
      if (r.open) extraOpen.push({ host: "127.0.0.1", port: r.port });
    }
  }

  // Combine open ports
  const openPorts = [
    ...listeningPorts.map((lp) => ({ host: "127.0.0.1", port: lp.port })),
    ...extraOpen,
  ].sort((a, b) => a.port - b.port);

  // Build port->owner map
  const uniquePids = [...new Set(listeningPorts.map((lp) => lp.pid).filter((p) => p > 0))];
  const pidToName = batchGetProcessNames(uniquePids);
  const portOwners = {};
  for (const lp of listeningPorts) {
    const name = pidToName[lp.pid] || "";
    if (name) portOwners[lp.port] = { pid: lp.pid, process: name };
  }

  // Match software with ports
  const matches = [];
  for (const sw of detected) {
    let matchedPort = null;
    for (const [port, owner] of Object.entries(portOwners)) {
      if (sw.patterns.some((p) => owner.process.includes(p.toLowerCase()))) {
        matchedPort = parseInt(port, 10);
        break;
      }
    }
    if (!matchedPort && openPorts.some((p) => p.port === sw.defaultPort)) {
      matchedPort = sw.defaultPort;
    }
    matches.push({
      software: sw.name,
      port: matchedPort || sw.defaultPort,
      portOpen: !!matchedPort,
      type: sw.type,
      owner: matchedPort && portOwners[matchedPort] ? portOwners[matchedPort] : null,
    });
  }

  // Validate candidate ports via HTTP CONNECT for HTTP-type proxies
  const validated = [];
  for (const m of matches) {
    if (m.portOpen && m.type === "http") {
      const result = await validateProxyHttpConnect("127.0.0.1", m.port);
      validated.push({ ...m, proxyValid: result.ok });
    } else {
      validated.push({ ...m, proxyValid: m.portOpen ? null : false });
    }
  }

  // Deduplicate by port — same port claimed by multiple software entries
  // Keep the first entry (higher priority in PROXY_SOFTWARE list)
  const seenPorts = new Set();
  const deduped = [];
  for (const m of validated) {
    if (!seenPorts.has(m.port)) {
      seenPorts.add(m.port);
      deduped.push(m);
    }
  }

  // Recommendation: prefer HTTP CONNECT validated ports, then fall back to any open port
  const best = deduped.find((m) => m.proxyValid === true)
    || deduped.find((m) => m.portOpen);
  const recommended = best
    ? { host: "127.0.0.1", port: best.port, type: best.type, software: best.software }
    : null;

  return { detected: deduped, openPorts, portOwners, recommended };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const testDomain = args.includes("--test-domain") ? args[args.indexOf("--test-domain") + 1] : null;
  const testProxy = args.includes("--test-proxy") ? args[args.indexOf("--test-proxy") + 1] : null;
  const validateTarget = args.includes("--validate") ? args[args.indexOf("--validate") + 1] : null;

  // Load user config for custom software
  const config = loadConfig();
  const softwareList = [
    ...PROXY_SOFTWARE,
    ...(config?.software ? [config.software] : []),
  ];

  // ── Test domain mode ──
  if (testDomain) {
    const hostname = testDomain.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    const result = await testDomainDirect(hostname);
    const needsProxy = !result.fast;

    if (jsonMode) {
      console.log(JSON.stringify({ hostname, ...result, needsProxy }, null, 2));
    } else {
      if (!result.reachable) {
        console.log(`[BLOCKED] ${hostname} - unreachable (${result.attempts} attempts) -> needs proxy`);
      } else if (!result.fast) {
        console.log(`[SLOW] ${hostname} - ${result.latencyMs}ms (threshold: ${SPEED_THRESHOLD_MS}ms) -> needs proxy`);
      } else {
        console.log(`[FAST] ${hostname} - ${result.latencyMs}ms -> direct connection`);
      }
    }
    process.exit(needsProxy ? 1 : 0);
  }

  // ── Test proxy mode ──
  if (testProxy) {
    const [host, portStr] = testProxy.split(":");
    const port = parseInt(portStr || "7897", 10);
    const open = await probePort(host, port);
    if (jsonMode) {
      console.log(JSON.stringify({ host, port, reachable: open }));
    } else {
      console.log(open ? `OK ${host}:${port} reachable` : `FAIL ${host}:${port} not reachable`);
    }
    process.exit(open ? 0 : 1);
  }

  // ── Validate mode ──
  if (validateTarget) {
    const [host, portStr] = validateTarget.split(":");
    const port = parseInt(portStr || "7897", 10);
    const result = await validateProxyHttpConnect(host, port);
    if (jsonMode) {
      console.log(JSON.stringify({ host, port, ...result }));
    } else {
      console.log(result.ok
        ? `VALID ${host}:${port} can tunnel to github.com:443`
        : `INVALID ${host}:${port} - ${result.error || result.statusCode}`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  // ── Full detection ──
  const startTime = Date.now();
  const result = await detectProxy(softwareList);
  const elapsed = Date.now() - startTime;

  const output = {
    timestamp: new Date().toISOString(),
    elapsedMs: elapsed,
    ...result,
    config: config ? { mode: config.mode, proxy: config.proxy } : null,
  };

  if (jsonMode) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log("=== Proxy Detection Report ===\n");

    if (result.detected.length > 0) {
      console.log("Detected Software:");
      for (const m of result.detected) {
        const icon = m.portOpen ? "[OK]" : "[WARN]";
        const owner = m.owner ? ` (${m.owner.process}, pid:${m.owner.pid})` : "";
        console.log(`  ${icon} ${m.software} -> port ${m.port} [${m.type}]${owner}`);
      }
    } else {
      console.log("No known proxy software detected.");
    }

    console.log();

    if (result.recommended) {
      console.log(`Recommended: ${result.recommended.host}:${result.recommended.port} (${result.recommended.software})`);
    } else {
      console.log("No proxy available.");
    }

    console.log(`\nDone in ${elapsed}ms`);
  }
}

// Export for use by other scripts
export { testDomainDirect, detectProxy, loadConfig, probePort, sleep, RETRY_COUNT };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Detection failed:", err.message);
    process.exit(1);
  });
}
