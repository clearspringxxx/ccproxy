#!/usr/bin/env node
/**
 * Proxy Manager for Claude Code
 *
 * Commands:
 *   node proxy.mjs init     - Choose proxy mode (A/B/C)
 *   node proxy.mjs change   - Change proxy software/port
 *   node proxy.mjs start    - Manual trigger (mode C)
 *   node proxy.mjs status   - Show current config
 *   node proxy.mjs reset    - Reset all proxy config
 */

import { createInterface } from "readline";
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { testDomainDirect, detectProxy, loadConfig, probePort, sleep, RETRY_COUNT } from "./detect.mjs";

// ── Paths ───────────────────────────────────────────────────────────
const SKILL_DIR = join(homedir(), ".claude", "skills", "proxy");
const CONFIG_PATH = join(SKILL_DIR, "config.json");
const MARKER_START = "<!-- [proxy-skill:start] -->";
const MARKER_END = "<!-- [proxy-skill:end] -->";

// ── Proxy software list ─────────────────────────────────────────────
const SOFTWARE_LIST = [
  { name: "Clash Verge",       patterns: ["clash-verge"],   defaultPort: 7897,  type: "http" },
  { name: "Clash Verge Rev",   patterns: ["clash-verge-rev"], defaultPort: 7897, type: "http" },
  { name: "Clash for Windows", patterns: ["clash-for-windows"], defaultPort: 7890, type: "http" },
  { name: "Clash Meta",        patterns: ["clash-meta", "mihomo"], defaultPort: 7890, type: "http" },
  { name: "V2Ray",             patterns: ["v2ray", "v2ray-core"], defaultPort: 10809, type: "http" },
  { name: "V2RayN",            patterns: ["v2rayn"],        defaultPort: 10809, type: "http" },
  { name: "V2RayA",            patterns: ["v2raya"],        defaultPort: 2017,  type: "http" },
  { name: "Xray",              patterns: ["xray"],          defaultPort: 10809, type: "http" },
  { name: "Fast Client",       patterns: ["fastclient", "fast_client"], defaultPort: 10808, type: "http" },
  { name: "Sing-box",          patterns: ["sing-box"],      defaultPort: 2080,  type: "http" },
  { name: "NekoRay",           patterns: ["nekoray", "nekobox"], defaultPort: 2080, type: "http" },
  { name: "Hiddify",           patterns: ["hiddify"],       defaultPort: 2080,  type: "http" },
  { name: "Surge",             patterns: ["surge"],         defaultPort: 6152,  type: "http" },
  { name: "Quantumult X",      patterns: ["quantumultx"],   defaultPort: 9527,  type: "http" },
  { name: "Stash",             patterns: ["stash"],         defaultPort: 6152,  type: "http" },
  { name: "Shadowsocks",       patterns: ["ss-local", "shadowsocks"], defaultPort: 1080, type: "socks5" },
  { name: "Trojan",            patterns: ["trojan"],        defaultPort: 1080,  type: "socks5" },
  { name: "Hysteria",          patterns: ["hysteria"],      defaultPort: 1080,  type: "socks5" },
  { name: "Proxifier",         patterns: ["proxifier"],     defaultPort: 1080,  type: "socks5" },
];

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Map proxy type to URL scheme for HTTP_PROXY / HTTPS_PROXY env vars.
 *   http   -> http://    (HTTP CONNECT proxy)
 *   https  -> https://   (TLS-wrapped CONNECT)
 *   socks5 -> socks5h:// (SOCKS5 with remote DNS resolution)
 */
