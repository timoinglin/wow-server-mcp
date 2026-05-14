# WoW Server MCP

[![Version](https://img.shields.io/badge/version-1.3.3-brightgreen.svg)](https://github.com/timoinglin/wow-server-mcp/releases)
[![Build](https://github.com/timoinglin/wow-server-mcp/actions/workflows/build.yml/badge.svg)](https://github.com/timoinglin/wow-server-mcp/actions/workflows/build.yml)
[![MCP](https://img.shields.io/badge/MCP-compatible-8A2BE2.svg)](https://modelcontextprotocol.io)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-18%2B-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A local **[MCP](https://modelcontextprotocol.io)** server that lets any MCP-compatible AI client (Claude, Codex, Cursor, etc.) manage a standalone World of Warcraft private server. Built and tested for **Cata / MoP repacks** with MySQL — works with any repack once configured.

> **TL;DR:** if you can do it in-game as a GM or via the database, the agent can do it for you.

## Table of Contents

- [What the Agent Can Do](#what-the-agent-can-do)
- [Why an MCP Instead of Raw Credentials?](#why-an-mcp-instead-of-raw-credentials)
- [Demo Videos](#demo-videos)
- [Quick Start](#quick-start)
- [Dynamic Schema (Any Expansion)](#dynamic-schema-any-expansion)
- [Available Tools (76 total)](#available-tools-76-total)
- [Database Backups](#database-backups)
- [Updating](#updating)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Releases](#releases)

---

## What the Agent Can Do

Once connected, the AI gets full control over your WoW server through natural language.

| Category | Capabilities |
|:---|:---|
| 🚀 **Server Control** | Start / stop / restart MySQL, authserver, worldserver |
| 🗄️ **Database** | Run any SELECT, INSERT, UPDATE, DELETE — or use scoped helpers |
| 👤 **Accounts** | Create accounts, set GM levels, grant Donation Points |
| 🐉 **NPCs** | Clone templates, set flags, manage vendors, gossip menus, waypoints |
| 📜 **Quests** | Create quests, assign giver/ender NPCs, manage rewards & relations |
| 💎 **Loot** | Add/remove creature drops, search which mobs drop an item |
| 🔮 **Spells & Events** | Look up spells from `spell_dbc`, view world events |
| 📍 **Teleports** | Find coordinates and map positions for NPC placement |
| ⚙️ **Config** | Edit rates, caps, realm settings in `worldserver.conf` |
| 📡 **Remote Access** | Send any RA command — anything you'd type in the worldserver console |
| 📊 **Monitoring** | Uptime, online players, DB statistics |
| 💾 **Backups** | Full or table-specific `mysqldump` with `WHERE` clause support |

## Why an MCP Instead of Raw Credentials?

You *could* hand the AI your DB password and RA port and let it figure things out — but a dedicated MCP is significantly better:

| | Raw Credentials | MCP Server |
|:---|:---|:---|
| **Reliability** | Agent guesses SQL column names | Pre-built queries matched to your exact schema |
| **Speed** | Writes + debugs SQL from scratch every time | Instant tool calls — no trial and error |
| **Safety** | Unrestricted DB access (`DROP TABLE` is one prompt away) | Scoped tools with built-in validation and `WHERE` guards |
| **Token cost** | Burns tokens on boilerplate SQL and schema reads | Just the tool name and parameters |
| **Consistency** | Different results depending on the model's mood | Same reliable output every time |
| **Portability** | Prompts break when you switch AI clients | Works with any MCP-compatible client |

## Demo Videos

| What | Link |
|:---|:---|
| 🛠️ How to set it up | [Watch on YouTube](https://youtu.be/-z8X3xofVEA) |
| 🛒 Add a vendor to the world | [Watch on YouTube](https://youtu.be/LAPUUya4cBg?si=-Vc6WV5icljwZToh) |
| ⚔️ Update NPC stats | [Watch on YouTube](https://youtu.be/tQlK2906EP8?si=W6zHoNa8jaXjq31M) |
| ⚙️ Change server rates | [Watch on YouTube](https://youtu.be/qTEbw1xV3S0?si=zb7n_MQpAz94jET_) |

---

## Quick Start

> [!IMPORTANT]
> The default `config.json` and 1-click installer assume the standard folder layout used by most **Cata / MoP repacks**. You can install anywhere — just edit the paths in `config.json` to point at your repack's executables and config files.
>
> **Recommended layout** (works with default config paths):
> ```
> 📁 YourRepackFolder\
> ├── 📁 Database\
> ├── 📁 Repack\
> └── 📁 wow-server-mcp\   ← clone here
> ```
> ```bash
> cd "C:\path\to\YourRepackFolder"
> git clone https://github.com/timoinglin/wow-server-mcp.git
> ```

### 1. Install & Build

**Easy (Windows):** double-click `install.bat`. It checks for Node.js (installs via `winget` if missing), copies `example.config.json` → `config.json`, runs `npm install`, and builds.

**Manual (any OS):**
```bash
cd wow-server-mcp
cp example.config.json config.json   # Windows: copy example.config.json config.json
npm install
npm run build
```

### 2. Configure

Edit `config.json`:
- **Database credentials** — defaults to `root` / `ascent` on `localhost:3306`
- **RA credentials** — set after creating a GM account (level 3+)
- **Server paths** — only change if your folder layout differs from the recommended one above

### 3. Enable Remote Access (RA) on the Worldserver

In `Repack/worldserver.conf`:
```
Ra.Enable = 1
Ra.IP     = 127.0.0.1
Ra.Port   = 3443
```
Restart the worldserver and put the matching credentials in `config.json` under `remote_access`.

### 4. Add to Your AI Client

Replace `<REPACK_PATH>` below with the absolute path to your repack folder.
Use **forward slashes `/`** even on Windows (e.g. `C:/Games/mop_repack/MOPFREE`).

After adding the config, **restart your AI client**; `wow-server` will appear in its tool list.

---

#### 🟠 Claude Desktop

Open **Settings → Developer → Edit Config**, or edit the file directly:

| OS | Path |
|:---|:---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux   | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "wow-server": {
      "command": "node",
      "args": ["<REPACK_PATH>/wow-server-mcp/dist/index.js"]
    }
  }
}
```

If the file already exists, merge the `"wow-server"` entry into the existing `mcpServers` object. Quit Claude from the tray icon (right-click → Quit) before relaunching — closing the window leaves it running in the background.

---

#### 🟢 Claude Code (VS Code extension / CLI)

**Easiest — one command:**

```bash
claude mcp add wow-server -s user -- node "<REPACK_PATH>/wow-server-mcp/dist/index.js"
```

`-s user` makes the server available in every project. Use `-s project` to scope it to the current workspace (writes `.mcp.json` to the project root).

**Or edit the project-scoped file by hand**, `<your-project>/.mcp.json`:

```json
{
  "mcpServers": {
    "wow-server": {
      "type": "stdio",
      "command": "node",
      "args": ["<REPACK_PATH>/wow-server-mcp/dist/index.js"]
    }
  }
}
```

Reload VS Code (`Ctrl+Shift+P` → "Developer: Reload Window"). For project-scoped servers, Claude prompts once to approve — click **approve**. Verify with `/mcp` inside Claude Code.

---

#### 🔷 Codex CLI

Add to `~/.codex/config.toml` (create the file if it doesn't exist):

```toml
[mcp_servers.wow-server]
command = "node"
args = ["<REPACK_PATH>/wow-server-mcp/dist/index.js"]
```

Start a fresh `codex` session. Tools appear under the namespace `mcp__wow-server__*`.

---

#### 🟣 Antigravity (Google's VS Code-based agent IDE)

**Easiest — built-in UI:** click the **Agent Manager** icon in the top bar, then the **⋯ menu → MCP Servers** and add a new server with:

- **Command:** `node`
- **Args:** `<REPACK_PATH>/wow-server-mcp/dist/index.js`

**Or edit the config file directly** at `C:\Users\<you>\.gemini\antigravity\mcp_config.json`:

```json
{
  "mcpServers": {
    "wow-server": {
      "command": "node",
      "args": ["<REPACK_PATH>/wow-server-mcp/dist/index.js"],
      "cwd": "<REPACK_PATH>/wow-server-mcp"
    }
  }
}
```

---

## Dynamic Schema (Any Expansion)

The MCP ships with the Cata / MoP TrinityCore schema baked in, but it can adapt to any repack — Wrath, Cataclysm, MoP, Legion, AzerothCore variants — by overriding column names.

To set it up for a non-default core:

1. Complete the [Quick Start](#quick-start) so the AI can reach your database.
2. Ask the AI to **run the `discover_schema` tool**. It scans `INFORMATION_SCHEMA` and writes a `schema_override.json` tailored to your DB.
3. The default `example.config.json` already sets `"schemaOverride": "schema_override.json"` — so if you copied that as your `config.json`, the file is picked up on the next start. If your `config.json` doesn't have that line, add it.
4. Restart your AI client. Look for `Schema override loaded from …` in the MCP server's stderr to confirm.

---

## Available Tools (76 total)

### Config Management (4)
| Tool | Description |
|:---|:---|
| `get_config` | Read current config.json |
| `update_config` | Update config fields (deep merge; `config_files` is read-only) |
| `reset_config` | Reset to example defaults |
| `discover_schema` | Auto-detect DB structure for custom repacks |

### Database Access (7)
| Tool | Description |
|:---|:---|
| `db_query` | Parameterized `SELECT` queries |
| `db_insert` | Insert a row |
| `db_update` | Update with `WHERE` |
| `db_delete` | Delete with `WHERE` |
| `db_execute` | Raw SQL (DDL, complex joins, etc.) |
| `db_test_connection` | Test DB connectivity |
| `create_db_backup` | Full or table-specific `mysqldump` with optional `WHERE` |

### RA Commands (2)
| Tool | Description |
|:---|:---|
| `ra_command` | Send a single RA command |
| `ra_command_batch` | Send multiple commands in sequence |

### Process Management (10)
| Tool | Description |
|:---|:---|
| `start_mysql` / `stop_mysql` / `restart_mysql` | MySQL control |
| `start_authserver` / `stop_authserver` / `restart_authserver` | Auth control |
| `start_worldserver` / `stop_worldserver` / `restart_worldserver` | World control |
| `get_server_status` | Check all processes |

### Account Management (7)
| Tool | Description |
|:---|:---|
| `create_account` | Create game account via RA |
| `set_gm_level` | Set GM level (0–9) |
| `set_account_password` | Change password |
| `modify_dp` | Set DP (Battle Pay) balance |
| `add_dp` | Add/subtract DP (atomic) |
| `list_accounts` | List all accounts |
| `get_account_characters` | List characters for an account |

### Server Config Files (5)
| Tool | Description |
|:---|:---|
| `read_server_config` | Read allowed config files |
| `write_server_config` | Write allowed config files |
| `get_conf_value` | Get a single `.conf` setting |
| `update_conf_value` | Update a single `.conf` setting |
| `list_allowed_files` | List which config files are accessible |

### Lookup & Editing (13)
| Tool | Description |
|:---|:---|
| `search_creature_template` / `get_creature_template` / `update_creature_template` | NPC lookup & editing |
| `search_quest_template` / `get_quest_template` / `update_quest_template` | Quest lookup & editing |
| `search_item_template` / `get_item_template` / `update_item_template` | Item lookup & editing |
| `search_gameobject_template` | Gameobject search |
| `get_server_info` | Server uptime/players via RA |
| `get_online_players` | Online players from DB |
| `get_db_stats` | Database statistics |

### NPC Development (13)
| Tool | Description |
|:---|:---|
| `spawn_creature` | Spawn NPC at GM's in-game position via RA |
| `delete_creature_spawn` | Delete a creature spawn by GUID |
| `get_creature_spawns` | List all spawns of a creature entry |
| `clone_creature_template` | Duplicate existing NPC with new entry & name |
| `set_npc_flags` | Set npcflag bitfield (Vendor, QuestGiver, Trainer, etc.) |
| `set_npc_gossip_menu` | Set gossip menu ID on a creature template |
| `search_gossip_menu` | View gossip menu options and text IDs |
| `get_npc_vendor_items` | List items sold by a vendor NPC |
| `add_npc_vendor_item` | Add item to vendor inventory (auto-reloads) |
| `remove_npc_vendor_item` | Remove item from vendor (auto-reloads) |
| `get_waypoints` | List waypoints for a creature path |
| `add_waypoint` | Add waypoint to creature path |
| `delete_waypoints` | Delete all waypoints for a path |

### Quest Development (7)
| Tool | Description |
|:---|:---|
| `create_quest` | Create new quest with title, levels, rewards |
| `delete_quest` | Delete quest and all NPC relations |
| `set_quest_giver` | Assign NPC as quest starter (auto-sets QuestGiver flag) |
| `set_quest_ender` | Assign NPC as quest turn-in (auto-sets QuestGiver flag) |
| `remove_quest_relation` | Remove giver/ender relations |
| `get_quest_relations` | Show all NPCs/GOs that give/finish a quest |
| `get_quest_rewards` | Show reward items, choices, XP, money |

### Loot & World Data (8)
| Tool | Description |
|:---|:---|
| `get_creature_loot` | List loot table for a creature (with item names) |
| `add_creature_loot_item` | Add item to creature loot (chance, qty, quest-only) |
| `remove_creature_loot_item` | Remove item from creature loot |
| `search_loot_by_item` | Find which creatures drop a given item |
| `get_item_loot` | Get loot contents of a container item |
| `search_spell` | Search spells by name or ID from `spell_dbc` |
| `get_world_events` | List world events with active/upcoming status |
| `search_teleport_location` | Find teleport locations by name (with coordinates) |

---

## Database Backups

`create_db_backup` invokes `mysqldump` securely (no shell, password via `MYSQL_PWD` env, identifier validation on table names) and writes to a `backups/` directory next to `wow-server-mcp`. Three modes:

- **Full backup** — pass all three databases (`auth`, `characters`, `world`) for a complete dump.
- **Single database** — pass one database to dump its entire schema.
- **Targeted backup** — pass one database + specific `tables` + an optional `WHERE` clause (e.g. dump `account` rows for `username = 'kneuma'`).

---

## Updating

```bash
cd wow-server-mcp
git pull
npm install
npm run build
```

Then restart your AI client to load the new code.

> [!NOTE]
> `config.json` is gitignored and won't be overwritten. If new options appear in a release, check `example.config.json`.

---

## Prerequisites

- **Node.js** 18+ (tested through v24.x)
- **MySQL** running (the repack's `MySQL.bat` works)
- **Worldserver** running (required for RA-based tools)
- A **GM account** with level 3+ (for RA authentication)

---

## Project Structure

```
wow-server-mcp/
├── src/                   — TypeScript source
├── dist/                  — Compiled JS (generated by `npm run build`)
├── install.bat            — One-click Windows installer
├── install.ps1            — Installer script (called by install.bat)
├── example.config.json    — Template config (commit-safe)
├── config.json            — Your local config (gitignored, has credentials)
└── package.json
```

---

## Releases

Per-version release notes live on the [GitHub Releases page](https://github.com/timoinglin/wow-server-mcp/releases).
