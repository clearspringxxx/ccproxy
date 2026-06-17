[English](README.md) | [简体中文](README.zh-CN.md)

# ccproxy

Claude Code 智能网络代理 —— 自动检测网络问题，智能将流量路由到本地代理软件。无需硬编码域名列表，纯网络层探测。

---

## 为什么需要 ccproxy？

很多用户在 Claude Code 中接入国产大模型，可能会遇到一些网络问题，比如无法访问国外网站或下载资源等。这个skill可以帮助你智能代理网络：

- **零配置** — 自动检测代理软件和端口
- **网络层检测** — 使用 TCP 探测而非域名列表
- **三种代理模式** — 全局自动、项目自动或手动触发
- **20+ 代理软件** — 支持 Clash、V2Ray、Xray、Sing-box、Shadowsocks 等

---

## 安装

### 方式一：git clone（推荐）

用户级别（全局）：
```bash
git clone https://github.com/clearspringxxx/ccproxy ~/.claude/skills/ccproxy
```

项目级别：
```bash
git clone https://github.com/clearspringxxx/ccproxy .claude/skills/ccproxy
```

> **Windows CMD 用户**：`~` 不会被解析，请使用完整路径：
> ```bash
> git clone https://github.com/clearspringxxx/ccproxy %USERPROFILE%\.claude\skills\ccproxy
> ```

### 方式二：npx skills add

```bash
npx skills add https://github.com/clearspringxxx/ccproxy
```

> **注意：** 使用 `-g` 全局安装时，需手动创建符号链接：
> ```bash
> ln -s ~/.agents/skills/ccproxy ~/.claude/skills/ccproxy
> ```

---

## 快速开始

```bash
/ccproxy init      # 选择模式 (A/B/C) — 必须先执行
/ccproxy change    # 配置代理软件/端口
/ccproxy status    # 查看当前配置和实时检测
```

---

## 命令

| 命令 | 作用 |
|------|------|
| `/ccproxy init` | 初始化代理模式 — 必须先执行 |
| `/ccproxy change` | 配置代理软件和端口 |
| `/ccproxy start` | 手动触发代理（仅 C 模式） |
| `/ccproxy status` | 查看当前配置和实时检测 |
| `/ccproxy reset` | 重置所有配置 |

### `/ccproxy init` — 初始化代理模式

**执行其他命令前必须先运行此命令。** 选择代理策略的触发方式：

| 模式 | 描述 | 写入位置 |
|------|------|----------|
| A. 全局自动 | 在所有项目中自动触发 | `~/.claude/CLAUDE.md` |
| B. 项目自动 | 仅在当前项目中自动触发 | `./CLAUDE.md` |
| C. 手动模式 | 用户手动执行 `/ccproxy start` | 不写入 |

**执行流程：**
1. 如果已初始化，显示当前模式
2. 提示选择模式 (A/B/C)
3. 模式 A/B：将代理策略规则写入 CLAUDE.md（带标记）
4. 保存配置到 `~/.claude/skills/ccproxy/config.json`
5. 切换模式时：自动清理旧模式的内容

---

### `/ccproxy change` — 配置代理软件

交互式代理配置，含连通性测试：

**流程：**
1. **选择软件** — 从 20+ 种已知代理软件中选择，或选"其他"自定义
2. **输入主机** — 默认：`127.0.0.1`
3. **输入端口** — 预填软件的默认端口
4. **自定义字段**（选择"其他"时）：
   - 类型：`http` / `https` / `socks5`
   - 软件名称（用于显示）
   - 进程匹配模式（用于自动检测）
5. **连通性测试** — 3 次探测，重试间隔 2 秒
6. **确认保存** — `y` 保存，`0` 取消

**支持的代理软件：**

| 软件 | 默认端口 | 类型 |
|------|----------|------|
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

### `/ccproxy start` — 手动触发代理

仅在 **模式 C（手动）** 下使用。模式 A/B 下遇到网络错误时会自动触发代理。

**行为：**
- 已配置代理：显示已配置代理的 `export` 命令
- 未配置：运行自动检测并显示推荐的代理
- 用户手动将 `export` 命令复制到终端

---

### `/ccproxy status` — 查看当前配置

显示内容：
- 当前模式 (A/B/C) 和初始化时间
- 已配置的代理软件、主机、端口和类型
- 代理规则写入位置（模式 A/B 时）
- **实时检测**：扫描运行中的进程和监听端口
- 显示每个检测到的代理及其端口状态（✅ 开启 / ❌ 关闭）
- 推荐最佳可用代理

---

### `/ccproxy reset` — 重置所有配置

