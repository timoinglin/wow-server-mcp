# Emucoach MCP Server

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A complete local **MCP (Model Context Protocol)** server for managing an **Emucoach WoW: Mists of Pandaria** private server (V7.0) with MySQL.

## What Can the Agent Do?

Once connected, an AI agent (Claude, Gemini, Antigravity, OpenClaw, or any MCP-compatible client) gets **full control over your WoW server** through natural language. No need to touch the database, config files, or console manually — just ask.

- 🚀 **Start / stop / restart** MySQL, authserver and worldserver
- 🗄️ **Query and edit the database** — run any SELECT, INSERT, UPDATE or DELETE
- 👤 **Manage accounts** — create accounts, set GM levels, grant Donation Points
- 🐉 **Edit NPCs** — change name, level, health, faction, loot, add vendors, etc.
- 📜 **Edit quests and items** — update rewards, requirements, stats on the fly
- ⚙️ **Edit server config** — change rates, caps, realm settings in `worldserver.conf`
- 📡 **Send any RA command** — anything you'd type in the worldserver console
- 📊 **Monitor the server** — uptime, online players, DB statistics

> In short: if you can do it in-game as a GM or via the database, the agent can do it for you.

## Demo Videos

| What | Link |
|---|---|
| 🛒 Add a vendor to the world | [Watch on YouTube](https://youtu.be/LAPUUya4cBg?si=-Vc6WV5icljwZToh) |
| ⚔️ Update NPC stats | [Watch on YouTube](https://youtu.be/tQlK2906EP8?si=W6zHoNa8jaXjq31M) |
| ⚙️ Change server rates | [Watch on YouTube](https://youtu.be/qTEbw1xV3S0?si=zb7n_MQpAz94jET_) |

## Quick Start

> [!IMPORTANT]
> **Clone this repo into the root folder of your Emucoach repack.** The server paths in `config.json` are relative and rely on this exact layout:
> ```
> 📁 YourRepackFolder\
> ├── 📁 Database\
> ├── 📁 emucoach-mcp\   ← clone here
> └── 📁 Repack\
> ```
> ```bash
> cd "C:\path\to\YourRepackFolder"
> git clone https://github.com/timoinglin/emucoach-mcp.git
> ```

### 1. Install & Build (One-Click)

Double-click **`install.bat`** inside the `emucoach-mcp` folder.  
It will automatically:
- Check for Node.js and install it via `winget` if missing
- Copy `example.config.json` → `config.json`
- Run `npm install`
- Build the TypeScript project (`npm run build`)

> **Manual alternative:**
> ```bash
> cd emucoach-mcp
> npm install
> npm run build
> ```

### 2. Configure
Open `config.json` and update:
- **Database credentials** — default: `root` / `ascent` on `localhost:3306`
- **RA credentials** — create a GM account first (level 3+), then set username/password
- **Server paths** — should be correct for the default repack layout

### 3. Enable Remote Access (RA) on the Worldserver
In `Repack/worldserver.conf`:
```
Ra.Enable = 1
Ra.IP     = 127.0.0.1
Ra.Port   = 3443
```
Then restart the worldserver and set the matching credentials in `config.json` under `remote_access`.

### 4. Add to Your AI Client

Replace `<REPACK_PATH>` with the absolute path to your repack folder.  
Use **forward slashes `/`** even on Windows (e.g. `C:/Games/mop_repack/MOPFREE`).

---

**🟣 Antigravity (VSCode extension)**  
File: `C:\Users\<you>\.gemini\antigravity\mcp_config.json`
```json
{
  "mcpServers": {
    "emucoach": {
      "command": "node",
      "args": ["<REPACK_PATH>/emucoach-mcp/dist/index.js"],
      "cwd": "<REPACK_PATH>/emucoach-mcp"
    }
  }
}
```

---

**🟠 Claude Desktop**  
File: `C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`
```json
{
  "mcpServers": {
    "emucoach": {
      "command": "node",
      "args": ["<REPACK_PATH>/emucoach-mcp/dist/index.js"],
      "cwd": "<REPACK_PATH>/emucoach-mcp"
    }
  }
}
```

---

**🔵 VS Code (GitHub Copilot / Cline / OpenClaw / other MCP extensions)**  
File: `.vscode/mcp.json` inside your project, or via the extension's settings UI — check your extension's docs for the exact location. The JSON block is the same as above.

---

After saving, **restart your AI client** and the `emucoach` server will appear in the available tools list.

## Available Tools (43 total)

### Config Management (3)
| Tool | Description |
|---|---|
| `get_config` | Read current config.json |
| `update_config` | Update config fields (deep merge) |
| `reset_config` | Reset to example defaults |

### Database Access (6)
| Tool | Description |
|---|---|
| `db_query` | SELECT queries (parameterized) |
| `db_insert` | Insert rows |
| `db_update` | Update rows with WHERE |
| `db_delete` | Delete rows with WHERE |
| `db_execute` | Raw SQL execution |
| `db_test_connection` | Test DB connectivity |

### RA Commands (2)
| Tool | Description |
|---|---|
| `ra_command` | Send single RA command |
| `ra_command_batch` | Send multiple commands |

### Process Management (10)
| Tool | Description |
|---|---|
| `start_mysql` / `stop_mysql` / `restart_mysql` | MySQL control |
| `start_authserver` / `stop_authserver` / `restart_authserver` | Auth control |
| `start_worldserver` / `stop_worldserver` / `restart_worldserver` | World control |
| `get_server_status` | Check all processes |

### Account Management (7)
| Tool | Description |
|---|---|
| `create_account` | Create game account via RA |
| `set_gm_level` | Set GM level (0-9) |
| `set_account_password` | Change password |
| `modify_dp` | Set DP (Battle Pay) |
| `add_dp` | Add/subtract DP |
| `list_accounts` | List all accounts |
| `get_account_characters` | List characters for account |

### Server Config Files (5)
| Tool | Description |
|---|---|
| `read_server_config` | Read allowed config files |
| `write_server_config` | Write config files |
| `get_conf_value` | Get specific .conf setting |
| `update_conf_value` | Update specific .conf setting |
| `list_allowed_files` | List allowed files |

### Lookup & Editing (10)
| Tool | Description |
|---|---|
| `search_creature_template` / `get_creature_template` / `update_creature_template` | NPC management |
| `search_quest_template` / `get_quest_template` / `update_quest_template` | Quest management |
| `search_item_template` / `get_item_template` / `update_item_template` | Item management |
| `search_gameobject_template` | Gameobject search |
| `get_server_info` | Server uptime/players via RA |
| `get_online_players` | Online players from DB |
| `get_db_stats` | Database statistics |

## Prerequisites

- **Node.js** 18+ (tested with v24.13.0)
- **MySQL** running (via the repack's MySQL.bat)
- **Worldserver** running (for RA commands)
- A **GM account** with level 3+ (for RA access)

## Project Structure

```
emucoach-mcp/
├── src/
│   ├── index.ts              — Entry point
│   ├── config.ts             — Config loader/writer
│   ├── services/
│   │   ├── database.ts       — MySQL connection pools
│   │   ├── ra-client.ts      — Telnet RA client
│   │   ├── process-manager.ts— Process start/stop
│   │   └── file-manager.ts   — Config file I/O
│   └── tools/
│       ├── config-tools.ts
│       ├── database-tools.ts
│       ├── ra-tools.ts
│       ├── process-tools.ts
│       ├── account-tools.ts
│       ├── server-config-tools.ts
│       └── lookup-tools.ts
├── dist/                     — Compiled JavaScript
├── install.bat               — One-click installer (double-click me!)
├── install.ps1               — Installer script (called by install.bat)
├── config.json               — Your local config (never commit this)
├── example.config.json       — Template config
└── package.json
```
