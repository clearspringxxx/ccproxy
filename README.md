[English](README.md) | [简体中文](README.zh-CN.md)

# ccproxy

Smart network proxy for Claude Code — Automatically detects network issues and intelligently routes traffic through your local proxy software. No hardcoded domain lists, pure network-layer probing.

---

## Why ccproxy?

Many users connect domestic LLMs in Claude Code, which may cause network issues like being unable to access foreign websites or download resources. This skill helps you intelligently proxy your network:

- **Zero configuration** — Auto-detects proxy software and ports
- **Network-layer detection** — Uses TCP probing instead of domain name lists
- **Three proxy modes** — Global auto, project auto, or manual trigger
- **20+ proxy software** — Supports Clash, V2Ray, Xray, Sing-box, Shadowsocks, and more

---

## When to use

**Use ccproxy when:**
- Connect Claude Code to a domestic LLM and need **Bash commands** (`curl`, `python`, `npm`, `git`, …) to reach foreign resources (GitHub, npm registry, doc sites).
- You haven't enabled TUN / system-wide proxy and want on-demand, probe-driven proxying for shell commands.
- You want fine-grained "only proxy slow sites" control instead of a global tunnel.

**Do NOT use ccproxy for (enable Clash TUN / system proxy instead):**
- Making **MCP servers' own network requests** go through the proxy — ccproxy cannot cover those (see [Limitations](#limitations)).
- Tunneling traffic from programs outside Claude Code.

---

## Installation

### Option 1: git clone (Recommended)

User level (global):
```bash
git clone https://github.com/clearspringxxx/ccproxy ~/.claude/skills/ccproxy
```

Project level:
```bash
git clone https://github.com/clearspringxxx/ccproxy .claude/skills/ccproxy
```

> **Windows CMD users**: `~` is not resolved. Use full path instead:
> ```bash
> git clone https://github.com/clearspringxxx/ccproxy %USERPROFILE%\.claude\skills\ccproxy
> ```

### Option 2: npx skills add

```bash
npx skills add https://github.com/clearspringxxx/ccproxy
```

> **Note:** For global install with `-g`, you need to manually create a symlink:
> ```bash
> ln -s ~/.agents/skills/ccproxy ~/.claude/skills/ccproxy
> ```

---

## Quick Start

```bash
/ccproxy init      # Choose mode (A/B/C) — must run first
/ccproxy change    # Configure proxy software/port
/ccproxy status    # View current config and live detection
```

---

## Commands

| Command | Purpose |
|---------|---------|
| `/ccproxy init` | Initialize proxy mode — must run first |
| `/ccproxy change` | Configure proxy software and port |
| `/ccproxy start` | Manually trigger proxy (Mode C only) |
| `/ccproxy status` | View current config and live detection |
| `/ccproxy reset` | Reset all configuration |

### `/ccproxy init` — Initialize proxy mode

**Required before any other command.** Choose how the proxy strategy should be triggered:

| Mode | Description | Writes to |
|------|-------------|-----------|
| A. Global Auto | Auto-triggers in ALL projects | `~/.claude/CLAUDE.md` |
| B. Project Auto | Auto-triggers in CURRENT project only | `./CLAUDE.md` |
| C. Manual | User runs `/ccproxy start` when needed | Nothing |

**What happens:**
1. Shows current mode if already initialized
2. Prompts for mode selection (A/B/C)
3. For modes A/B: writes proxy strategy rules to CLAUDE.md with markers
4. Saves config to `~/.claude/skills/ccproxy/config.json`
5. If switching modes: automatically cleans up old mode's content

---

### `/ccproxy change` — Configure proxy software

Interactive proxy configuration with connectivity testing:

**Flow:**
1. **Select software** — Choose from 20+ known proxy software or "Other" for custom
2. **Enter host** — Default: `127.0.0.1`
3. **Enter port** — Pre-filled with software's default port
4. **Custom fields** (if "Other" selected):
   - Type: `http` / `https` / `socks5`
   - Software name (for display)
   - Process pattern (for auto-detection)
5. **Connectivity test** — 3-attempt probe with 2s retry delay
6. **Confirm save** — `y` to save, `0` to cancel