**执行操作：**
1. 从 CLAUDE.md 中移除代理策略内容（模式 A/B）
2. 删除 `~/.claude/skills/ccproxy/config.json`
3. 清理所有标记内容（`<!-- [proxy-skill:start] -->` 到 `<!-- [proxy-skill:end] -->`）

**重置后：** 使用其他命令前必须重新执行 `/ccproxy init`。

---

## 工作原理

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code                            │
│                     （用户的大模型）                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ 网络错误
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   ccproxy 策略                               │
│  写入 CLAUDE.md → Claude 自动执行                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
┌─────────────────────┐   ┌─────────────────────┐
│  detect.mjs         │   │  proxy.mjs          │
│  检测引擎            │   │  交互式 CLI          │
└─────────────────────┘   └─────────────────────┘
```

### 第一步：域名分类（网络层，无列表）

ccproxy 不使用硬编码域名列表，而是通过 **TCP 探测** 判断域名是否需要代理：

```
TCP 探测目标域名:443（3 次尝试，重试间隔 1 秒）
  ├─ 任意一次成功且 < 500ms → 直连（速度快，无需代理）
  └─ 全部失败或 >= 500ms → 需要代理
```

**为什么这样做：**
- 无需维护 — 适用于任何域名
- 自动适应网络变化
- 基于速度而非名称 — 以实际连通性为准

**实现** ([detect.mjs:90-122](scripts/detect.mjs#L90-L122))：
```javascript
async function testDomainDirect(hostname, port = 443, attempts = 3) {
  // TCP 连接到目标域名:443
  // 测量每次尝试的延迟
  // 返回：{ reachable, fast, latencyMs, attempts }
}
```

### 第二步：代理检测

需要代理时，ccproxy 找到正在运行的代理软件：

**进程检测** ([detect.mjs:125-141](scripts/detect.mjs#L125-L141))：
- 扫描运行中的进程（Windows 使用 `tasklist`，Linux/Mac 使用 `ps aux`）
- 匹配 20+ 种已知代理软件的进程模式
- 返回检测到的软件列表

**端口发现** ([detect.mjs:144-167](scripts/detect.mjs#L144-L167))：
- 使用 `netstat`（Windows）或 `ss`（Linux）查找监听端口
- 过滤 1024-65535 范围内的端口
- 通过 PID 将端口映射到所属进程

**端口验证** ([detect.mjs:76-86](scripts/detect.mjs#L76-L86))：
- TCP 探测检测到的端口，确认是否开放
- 如果 netstat 未显示端口，回退到默认端口

**HTTP CONNECT 验证** ([detect.mjs:203-219](scripts/detect.mjs#L203-L219))：
- 对于 HTTP 代理：发送 CONNECT 请求验证隧道能力
- 测试实际代理功能，而不仅仅是端口开放

### 第三步：应用代理

检测到代理后，ccproxy 设置环境变量：

```bash
export HTTP_PROXY="http://127.0.0.1:7890"
export HTTPS_PROXY="http://127.0.0.1:7890"
```

**URL scheme 映射** ([proxy.mjs:56-62](scripts/proxy.mjs#L56-L62))：
- `http` 类型 → `http://`（HTTP CONNECT 代理）
- `https` 类型 → `https://`（TLS 包装的 CONNECT）
- `socks5` 类型 → `socks5h://`（SOCKS5 远程 DNS 解析）

**重要：** `export` 仅影响当前会话 — 不会对系统做永久性修改。

### 第四步：失败处理

检测失败时：
1. 重试 3 次，每次间隔 2 秒
2. 仍然失败：提醒用户启动代理软件
3. 询问用户：`1` = 重试 | `0` = 取消

---

## 文件结构

```
ccproxy/
├── SKILL.md              # Claude Code 的 Skill 定义
├── README.md             # 英文文档
├── README.zh-CN.md       # 中文文档
├── package.json          # npm 包配置
└── scripts/
    ├── detect.mjs        # 检测引擎（域名测试、进程扫描、端口发现）
    └── proxy.mjs         # 交互命令（init、change、start、status、reset）
```

### 关键文件

**SKILL.md** — Claude Code 读取的 Skill 定义：
- 定义 skill 元数据（名称、版本、允许的工具）
- 包含 Claude 遵循的代理策略
- 遇到网络错误时自动触发

**scripts/detect.mjs** — 检测引擎：
- `testDomainDirect()` — TCP 探测域名连通性
- `detectProcesses()` — 扫描运行中的进程
- `discoverListeningPorts()` — 通过 netstat 查找开放端口
- `validateProxyHttpConnect()` — HTTP CONNECT 验证
- `detectProxy()` — 完整的检测编排

**scripts/proxy.mjs** — 交互式 CLI：
- `cmdInit()` — 模式选择和 CLAUDE.md 写入
- `cmdChange()` — 代理软件配置
- `cmdStart()` — 模式 C 手动触发
- `cmdStatus()` — 配置显示和实时检测
- `cmdReset()` — 清理和配置移除

