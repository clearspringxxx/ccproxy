---
name: ccproxy
description: Smart network proxy for Claude Code. MUST INVOKE when encountering network errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ECONNRESET, SSL_ERROR, npm ERR! network, git clone timeout, fetch failed, request timeout, socket hang up, etc.). Uses network-layer probing to determine if proxy is needed — no hardcoded domain lists. Also use for proxy setup, configuration, or troubleshooting.
version: 3.0.0
user-invocable: true
argument-hint: "[init|change|start|status|reset]"
allowed-tools:
  - Bash(node *)
  - Bash(netstat *)
  - Bash(tasklist *)
  - Bash(curl *)
  - Bash(echo *)
  - Bash(export *)
---

# Proxy Skill

Smart network proxy for Claude Code. Must be initialized before use.

## Commands

| Command | Action |
|---|---|
| `/ccproxy init` | **Required first.** Choose mode: A=Global Auto, B=Project Auto, C=Manual |
| `/ccproxy change` | Change proxy software/port. Interactive with 3-retry test |
| `/ccproxy start` | Manual trigger (mode C only). A/B modes trigger automatically |
| `/ccproxy status` | Show current mode, proxy config, and status |
| `/ccproxy reset` | Reset all proxy config, remove written content |

**Input conventions:** `0` = cancel at any step, `y` = confirm save

## Initialization (must run first)

```bash
node ${CLAUDE_SKILL_DIR}/scripts/proxy.mjs init
```

Three modes:
- **A. Global Auto** — Writes proxy rules to `~/.claude/CLAUDE.md`. Auto-triggers in all projects.
- **B. Project Auto** — Writes proxy rules to `./CLAUDE.md`. Auto-triggers in current project only.
- **C. Manual** — No files written. User runs `/ccproxy start` when needed.

Can be re-run to switch modes (cleans up old mode automatically).

## Proxy strategy (all modes use the same logic)

When a network error occurs, classify the target via network-layer probing:

### Step 1: Domain classification (network-layer, no lists)
Direct TCP probe to target:443, 3 attempts, 1s between retries:
- Any attempt succeeds in < 500ms → direct connection (fast, no proxy needed)
- All attempts fail or >= 500ms → needs proxy

No hardcoded domain lists. Determined purely by actual connectivity and speed.

### Step 2: Proxy detection
Run `detect.mjs` to find running proxy software:
```bash
node ${CLAUDE_SKILL_DIR}/scripts/detect.mjs --json
```

### Step 3: Retry with proxy
Determine URL scheme from `recommended.type`:
- `http` → `http://`
- `https` → `https://`
- `socks5` → `socks5h://` (remote DNS resolution)

Set environment and retry:
```bash
export HTTP_PROXY="SCHEMEHOST:PORT"
export HTTPS_PROXY="SCHEMEHOST:PORT"
```

### Step 4: Failure handling
If detection fails 3 times (2s between):
- Remind user: "Please start your proxy software"
- Ask: `1` = retry | `0` = cancel

## Change proxy

```bash
node ${CLAUDE_SKILL_DIR}/scripts/proxy.mjs change
```

Interactive flow:
1. Select proxy software (20+ options) or custom
2. Enter host/port
3. 3-retry connectivity test (loops until success or cancel)
4. Confirm save (y/0)
5. Auto-updates CLAUDE.md if mode is A or B

## Proxy software

Clash Verge, Clash for Windows, Clash Meta, V2Ray, V2RayN, V2RayA, Xray, Fast Client, Sing-box, NekoRay, Hiddify, Surge, Quantumult X, Stash, Shadowsocks, Trojan, Hysteria, Proxifier, and more.

## Notes

- Must run `/ccproxy init` before any other command
- Cancel any step with `0`
- `export` only affects current session (no permanent changes)
- User's proxy software must already be running