**Supported software:**

| Software | Default Port | Type |
|----------|--------------|------|
| Clash Verge / Rev | 7897 | HTTP |
| Clash for Windows | 7890 | HTTP |
| Clash Meta / Mihomo | 7890 | HTTP |
| V2Ray / V2RayN / V2RayA | 10809 / 2017 | HTTP |
| Xray | 10809 | HTTP |
| Fast Client | 10808 | HTTP |
| Sing-box | 2080 | HTTP |
| NekoRay / Nekobox | 2080 | HTTP |
| Hiddify | 2080 | HTTP |
| Surge / Stash | 6152 | HTTP |
| Quantumult X | 9527 | HTTP |
| Shadowsocks / SSR | 1080 | SOCKS5 |
| Trojan / Hysteria | 1080 | SOCKS5 |
| Proxifier | 1080 | SOCKS5 |

---

### `/ccproxy start` — Manual proxy trigger

Only useful in **Mode C (Manual)**. For modes A/B, proxy triggers automatically on network errors.

**Behavior:**
- If proxy is configured: shows `export` commands for the configured proxy
- If no config: runs auto-detect and shows recommended proxy
- User manually copies the `export` commands to terminal

---

### `/ccproxy status` — Show current configuration

Displays:
- Current mode (A/B/C) and initialization time
- Configured proxy software, host, port, and type
- Where proxy rules are written (if mode A/B)
- **Live detection**: scans running processes and listening ports
- Shows each detected proxy with port status (✅ OPEN / ❌ CLOSED)
- Recommends best available proxy

---

### `/ccproxy reset` — Reset all configuration

**What it does:**
1. Removes proxy strategy content from CLAUDE.md (modes A/B)
2. Deletes `~/.claude/skills/ccproxy/config.json`
3. Cleans up all marker content (`<!-- [proxy-skill:start] -->` to `<!-- [proxy-skill:end] -->`)

**After reset:** You must run `/ccproxy init` again before using other commands.