---

## 输入约定

| 输入 | 操作 |
|------|------|
| `0` | 在任意步骤取消 |
| `y` | 确认保存/操作 |
| `Enter` | 接受默认值（显示时） |
| 数字 | 从菜单选项中选择 |

**取消会退出整个命令** — 不会保存任何部分更改。

---

## 配置文件

配置文件位置：`~/.claude/skills/ccproxy/config.json`

```json
{
  "mode": "A",
  "modeName": "全局自动",
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

**字段说明：**
- `mode` — 当前代理模式 (A/B/C)
- `modeName` — 可读的模式名称
- `initTime` — 初始化时间
- `proxy` — 手动代理配置（可选）
- `software` — 自定义软件定义（"其他"选项使用）

---

## CLAUDE.md 内容

选择模式 A 或 B 时，ccproxy 将策略规则写入 CLAUDE.md：

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

**注意：** 请勿手动编辑标记之间的内容 — 这些内容由 `/ccproxy` 命令自动管理。

---

## 故障排除

### 未检测到代理

**症状：** `/ccproxy status` 显示"未检测到运行中的代理软件"

**解决方案：**
1. 启动你的代理软件（Clash、V2Ray 等）
2. 确保代理在预期端口上监听
3. 再次运行 `/ccproxy status` 验证检测

### 端口关闭

**症状：** 状态显示检测到的软件为 ❌ 关闭

**解决方案：**
1. 检查代理软件设置 — 确保已启用"允许局域网"
2. 验证端口号与软件配置一致
3. 运行 `/ccproxy change` 使用正确的端口重新配置

### 连接仍然失败

**症状：** 代理设置后网络错误仍然存在

**解决方案：**
1. 运行 `/ccproxy status` — 验证代理已检测且端口开放
2. 手动测试代理：`curl -x http://127.0.0.1:7890 https://google.com`
3. 检查代理软件日志中的连接错误
4. 尝试 `/ccproxy change` 使用不同的端口或软件

### 写入 CLAUDE.md 权限被拒绝

**症状：** `/ccproxy init` 因权限错误失败

**解决方案：**
- 模式 A：确保 `~/.claude/` 目录存在且可写
- 模式 B：确保当前目录可写
- 尝试以管理员身份运行终端（Windows）或使用 sudo（Linux/Mac）

---

## 高级用法

### 使用不同的代理软件

ccproxy 通过 `/ccproxy change` 中的"其他"选项支持自定义代理软件：

1. 选择"其他（自定义）"
2. 输入代理类型：`http`、`https` 或 `socks5`
3. 输入软件名称（用于显示）
4. 输入进程匹配模式（如 `my-proxy.exe`）

### 切换模式

再次运行 `/ccproxy init` 切换模式：
- 自动从 CLAUDE.md 中清理旧模式的内容
- 写入新模式的内容
- 代理配置被保留

### 手动检测

直接使用 `detect.mjs` 进行故障排除：

```bash
# 完整检测报告
node ~/.claude/skills/ccproxy/scripts/detect.mjs

# JSON 输出（用于脚本）
node ~/.claude/skills/ccproxy/scripts/detect.mjs --json

# 测试特定域名
node ~/.claude/skills/ccproxy/scripts/detect.mjs --test-domain github.com

# 测试代理端口
node ~/.claude/skills/ccproxy/scripts/detect.mjs --test-proxy 127.0.0.1:7890

# 使用 HTTP CONNECT 验证代理
node ~/.claude/skills/ccproxy/scripts/detect.mjs --validate 127.0.0.1:7890
```

---

## 常见问题

**问：ccproxy 会修改我的系统代理设置吗？**
答：不会。它仅为当前会话导出 `HTTP_PROXY` 和 `HTTPS_PROXY` 环境变量，不做永久性修改。

**问：ccproxy 可以和 VPN 软件一起使用吗？**
答：可以，如果你的 VPN 暴露了本地 SOCKS5 或 HTTP 代理端口，请使用 `/ccproxy change` 中的"其他"选项。

**问：为什么 ccproxy 使用 TCP 探测而不是域名列表？**
答：域名列表需要持续维护，且无法适应网络变化。TCP 探测根据实际网络状况判断连通性。

**问：ccproxy 支持 Windows/Mac/Linux 吗？**
答：支持。它会自动使用各平台对应的命令（`tasklist`/`ps aux`、`netstat`/`ss`）。

**问：如何更新 ccproxy？**
答：拉取最新代码：
```bash
cd ~/.claude/skills/ccproxy && git pull
```

---

## 许可证

MIT

---

## 参与贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request
