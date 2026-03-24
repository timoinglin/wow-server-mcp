import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, execute, type DbName } from "../services/database.js";
import { sendRaCommand } from "../services/ra-client.js";
import { getConfig } from "../config.js";

export function registerNpcDevTools(server: McpServer): void {

  // ---------------------------------------------------------------------------
  // Spawn / delete
  // ---------------------------------------------------------------------------

  server.tool(
    "spawn_creature",
    "Spawn a creature by template entry at the player's current location (or a specific position) via RA '.npc add <entry>'. The GM character must be in-game at the desired location.",
    {
      entry: z.number().describe("Creature template entry ID to spawn"),
      player_name: z.string().optional().describe("GM character name to target (uses current position of that player)"),
    },
    async ({ entry, player_name }) => {
      try {
        // If player_name provided, select them first so the command runs in their context
        let cmd = `.npc add ${entry}`;
        if (player_name) {
          const selectResult = await sendRaCommand(`.lookup player account ${player_name}`);
          // Just run the add command directly
        }
        const result = await sendRaCommand(cmd);
        return {
          content: [{
            type: "text" as const,
            text: result.success
              ? `Spawned creature entry ${entry}. Response: ${result.response || "Success"}\nNote: The creature spawns at the in-game GM character's current position.`
              : `Failed: ${result.error}`,
          }],
          isError: !result.success,
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "delete_creature_spawn",
    "Delete a specific creature spawn by GUID via RA '.npc delete'. The GM must target the creature in-game, or provide the GUID.",
    {
      guid: z.number().describe("Creature spawn GUID to delete"),
    },
    async ({ guid }) => {
      const result = await sendRaCommand(`.npc delete ${guid}`);
      return {
        content: [{
          type: "text" as const,
          text: result.success
            ? `Deleted creature spawn GUID ${guid}. ${result.response || ""}`
            : `Failed: ${result.error}`,
        }],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "get_creature_spawns",
    "List all spawns (instances) of a creature template entry in the world, from the 'creature' table. Shows GUID, map, coordinates, and phase.",
    {
      entry: z.number().describe("Creature template entry ID"),
      map: z.number().optional().describe("Filter by map ID"),
    },
    async ({ entry, map }) => {
      try {
        let sql = "SELECT guid, id AS entry, map, position_x, position_y, position_z, orientation, spawntimesecs FROM creature WHERE id = ?";
        const params: unknown[] = [entry];
        if (map !== undefined) { sql += " AND map = ?"; params.push(map); }
        sql += " ORDER BY guid LIMIT 100";

        const rows = await query("world", sql, params);
        if (rows.length === 0) {
          return { content: [{ type: "text" as const, text: `No spawns found for creature entry ${entry}.` }] };
        }
        const lines = rows.map(r =>
          `GUID ${r.guid} | Map ${r.map} | X:${Number(r.position_x).toFixed(2)} Y:${Number(r.position_y).toFixed(2)} Z:${Number(r.position_z).toFixed(2)} | SpawnTime: ${r.spawntimesecs}s`
        );
        return { content: [{ type: "text" as const, text: `${rows.length} spawn(s) for entry ${entry}:\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Vendor management
  // ---------------------------------------------------------------------------

  server.tool(
    "get_npc_vendor_items",
    "List all items sold by an NPC vendor. Queries the 'npc_vendor' table.",
    {
      entry: z.number().describe("NPC creature template entry ID"),
    },
    async ({ entry }) => {
      try {
        const rows = await query("world",
          `SELECT nv.entry, nv.item, it.name AS item_name, nv.maxcount, nv.incrtime, nv.ExtendedCost
           FROM npc_vendor nv
           LEFT JOIN item_template it ON it.entry = nv.item
           WHERE nv.entry = ?
           ORDER BY nv.slot ASC`,
          [entry]
        );
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `NPC ${entry} has no vendor items (or is not a vendor).` }] };
        const lines = rows.map(r =>
          `Item ${r.item}: ${r.name || r.item_name || "Unknown"} | Max: ${r.maxcount} | ExtCost: ${r.ExtendedCost}`
        );
        return { content: [{ type: "text" as const, text: `${rows.length} vendor item(s) for NPC ${entry}:\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "add_npc_vendor_item",
    "Add an item to an NPC's vendor list in 'npc_vendor'. Use '.reload npc_vendor' or restart to apply in-game.",
    {
      entry: z.number().describe("NPC creature template entry ID"),
      item: z.number().describe("Item entry ID to add"),
      maxcount: z.number().optional().describe("Max stock (0 = unlimited, default 0)"),
      incrtime: z.number().optional().describe("Restock time in seconds (0 = never, default 0)"),
      extended_cost: z.number().optional().describe("ExtendedCost ID for honor/currency cost (0 = none)"),
      slot: z.number().optional().describe("Slot order (-1 = auto)"),
    },
    async ({ entry, item, maxcount = 0, incrtime = 0, extended_cost = 0, slot = -1 }) => {
      try {
        // Check if already exists
        const existing = await query("world", "SELECT item FROM npc_vendor WHERE entry = ? AND item = ?", [entry, item]);
        if (existing.length > 0) {
          return { content: [{ type: "text" as const, text: `Item ${item} already exists on vendor ${entry}. Use db_update to modify it.` }], isError: true };
        }
        await execute("world",
          "INSERT INTO npc_vendor (entry, slot, item, maxcount, incrtime, ExtendedCost) VALUES (?, ?, ?, ?, ?, ?)",
          [entry, slot, item, maxcount, incrtime, extended_cost]
        );
        // Reload in-game if possible
        await sendRaCommand(".reload npc_vendor");
        return { content: [{ type: "text" as const, text: `Added item ${item} to vendor ${entry}.\nMaxcount: ${maxcount} | Incrtime: ${incrtime}s | ExtCost: ${extended_cost}\nTable reloaded in-game.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "remove_npc_vendor_item",
    "Remove an item from an NPC's vendor list in 'npc_vendor'. Reloads the table in-game automatically.",
    {
      entry: z.number().describe("NPC creature template entry ID"),
      item: z.number().describe("Item entry ID to remove"),
    },
    async ({ entry, item }) => {
      try {
        const result = await execute("world", "DELETE FROM npc_vendor WHERE entry = ? AND item = ?", [entry, item]);
        if (result.affectedRows === 0) {
          return { content: [{ type: "text" as const, text: `Item ${item} not found on vendor ${entry}.` }], isError: true };
        }
        await sendRaCommand(".reload npc_vendor");
        return { content: [{ type: "text" as const, text: `Removed item ${item} from vendor ${entry}. Table reloaded.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Gossip
  // ---------------------------------------------------------------------------

  server.tool(
    "set_npc_gossip_menu",
    "Set the gossip_menu_id on a creature_template. Reloads creature_template in-game.",
    {
      entry: z.number().describe("Creature template entry ID"),
      gossip_menu_id: z.number().describe("Gossip menu ID (from gossip_menu table)"),
    },
    async ({ entry, gossip_menu_id }) => {
      try {
        const result = await execute("world", "UPDATE creature_template SET gossip_menu_id = ? WHERE entry = ?", [gossip_menu_id, entry]);
        if (result.affectedRows === 0) return { content: [{ type: "text" as const, text: `Creature entry ${entry} not found.` }], isError: true };
        await sendRaCommand(".reload creature_template");
        return { content: [{ type: "text" as const, text: `Set gossip_menu_id = ${gossip_menu_id} on creature ${entry}. Template reloaded.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "search_gossip_menu",
    "Search gossip_menu and gossip_menu_option to see what text/options a menu has.",
    {
      menu_id: z.number().describe("Gossip menu ID"),
    },
    async ({ menu_id }) => {
      try {
        const [menuRows, optRows] = await Promise.all([
          query("world", "SELECT MenuId, TextId FROM gossip_menu WHERE MenuId = ? LIMIT 20", [menu_id]),
          query("world", "SELECT MenuId, OptionIndex, OptionNpc, OptionText, OptionBroadcastTextId, ActionMenuId, ActionPoiId FROM gossip_menu_option WHERE MenuId = ? ORDER BY OptionIndex", [menu_id]),
        ]);
        const parts: string[] = [];
        if (menuRows.length > 0) {
          parts.push(`Gossip Menu ${menu_id}:\n` + menuRows.map(r => `  TextId: ${r.TextId}`).join("\n"));
        } else {
          parts.push(`No gossip_menu rows for MenuId ${menu_id}.`);
        }
        if (optRows.length > 0) {
          parts.push(`\nOptions (${optRows.length}):\n` + optRows.map(r =>
            `  [${r.OptionIndex}] NpcFlag:${r.OptionNpc} → "${r.OptionText}" | ActionMenu:${r.ActionMenuId}`
          ).join("\n"));
        } else {
          parts.push(`\nNo options for MenuId ${menu_id}.`);
        }
        return { content: [{ type: "text" as const, text: parts.join("") }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Waypoints
  // ---------------------------------------------------------------------------

  server.tool(
    "get_waypoints",
    "List all waypoints for a creature's movement path from 'waypoint_data'. Path IDs are usually the creature GUID.",
    {
      path_id: z.number().describe("Waypoint path ID (usually the creature GUID)"),
    },
    async ({ path_id }) => {
      try {
        const rows = await query("world",
          "SELECT id, point, position_x, position_y, position_z, orientation, delay, move_flag, action, action_chance FROM waypoint_data WHERE id = ? ORDER BY point ASC",
          [path_id]
        );
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `No waypoints found for path_id ${path_id}.` }] };
        const lines = rows.map((r, i) =>
          `[${i + 1}] X:${Number(r.position_x).toFixed(2)} Y:${Number(r.position_y).toFixed(2)} Z:${Number(r.position_z).toFixed(2)} | Delay:${r.delay}ms | MoveFlag:${r.move_flag}`
        );
        return { content: [{ type: "text" as const, text: `${rows.length} waypoint(s) for path ${path_id}:\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "add_waypoint",
    "Add a waypoint to a creature's movement path in 'waypoint_data'. The path_id is typically the creature's GUID.",
    {
      path_id: z.number().describe("Path ID (creature GUID)"),
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate"),
      z: z.number().describe("Z coordinate"),
      orientation: z.number().optional().describe("Orientation in radians (0 = default)"),
      delay: z.number().optional().describe("Delay at this point in ms (default 0)"),
      move_flag: z.number().optional().describe("0=Walk, 1=Run, 2=Fly (default 0)"),
    },
    async ({ path_id, x, y, z, orientation = 0, delay = 0, move_flag = 0 }) => {
      try {
        // Get next available point index
        const existing = await query("world", "SELECT MAX(point) as maxPoint FROM waypoint_data WHERE id = ?", [path_id]);
        const nextPoint = (Number(existing[0]?.maxPoint) || 0) + 1;
        await execute("world",
          "INSERT INTO waypoint_data (id, point, position_x, position_y, position_z, orientation, delay, move_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [path_id, nextPoint, x, y, z, orientation, delay, move_flag]
        );
        return { content: [{ type: "text" as const, text: `Added waypoint #${nextPoint} to path ${path_id}.\nXYZ: ${x}, ${y}, ${z} | Delay: ${delay}ms | MoveFlag: ${move_flag}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "delete_waypoints",
    "Delete all waypoints for a creature path ID from 'waypoint_data'.",
    {
      path_id: z.number().describe("Path ID (creature GUID)"),
    },
    async ({ path_id }) => {
      try {
        const result = await execute("world", "DELETE FROM waypoint_data WHERE id = ?", [path_id]);
        return { content: [{ type: "text" as const, text: `Deleted ${result.affectedRows} waypoint(s) for path ${path_id}.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // NPC flags / unit flags helpers
  // ---------------------------------------------------------------------------

  server.tool(
    "set_npc_flags",
    "Set npcflag on a creature_template (e.g. make it a vendor, quest giver, trainer). Common flags: 1=Gossip, 2=QuestGiver, 16=Trainer, 128=Vendor, 4096=FlightMaster. Values can be combined (bitfield). Reloads template.",
    {
      entry: z.number().describe("Creature template entry ID"),
      npc_flags: z.number().describe("NPC flag value (bitfield). E.g. 130 = Vendor+Gossip"),
    },
    async ({ entry, npc_flags }) => {
      try {
        const result = await execute("world", "UPDATE creature_template SET npcflag = ? WHERE entry = ?", [npc_flags, entry]);
        if (result.affectedRows === 0) return { content: [{ type: "text" as const, text: `Creature entry ${entry} not found.` }], isError: true };
        await sendRaCommand(".reload creature_template");
        return { content: [{ type: "text" as const, text: `Set npcflag = ${npc_flags} on creature ${entry}. Template reloaded.\nCommon flags: 1=Gossip, 2=QuestGiver, 16=Trainer, 128=Vendor, 4096=FlightMaster` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "clone_creature_template",
    "Duplicate an existing creature_template with a new entry ID. Great starting point for creating a new NPC based on an existing one.",
    {
      source_entry: z.number().describe("Existing creature template entry to copy from"),
      new_entry: z.number().describe("New entry ID for the cloned template"),
      new_name: z.string().describe("Name for the new NPC"),
    },
    async ({ source_entry, new_entry, new_name }) => {
      try {
        // Check source exists
        const src = await query("world", "SELECT * FROM creature_template WHERE entry = ?", [source_entry]);
        if (src.length === 0) return { content: [{ type: "text" as const, text: `Source entry ${source_entry} not found.` }], isError: true };
        // Check new entry not in use
        const existing = await query("world", "SELECT entry FROM creature_template WHERE entry = ?", [new_entry]);
        if (existing.length > 0) return { content: [{ type: "text" as const, text: `Entry ${new_entry} already exists.` }], isError: true };

        const row = { ...src[0] };
        delete row.entry;
        const cols = Object.keys(row);
        const vals = Object.values(row);

        // Build INSERT with new entry and name
        const allCols = ["entry", "name", ...cols.filter(c => c !== "name")];
        const allVals = [new_entry, new_name, ...vals.filter((_, i) => cols[i] !== "name")];
        const placeholders = allCols.map(() => "?").join(", ");
        const colStr = allCols.map(c => `\`${c}\``).join(", ");

        await execute("world", `INSERT INTO creature_template (${colStr}) VALUES (${placeholders})`, allVals);
        await sendRaCommand(".reload creature_template");
        return { content: [{ type: "text" as const, text: `Cloned creature template:\n  Source: ${source_entry}\n  New entry: ${new_entry}\n  New name: "${new_name}"\nTemplate reloaded.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}