---

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code                            │
│                     (User's LLM)                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ Network Error
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   ccproxy Strategy                          │
│  Written to CLAUDE.md → Claude follows automatically        │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
┌─────────────────────┐   ┌─────────────────────┐
│  detect.mjs         │   │  proxy.mjs          │
│  Detection Engine   │   │  Interactive CLI    │
└─────────────────────┘   └─────────────────────┘
```

### Step 1: Domain Classification (Network-Layer, No Lists)

Instead of maintaining a hardcoded domain list, ccproxy uses **TCP probing** to determine if a domain needs proxy:

```
TCP probe target:443 (3 attempts, 1s between retries)
  ├─ Any attempt succeeds < 500ms → direct connection (fast, no proxy needed)
  └─ All attempts fail or >= 500ms → needs proxy
```

**Why this approach:**
- No maintenance burden — works with any domain
- Adapts to network changes automatically
- Speed-based, not name-based — actual connectivity matters

**Implementation** ([detect.mjs:90-122](scripts/detect.mjs#L90-L122)):
```javascript
async function testDomainDirect(hostname, port = 443, attempts = 3) {
  // TCP connect to target:443
  // Measure latency for each attempt
  // Return: { reachable, fast, latencyMs, attempts }
}
```

### Step 2: Proxy Detection

When proxy is needed, ccproxy finds your running proxy software:

**Process Detection** ([detect.mjs:125-141](scripts/detect.mjs#L125-L141)):
- Scans running processes (`tasklist` on Windows, `ps aux` on Linux/Mac)
- Matches against 20+ known proxy software patterns
- Returns list of detected software

**Port Discovery** ([detect.mjs:144-167](scripts/detect.mjs#L144-L167)):
- Uses `netstat` (Windows) or `ss` (Linux) to find listening ports
- Filters ports in range 1024-65535
- Maps ports to owning processes via PID

**Port Validation** ([detect.mjs:76-86](scripts/detect.mjs#L76-L86)):
- TCP probes detected ports to confirm they're open
- Falls back to default ports if netstat doesn't show them

**HTTP CONNECT Validation** ([detect.mjs:203-219](scripts/detect.mjs#L203-L219)):
- For HTTP proxies: sends CONNECT request to verify tunnel capability
- Tests actual proxy functionality, not just port open

### Step 3: Proxy Application

Once proxy is detected, ccproxy sets environment variables:

```bash
export HTTP_PROXY="http://127.0.0.1:7890"
export HTTPS_PROXY="http://127.0.0.1:7890"
```

**URL scheme mapping** ([proxy.mjs:56-62](scripts/proxy.mjs#L56-L62)):
- `http` type → `http://` (HTTP CONNECT proxy)
- `https` type → `https://` (TLS-wrapped CONNECT)
- `socks5` type → `socks5h://` (SOCKS5 with remote DNS resolution)

**Important:** `export` only affects the current session — no permanent changes to your system.

### Step 4: Failure Handling

If detection fails:
1. Retries 3 times with 2-second delays
2. If still failing: reminds user to start proxy software
3. Asks user: `1` = retry | `0` = cancel

---

## Limitations

ccproxy works by exporting `HTTP_PROXY` / `HTTPS_PROXY` in the **current Bash shell**. This imposes hard boundaries:

- **Only Bash commands are covered.** It affects requests Claude makes via the Bash tool (`curl`, `python urllib`, `wget`, `npm`, etc.).
- **MCP server requests are NOT covered.** MCP servers run as separate processes spawned at Claude Code startup; their traffic never passes through the Bash shell, so `export` has no effect on them:
  - `type: http` remote MCP (e.g. Tavily, Context7) — requested directly by the Claude Code main process.
  - stdio MCP servers (e.g. Node-based) — Node's native `fetch` / `undici` does not honor `HTTP_PROXY` even if injected.
- **Already-spawned processes can't be reconfigured mid-session.** `export` only affects processes started after it runs.
- **TCP probing is best-effort.** ccproxy probes TCP port 443 reachability; GFW TLS-level blocking (SNI reset, etc.) may leave TCP open while actual access fails.
- **Probing is polluted under TUN.** If TUN / system proxy is already on, probe packets are captured by it, so measured latency reflects the rule-routed path rather than a true direct connection.

> **Need MCP traffic proxied?** Enable Clash **TUN / system proxy (Rule mode)** instead. ccproxy intentionally does not attempt to cover MCP — it stays a small, Claude-focused skill.

---

## File Structure

```
ccproxy/
├── SKILL.md              # Skill definition for Claude Code
├── README.md             # English documentation
├── README.zh-CN.md       # Chinese documentation
├── package.json          # npm package config
└── scripts/
    ├── detect.mjs        # Detection engine (domain test, process scan, port discovery)
    └── proxy.mjs         # Interactive commands (init, change, start, status, reset)
```

### Key Files

**SKILL.md** — Skill definition that Claude Code reads:
- Defines skill metadata (name, version, allowed tools)
- Contains the proxy strategy that Claude follows
- Triggered automatically when network errors occur

**scripts/detect.mjs** — Detection engine:
- `testDomainDirect()` — TCP probe for domain connectivity
- `detectProcesses()` — Scan running processes
- `discoverListeningPorts()` — Find open ports via netstat
- `validateProxyHttpConnect()` — HTTP CONNECT validation
- `detectProxy()` — Full detection orchestration

**scripts/proxy.mjs** — Interactive CLI:
- `cmdInit()` — Mode selection and CLAUDE.md writing
- `cmdChange()` — Proxy software configuration
- `cmdStart()` — Manual trigger for mode C
- `cmdStatus()` — Config display and live detection
- `cmdReset()` — Cleanup and config removal

---

## Input Conventions

| Input | Action |
|-------|--------|
| `0` | Cancel at any step |
| `y` | Confirm save/operation |
| `Enter` | Accept default value (where shown) |
| Number | Select from menu options |

**Cancel always exits the entire command** — no partial changes are saved.

---

## Configuration

Config file: `~/.claude/skills/ccproxy/config.json`

```json
{
  "mode": "A",
  "modeName": "Global Auto",
  "initTime": "2026-06-17T12:00:00.000Z",
  "proxy": {
    "host": "127.0.0.1",
    "port": 7890,
    "type": "http",
    "software": "Clash for Windows"
  },
  "software": {
    "name": "Clash for Windows",
    "patterns": ["clash-for-windows"],
    "defaultPort": 7890,
    "type": "http"
  }
}
```

**Fields:**
- `mode` — Current proxy mode (A/B/C)
- `modeName` — Human-readable mode name
- `initTime` — When initialization occurred
- `proxy` — Manual proxy configuration (optional)
- `software` — Custom software definition (for "Other" option)

---

## CLAUDE.md Content

When mode A or B is selected, ccproxy writes strategy rules to CLAUDE.md:

```markdown
<!-- [proxy-skill:start] -->
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
<!-- [proxy-skill:end] -->
```

**Note:** Do not manually edit content between markers — it's auto-managed by `/ccproxy` commands.

---

## Troubleshooting

### No proxy detected

**Symptoms:** `/ccproxy status` shows "No proxy software detected running"

**Solutions:**
1. Start your proxy software (Clash, V2Ray, etc.)
2. Ensure proxy is listening on expected port
3. Run `/ccproxy status` again to verify detection

### Port closed

**Symptoms:** Status shows ❌ CLOSED for detected software

**Solutions:**
1. Check proxy software settings — ensure "Allow LAN" is enabled
2. Verify port number matches software config
3. Run `/ccproxy change` to reconfigure with correct port

### Connection still failing

**Symptoms:** Network errors persist after proxy setup

**Solutions:**
1. Run `/ccproxy status` — verify proxy is detected and port is open
2. Test proxy manually: `curl -x http://127.0.0.1:7890 https://google.com`
3. Check proxy software logs for connection errors
4. Try `/ccproxy change` with different port or software

### Permission denied writing CLAUDE.md

**Symptoms:** `/ccproxy init` fails with permission error

**Solutions:**
- Mode A: Ensure `~/.claude/` directory exists and is writable
- Mode B: Ensure current directory is writable
- Try running terminal as administrator (Windows) or with sudo (Linux/Mac)

---

## Advanced Usage

### Using with different proxy software

ccproxy supports custom proxy software via "Other" option in `/ccproxy change`:

1. Select "Other (custom)"
2. Enter proxy type: `http`, `https`, or `socks5`
3. Enter software name (for display)
4. Enter process pattern (e.g., `my-proxy.exe`)

### Switching modes

Run `/ccproxy init` again to switch modes:
- Old mode's content is automatically cleaned from CLAUDE.md
- New mode's content is written
- Proxy configuration is preserved

### Manual detection

Use `detect.mjs` directly for troubleshooting:

```bash
# Full detection report
node ~/.claude/skills/ccproxy/scripts/detect.mjs

# JSON output (for scripts)
node ~/.claude/skills/ccproxy/scripts/detect.mjs --json

# Test specific domain
node ~/.claude/skills/ccproxy/scripts/detect.mjs --test-domain github.com

# Test proxy port
node ~/.claude/skills/ccproxy/scripts/detect.mjs --test-proxy 127.0.0.1:7890

# Validate proxy with HTTP CONNECT
node ~/.claude/skills/ccproxy/scripts/detect.mjs --validate 127.0.0.1:7890
```

---

## FAQ

**Q: Does ccproxy modify my system proxy settings?**
A: No. It only exports `HTTP_PROXY` and `HTTPS_PROXY` environment variables for the current session. No permanent changes.

**Q: Can I use ccproxy with VPN software?**
A: Yes, if your VPN exposes a local SOCKS5 or HTTP proxy port. Use `/ccproxy change` with "Other" option.

**Q: Why does ccproxy use TCP probing instead of domain lists?**
A: Domain lists require constant maintenance and can't adapt to network changes. TCP probing determines connectivity based on actual network conditions.

**Q: Does ccproxy work on Windows/Mac/Linux?**
A: Yes. It uses platform-specific commands (`tasklist`/`ps aux`, `netstat`/`ss`) automatically.

**Q: How do I update ccproxy?**
A: Pull the latest changes:
```bash
cd ~/.claude/skills/ccproxy && git pull
```

---

## License

MIT

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