function proxyScheme(type) {
  switch (type) {
    case "https":  return "https://";
    case "socks5": return "socks5h://";
    default:       return "http://";
  }
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function saveConfig(config) {
  if (!existsSync(SKILL_DIR)) mkdirSync(SKILL_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function getClaudeMdPath(mode) {
  if (mode === "A") return join(homedir(), ".claude", "CLAUDE.md");
  if (mode === "B") return join(process.cwd(), "CLAUDE.md");
  return null;
}

function generateProxyRules() {
  return `${MARKER_START}
<!-- Auto-managed by /ccproxy skill. Do not edit manually. -->

## Smart Proxy

When Claude encounters a network error, execute this strategy:

### Domain classification (network-layer, no lists)
1. Direct TCP probe to target domain:443 (3 attempts, 1s between retries)
2. If any attempt succeeds in < 500ms → direct connection (fast, no proxy needed)
3. If all attempts fail or slow (>= 500ms) → needs proxy

### Proxy detection and retry
1. Run: node ~/.claude/skills/ccproxy/scripts/detect.mjs --json
2. Parse recommended.host, recommended.port, and recommended.type
3. Determine URL scheme from type: http→http://, https→https://, socks5→socks5h://
4. Set: export HTTP_PROXY="SCHEMEHOST:PORT" && export HTTPS_PROXY="SCHEMEHOST:PORT"
5. Retry the failed operation
6. If detection fails 3 times (2s between): remind user to start proxy software
7. Ask user: retry (1) or cancel (0)

### Behavior
- Silent: fix first, report only the result
- Never proxy fast/direct sites
- Session-scoped: export only, no permanent changes
${MARKER_END}`;
}

function removeMarkerContent(content) {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1) return content;
  return content.substring(0, startIdx).trimEnd() + "\n" + content.substring(endIdx + MARKER_END.length).trimStart();
}

function hasMarkerInFile(filePath) {
  try {
    if (!existsSync(filePath)) return false;
    const content = readFileSync(filePath, "utf-8");
    return content.includes(MARKER_START);
  } catch {
    return false;
  }
}

function writeToClaudeMd(mode) {
  const filePath = getClaudeMdPath(mode);
  if (!filePath) return false;

  const rules = generateProxyRules();

  try {
    if (existsSync(filePath)) {
      let content = readFileSync(filePath, "utf-8");
      content = removeMarkerContent(content);
      content = content.trimEnd() + "\n\n" + rules + "\n";
      writeFileSync(filePath, content);
    } else {
      writeFileSync(filePath, rules + "\n");
    }
    return true;
  } catch (e) {
    console.error(`  Failed to write to ${filePath}: ${e.message}`);
    return false;
  }
}

function removeFromClaudeMd(mode) {
  const filePath = getClaudeMdPath(mode);
  if (!filePath || !existsSync(filePath)) return;

  try {
    let content = readFileSync(filePath, "utf-8");
    content = removeMarkerContent(content);
    writeFileSync(filePath, content.trimEnd() + "\n");
  } catch {}
}

// ── Three-retry test strategy ───────────────────────────────────────

async function testProxyWithRetry(host, port, rl) {
  while (true) {
    console.log(`\n  Testing ${host}:${port}...`);

    for (let i = 1; i <= RETRY_COUNT; i++) {
      const ok = await probePort(host, port);
      if (ok) {
        console.log(`  ✅ ${host}:${port} reachable (attempt ${i})`);
        return true;
      }
      console.log(`  Attempt ${i}/${RETRY_COUNT} failed...`);
      if (i < RETRY_COUNT) await sleep(2000);
    }

    console.log(`\n  ⚠️  ${host}:${port} unreachable after ${RETRY_COUNT} attempts.`);
    console.log("  Please start your proxy software.\n");
    const choice = await ask(rl, "  1 = Retry  |  0 = Cancel: ");
    if (choice.trim() === "0") return false;
  }
}

// ── /ccproxy init ─────────────────────────────────────────────────────

async function cmdInit(rl) {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║       /ccproxy init — Choose Proxy Mode        ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const existing = loadConfig();
  if (existing?.mode) {
    console.log(`  Current mode: ${existing.mode} (${existing.mode === "A" ? "Global Auto" : existing.mode === "B" ? "Project Auto" : "Manual"})\n`);
  }

  console.log("  Select proxy mode:\n");
  console.log("    A. Global Auto   — Write rules to ~/.claude/CLAUDE.md");
  console.log("                       Auto-trigger in ALL projects\n");
  console.log("    B. Project Auto  — Write rules to ./CLAUDE.md");
  console.log("                       Auto-trigger in CURRENT project only\n");
  console.log("    C. Manual        — No files written");
  console.log("                       Use /ccproxy start to trigger\n");
  console.log("    0. Cancel\n");

  const choice = await ask(rl, "  Enter choice (A/B/C/0): ");
  const mode = choice.trim().toUpperCase();

  if (mode === "0") {
    console.log("  Cancelled.\n");
    return;
  }

  if (!["A", "B", "C"].includes(mode)) {
    console.log("  Invalid choice. Cancelled.\n");
    return;
  }

  // If switching modes, clean up old mode first
  if (existing?.mode && existing.mode !== mode) {
    removeFromClaudeMd(existing.mode);
  }

  // Write to CLAUDE.md if needed
  if (mode === "A" || mode === "B") {
    const target = mode === "A" ? "~/.claude/CLAUDE.md" : "./CLAUDE.md";
    const ok = writeToClaudeMd(mode);
    if (ok) {
      console.log(`\n  ✅ Proxy rules written to ${target}`);
    } else {
      console.log(`\n  ❌ Failed to write to ${target}`);
      return;
    }
  }

  // Save config
  const config = {
    mode,
    modeName: mode === "A" ? "Global Auto" : mode === "B" ? "Project Auto" : "Manual",
    initTime: new Date().toISOString(),
  };

  // Preserve existing proxy settings if re-init
  if (existing?.proxy) config.proxy = existing.proxy;
  if (existing?.software) config.software = existing.software;

  saveConfig(config);

  console.log(`  ✅ Mode set to: ${config.modeName}`);
  console.log(`  Config saved: ${CONFIG_PATH}\n`);

  if (mode === "C") {
    console.log("  Use /ccproxy start to manually trigger proxy.\n");
  }
}

// ── /ccproxy change ───────────────────────────────────────────────────

async function cmdChange(rl) {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║       /ccproxy change — Change Proxy           ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const config = loadConfig();
  if (!config?.mode) {
    console.log("  Please run /ccproxy init first.\n");
    return;
  }

  if (config.proxy) {
    console.log(`  Current: ${config.proxy.software || "unknown"} (${config.proxy.host}:${config.proxy.port})\n`);
  } else {
    console.log("  No proxy configured (using auto-detect).\n");
  }

  // Step 1: Select software
  console.log("  Select proxy software:\n");
  for (let i = 0; i < SOFTWARE_LIST.length; i++) {
    const sw = SOFTWARE_LIST[i];
    console.log(`    ${String(i + 1).padStart(2)}. ${sw.name.padEnd(22)} (default: ${sw.defaultPort})`);
  }
  console.log(`    ${String(SOFTWARE_LIST.length + 1).padStart(2)}. Other (custom)`);
  console.log("     0. Cancel\n");

  const swChoice = await ask(rl, `  Enter number (0-${SOFTWARE_LIST.length + 1}): `);
  const swIndex = parseInt(swChoice.trim(), 10) - 1;

  if (swChoice.trim() === "0") {
    console.log("  Cancelled.\n");
    return;
  }

  let selectedSw = null;
  let isCustom = false;

  if (swIndex >= 0 && swIndex < SOFTWARE_LIST.length) {
    selectedSw = SOFTWARE_LIST[swIndex];
    console.log(`  Selected: ${selectedSw.name}\n`);
  } else if (swIndex === SOFTWARE_LIST.length) {
    isCustom = true;
    console.log("  Custom proxy selected.\n");
  } else {
    console.log("  Invalid choice. Cancelled.\n");
    return;
  }

  // Step 2: Host
  const defaultHost = "127.0.0.1";
  const hostInput = await ask(rl, `  Host (${defaultHost}, 0 to cancel): `);
  if (hostInput.trim() === "0") {
    console.log("  Cancelled.\n");
    return;
  }
  const host = hostInput.trim() || defaultHost;

  // Step 3: Port
  const defaultPort = selectedSw ? selectedSw.defaultPort : 7890;
  const portInput = await ask(rl, `  Port (${defaultPort}, 0 to cancel): `);
  if (portInput.trim() === "0") {
    console.log("  Cancelled.\n");
    return;
  }
  const port = parseInt(portInput.trim(), 10) || defaultPort;

  // Step 4: Custom fields
  let type = selectedSw ? selectedSw.type : "http";
  let softwareName = selectedSw ? selectedSw.name : "Custom Proxy";
  let patterns = selectedSw ? selectedSw.patterns : ["proxy"];

  if (isCustom) {
    const typeInput = await ask(rl, "  Type - http/https/socks5 (http, 0 to cancel): ");
    if (typeInput.trim() === "0") {
      console.log("  Cancelled.\n");
      return;
    }
    type = typeInput.trim().toLowerCase() || "http";

    const nameInput = await ask(rl, "  Software name (display, 0 to cancel): ");
    if (nameInput.trim() === "0") {
      console.log("  Cancelled.\n");
      return;
    }
    softwareName = nameInput.trim() || "Custom Proxy";

    const patInput = await ask(rl, "  Process pattern (e.g. my-proxy.exe, 0 to cancel): ");
    if (patInput.trim() === "0") {
      console.log("  Cancelled.\n");
      return;
    }
    patterns = [patInput.trim() || "proxy"];
  }

  // Step 5: Three-retry test
  const ok = await testProxyWithRetry(host, port, rl);
  if (!ok) {
    console.log("  Cancelled.\n");
    return;
  }

  // Step 6: Confirm
  console.log(`\n  New proxy: ${softwareName} (${host}:${port}, ${type})`);
  const confirm = await ask(rl, "  Save? (y/0): ");
  if (confirm.trim().toLowerCase() !== "y") {
    console.log("  Cancelled.\n");
    return;
  }

  // Save
  config.proxy = { host, port, type, software: softwareName };
  config.software = { name: softwareName, patterns, defaultPort: port, type };
  saveConfig(config);

  // Update CLAUDE.md if needed
  if (config.mode === "A" || config.mode === "B") {
    writeToClaudeMd(config.mode);
    const target = config.mode === "A" ? "~/.claude/CLAUDE.md" : "./CLAUDE.md";
    console.log(`\n  ✅ Proxy config updated in ${target}`);
  }

  console.log(`  ✅ Proxy set: ${softwareName} (${host}:${port})\n`);
}

// ── /ccproxy start ────────────────────────────────────────────────────

async function cmdStart(rl) {
  const config = loadConfig();
  if (!config?.mode) {
    console.log("\n  Please run /ccproxy init first.\n");
    return;
  }

  if (config.mode !== "C") {
    console.log(`\n  Mode is ${config.modeName} — proxy triggers automatically.\n`);
    return;
  }

  console.log("\n  Starting proxy strategy...\n");

  // Use configured proxy or auto-detect
  if (config.proxy) {
    const { host, port, type, software } = config.proxy;
    const scheme = proxyScheme(type);
    console.log(`  Using configured: ${software} (${host}:${port}, ${type})`);
    console.log(`  export HTTP_PROXY="${scheme}${host}:${port}"`);
    console.log(`  export HTTPS_PROXY="${scheme}${host}:${port}"\n`);
    return;
  }

  // Auto-detect
  console.log("  No proxy configured, running auto-detect...");
  const result = await detectProxy(SOFTWARE_LIST);
  if (result.recommended) {
    const { host, port, type, software } = result.recommended;
    const scheme = proxyScheme(type);
    console.log(`  Found: ${software} (${host}:${port}, ${type})`);
    console.log(`  export HTTP_PROXY="${scheme}${host}:${port}"`);
    console.log(`  export HTTPS_PROXY="${scheme}${host}:${port}"\n`);
  } else {
    console.log("  No proxy detected. Please run /ccproxy change to configure.\n");
  }
}

// ── /ccproxy status ────────────────────────────────────────────────

async function cmdStatus() {
  const config = loadConfig();

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║       /ccproxy status                        ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  if (!config?.mode) {
    console.log("  Status: Not initialized");
    console.log("  Run /ccproxy init to set up.\n");
    return;
  }

  console.log(`  Mode:     ${config.modeName} (${config.mode})`);
  console.log(`  Init:     ${config.initTime || "unknown"}`);

  if (config.proxy) {
    console.log(`  Software: ${config.proxy.software || config.software?.name || "unknown"}`);
    console.log(`  Address:  ${config.proxy.host}:${config.proxy.port}`);
    console.log(`  Type:     ${config.proxy.type}`);
  } else {
    console.log("  Proxy:    Auto-detect (no manual config)");
  }

  if (config.mode === "A") {
    console.log(`  Written:  ~/.claude/CLAUDE.md`);
  } else if (config.mode === "B") {
    console.log(`  Written:  ./CLAUDE.md`);
  } else {
    console.log(`  Written:  None (manual mode)`);
  }

  // ── Live connection detection ──
  console.log("\n  ── Connection Status ──\n");
  console.log("  Detecting proxy software...");

  const result = await detectProxy(SOFTWARE_LIST);

  if (result.detected.length === 0) {
    console.log("  ⚠️  No proxy software detected running\n");
    return;
  }

  for (const m of result.detected) {
    const icon = m.portOpen ? "✅" : "❌";
    const owner = m.owner ? ` [${m.owner.process}]` : "";
    console.log(`  ${icon} ${m.software} — port ${m.port} (${m.type})${owner} ${m.portOpen ? "OPEN" : "CLOSED"}`);
  }

  if (result.recommended) {
    console.log(`\n  Recommended: ${result.recommended.software} @ ${result.recommended.host}:${result.recommended.port}`);
  } else {
    console.log("\n  ⚠️  No open proxy port found — please start your proxy software");
  }

  console.log();
}

// ── /ccproxy reset ────────────────────────────────────────────────────

function cmdReset() {
  const config = loadConfig();

  if (!config?.mode) {
    console.log("\n  No proxy config found. Nothing to reset.\n");
    return;
  }

  // Remove from CLAUDE.md
  if (config.mode === "A" || config.mode === "B") {
    removeFromClaudeMd(config.mode);
    const target = config.mode === "A" ? "~/.claude/CLAUDE.md" : "./CLAUDE.md";
    console.log(`\n  Removed proxy rules from ${target}`);
  }

  // Delete config
  if (existsSync(CONFIG_PATH)) {
    unlinkSync(CONFIG_PATH);
  }

  console.log("  ✅ Proxy config reset. All proxy content cleaned.\n");
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  switch (command) {
    case "init":
      await cmdInit(rl);
      break;
    case "change":
      await cmdChange(rl);
      break;
    case "start":
      await cmdStart(rl);
      break;
    case "status":
      await cmdStatus();
      break;
    case "reset":
      cmdReset();
      break;
    default:
      console.log("\nUsage: node proxy.mjs <command>\n");
      console.log("Commands:");
      console.log("  init     Choose proxy mode (A=Global / B=Project / C=Manual)");
      console.log("  change   Change proxy software/port");
      console.log("  start    Manual trigger (mode C only)");
      console.log("  status   Show current config");
      console.log("  reset    Reset all proxy config\n");
  }

  rl.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
