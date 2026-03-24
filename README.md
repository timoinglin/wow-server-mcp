# Emucoach MCP Server

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A complete local **MCP (Model Context Protocol)** server for managing a standalone private server. It was initially tested and built for **Emucoach WoW: Cataclysm and Mists of Pandaria** repacks with MySQL, but technically works on any repack when correctly configured.

## Table of Contents
- [What Can the Agent Do?](#what-can-the-agent-do)
- [Demo Videos](#demo-videos)
- [Quick Start](#quick-start)
- [Available Tools (72 total)](#available-tools-72-total)
- [Database Backups](#database-backups)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)

## What Can the Agent Do?

Once connected, an AI agent (Claude, Gemini, Antigravity, OpenClaw, or any MCP-compatible client) gets **full control over your WoW server** through natural language. No need to touch the database, config files, or console manually — just ask.

- 🚀 **Start / stop / restart** MySQL, authserver and worldserver
- 🗄️ **Query and edit the database** — run any SELECT, INSERT, UPDATE or DELETE
- 👤 **Manage accounts** — create accounts, set GM levels, grant Donation Points
- 🐉 **Create & edit NPCs** — clone templates, set flags, manage vendors, gossip menus, waypoint paths
- 📜 **Build questlines** — create quests, assign giver/ender NPCs, manage rewards & relations
- 💎 **Edit loot tables** — add/remove creature drops, search which mobs drop an item
- 🔮 **Search spells & events** — look up spells from spell_dbc, view world events
- 📍 **Teleport locations** — find coordinates and map positions for NPC placement
- ⚙️ **Edit server config** — change rates, caps, realm settings in `worldserver.conf`
- 📡 **Send any RA command** — anything you'd type in the worldserver console
- 📊 **Monitor the server** — uptime, online players, DB statistics
- 💾 **Backup databases** — full or table-specific mysqldump with WHERE clause support

> In short: if you can do it in-game as a GM or via the database, the agent can do it for you.

## Demo Videos

| What | Link |
|---|---|
| 🛠️ How to set it up | [Watch on YouTube](https://youtu.be/-z8X3xofVEA) |
| 🛒 Add a vendor to the world | [Watch on YouTube](https://youtu.be/LAPUUya4cBg?si=-Vc6WV5icljwZToh) |
| ⚔️ Update NPC stats | [Watch on YouTube](https://youtu.be/tQlK2906EP8?si=W6zHoNa8jaXjq31M) |
| ⚙️ Change server rates | [Watch on YouTube](https://youtu.be/qTEbw1xV3S0?si=zb7n_MQpAz94jET_) |

## Quick Start

> [!IMPORTANT]
> **Compatibility Note**: The default configuration, as well as the 1-click installer, are primarily designed for the standard folder layout of **Emucoach Cata and MoP repacks**.
> 
> However, **you can install and use this MCP server anywhere, with any repack**, simply by modifying the absolute paths inside your `config.json` file to point to your repack's executables and config files.
>
> **Default Recommended Layout** (if using default config paths):
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

## Available Tools (72 total)

### Config Management (3)
| Tool | Description |
|---|---|
| `get_config` | Read current config.json |
| `update_config` | Update config fields (deep merge) |
| `reset_config` | Reset to example defaults |

### Database Access (7)
| Tool | Description |
|---|---|
| `db_query` | SELECT queries (parameterized) |
| `db_insert` | Insert rows |
| `db_update` | Update rows with WHERE |
| `db_delete` | Delete rows with WHERE |
| `db_execute` | Raw SQL execution |
| `db_test_connection` | Test DB connectivity |
| `create_db_backup` | Full or table-specific database dumps |

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
| `search_creature_template` / `get_creature_template` / `update_creature_template` | NPC lookup & editing |
| `search_quest_template` / `get_quest_template` / `update_quest_template` | Quest lookup & editing |
| `search_item_template` / `get_item_template` / `update_item_template` | Item lookup & editing |
| `search_gameobject_template` | Gameobject search |
| `get_server_info` | Server uptime/players via RA |
| `get_online_players` | Online players from DB |
| `get_db_stats` | Database statistics |

### NPC Development (13)
| Tool | Description |
|---|---|
| `spawn_creature` | Spawn NPC at GM's in-game position via RA |
| `delete_creature_spawn` | Delete a creature spawn by GUID |
| `get_creature_spawns` | List all spawns of a creature entry (map, coords, GUID) |
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
|---|---|
| `create_quest` | Create new quest with title, levels, rewards |
| `delete_quest` | Delete quest and all NPC relations |
| `set_quest_giver` | Assign NPC as quest starter (auto-sets QuestGiver flag) |
| `set_quest_ender` | Assign NPC as quest turn-in (auto-sets QuestGiver flag) |
| `remove_quest_relation` | Remove giver/ender relations |
| `get_quest_relations` | Show all NPCs/GOs that give/finish a quest |
| `get_quest_rewards` | Show reward items, choices, XP, money |

### Loot & World Data (8)
| Tool | Description |
|---|---|
| `get_creature_loot` | List loot table for a creature (with item names) |
| `add_creature_loot_item` | Add item to creature loot (chance, qty, quest-only) |
| `remove_creature_loot_item` | Remove item from creature loot |
| `search_loot_by_item` | Find which creatures drop a given item |
| `get_item_loot` | Get loot contents of a container item |
| `search_spell` | Search spells by name or ID from spell_dbc |
| `get_world_events` | List world events with active/upcoming status |
| `search_teleport_location` | Find teleport locations by name (with coordinates) |

## Database Backups

The server includes a powerful built-in `create_db_backup` tool that securely interfaces with your `mysqldump.exe`. All backups generated by the AI agent are cleanly placed into a local `backups/` directory located right beside the `emucoach-mcp` folder. The tool supports three levels of flexibility:
- **Full Backups**: By specifying `auth`, `characters`, and `world`, the tool generates a massive, complete backup file.
- **Single Database Backups**: Dumps an entire single database out to a `.sql` file.
- **Custom / Fine-Grained Backups**: Need to backup a specific user or guild? You can tell the tool to target specific tables (e.g. `['account']`) and provide a SQL `WHERE` clause (e.g. `username = 'kneuma'`) which isolates exactly what you want backed up without dumping unused data.

## Prerequisites

- **Node.js** 18+ (tested with v24.13.0)
- **MySQL** running (via the repack's MySQL.bat)
- **Worldserver** running (for RA commands)
- A **GM account** with level 3+ (for RA access)

## Project Structure

```
emucoach-mcp/
├── src/
│   ├── index.ts              — Entry point (v1.1.0)
│   ├── config.ts             — Config loader/writer
│   ├── services/
│   │   ├── database.ts       — MySQL connection pools
│   │   ├── ra-client.ts      — Persistent RA telnet client
│   │   ├── process-manager.ts— Process start/stop
│   │   └── file-manager.ts   — Config file I/O
│   └── tools/
│       ├── config-tools.ts
│       ├── database-tools.ts
│       ├── ra-tools.ts
│       ├── process-tools.ts
│       ├── account-tools.ts
│       ├── server-config-tools.ts
│       ├── lookup-tools.ts
│       ├── npc-dev-tools.ts      — NPC development tools
│       ├── quest-dev-tools.ts    — Quest development tools
│       └── loot-dev-tools.ts     — Loot & world data tools
├── dist/                     — Compiled JavaScript
├── install.bat               — One-click installer (double-click me!)
├── install.ps1               — Installer script (called by install.bat)
├── config.json               — Your local config (never commit this)
├── example.config.json       — Template config
└── package.json
```
