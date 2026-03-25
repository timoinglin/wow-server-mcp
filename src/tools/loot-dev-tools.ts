import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, execute } from "../services/database.js";

export function registerLootDevTools(server: McpServer): void {

  // ---------------------------------------------------------------------------
  // Creature loot
  // ---------------------------------------------------------------------------

  server.tool(
    "get_creature_loot",
    "List all loot entries for a creature from 'creature_loot_template'. Shows item name, drop chance, and quantity range.",
    {
      entry: z.number().describe("Creature template entry ID (loot_id, which equals the creature entry by default)"),
    },
    async ({ entry }) => {
      try {
        const rows = await query("world",
          `SELECT clt.entry, clt.item, it.name AS item_name, clt.ChanceOrQuestChance AS chance,
                  clt.mincountOrRef AS min_count, clt.maxcount AS max_count, clt.groupid
           FROM creature_loot_template clt
           LEFT JOIN item_template it ON it.entry = clt.item
           WHERE clt.entry = ?
           ORDER BY clt.ChanceOrQuestChance DESC`,
          [entry]
        );
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `No loot found for creature entry ${entry}.` }] };
        const lines = rows.map(r => {
          const isRef = Number(r.min_count) < 0;
          const questOnly = Number(r.chance) < 0;
          const ref = isRef ? ` [Ref→${Math.abs(Number(r.min_count))}]` : "";
          const quest = questOnly ? " [Quest]" : "";
          const chance = Math.abs(Number(r.chance));
          return `  Item ${r.item}: ${r.item_name || "Unknown"}${ref}${quest} | ${chance}% | 1-${r.max_count}x | Group:${r.groupid}`;
        });
        return { content: [{ type: "text" as const, text: `${rows.length} loot entry(s) for creature ${entry}:\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "add_creature_loot_item",
    "Add an item drop to a creature's loot table ('creature_loot_template'). Use negative chance for quest-only drops.",
    {
      creature_entry: z.number().describe("Creature template entry ID"),
      item_id: z.number().describe("Item entry ID to add as loot"),
      chance: z.number().min(-100).max(100).describe("Drop chance % (0-100). Use negative value for quest-only drops."),
      min_count: z.number().optional().describe("Minimum quantity dropped (default 1)"),
      max_count: z.number().optional().describe("Maximum quantity dropped (default 1)"),
      group_id: z.number().optional().describe("Group ID for exclusive loot groups (default 0)"),
    },
    async ({ creature_entry, item_id, chance, min_count = 1, max_count = 1, group_id = 0 }) => {
      try {
        const existing = await query("world",
          "SELECT entry FROM creature_loot_template WHERE entry = ? AND item = ?",
          [creature_entry, item_id]
        );
        if (existing.length > 0) {
          return { content: [{ type: "text" as const, text: `Item ${item_id} already exists in loot for creature ${creature_entry}. Use db_update to modify.` }], isError: true };
        }

        const itemCheck = await query("world", "SELECT name FROM item_template WHERE entry = ?", [item_id]);
        const itemName = itemCheck[0]?.name || "Unknown";

        await execute("world",
          "INSERT INTO creature_loot_template (entry, item, ChanceOrQuestChance, lootmode, groupid, mincountOrRef, maxcount) VALUES (?, ?, ?, 'REGULAR', ?, ?, ?)",
          [creature_entry, item_id, chance, group_id, min_count, max_count]
        );

        const questNote = chance < 0 ? " (Quest-only drop)" : "";
        return {
          content: [{
            type: "text" as const,
            text: `Added loot to creature ${creature_entry}:\n  Item ${item_id}: "${itemName}"${questNote}\n  Chance: ${Math.abs(chance)}% | Qty: ${min_count}-${max_count}\n\nNote: Loot changes apply to newly killed mobs.`,
          }],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "remove_creature_loot_item",
    "Remove an item from a creature's loot table ('creature_loot_template').",
    {
      creature_entry: z.number().describe("Creature template entry ID"),
      item_id: z.number().describe("Item entry ID to remove from loot"),
    },
    async ({ creature_entry, item_id }) => {
      try {
        const result = await execute("world",
          "DELETE FROM creature_loot_template WHERE entry = ? AND item = ?",
          [creature_entry, item_id]
        );
        if (result.affectedRows === 0) {
          return { content: [{ type: "text" as const, text: `Item ${item_id} not found in loot for creature ${creature_entry}.` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: `Removed item ${item_id} from creature ${creature_entry} loot table.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Cross-reference: find which creatures drop an item
  // ---------------------------------------------------------------------------

  server.tool(
    "search_loot_by_item",
    "Find which creatures drop a specific item. Searches 'creature_loot_template' and shows creature names.",
    {
      item_id: z.number().describe("Item entry ID to search for"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ item_id, limit = 20 }) => {
      try {
        const rows = await query("world",
          `SELECT clt.entry AS creature_entry, ct.name AS creature_name,
                  clt.ChanceOrQuestChance AS chance, clt.mincountOrRef AS min_count, clt.maxcount AS max_count
           FROM creature_loot_template clt
           LEFT JOIN creature_template ct ON ct.entry = clt.entry
           WHERE clt.item = ?
           ORDER BY ABS(clt.ChanceOrQuestChance) DESC
           LIMIT ${Number(limit)}`,
          [item_id]
        );

        const itemRow = await query("world", "SELECT name FROM item_template WHERE entry = ?", [item_id]);
        const itemName = itemRow[0]?.name || "Unknown Item";

        if (rows.length === 0) return { content: [{ type: "text" as const, text: `Item ${item_id} ("${itemName}") is not in any creature loot table.` }] };

        const lines = rows.map(r => {
          const questOnly = Number(r.chance) < 0;
          const chance = Math.abs(Number(r.chance));
          const quest = questOnly ? " [Quest]" : "";
          return `  [${r.creature_entry}] ${r.creature_name || "Unknown"} — ${chance}%${quest} | 1-${r.max_count}x`;
        });
        return { content: [{ type: "text" as const, text: `Item ${item_id} "${itemName}" dropped by ${rows.length} creature(s):\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Item loot template (containers, lockboxes, etc.)
  // ---------------------------------------------------------------------------

  server.tool(
    "get_item_loot",
    "Get loot contents of an item (e.g. lockboxes, bags) from 'item_loot_template'.",
    {
      entry: z.number().describe("Item entry ID (the container/lootable item)"),
    },
    async ({ entry }) => {
      try {
        const rows = await query("world",
          `SELECT ilt.entry, ilt.item, it.name AS item_name,
                  ilt.ChanceOrQuestChance AS chance, ilt.mincountOrRef AS min_count, ilt.maxcount AS max_count
           FROM item_loot_template ilt
           LEFT JOIN item_template it ON it.entry = ilt.item
           WHERE ilt.entry = ?
           ORDER BY ilt.ChanceOrQuestChance DESC`,
          [entry]
        );
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `No item loot found for item entry ${entry}.` }] };
        const lines = rows.map(r => `  Item ${r.item}: ${r.item_name || "Unknown"} | ${r.chance}% | ${r.min_count}-${r.max_count}x`);
        return { content: [{ type: "text" as const, text: `${rows.length} item(s) in loot table for item ${entry}:\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Spell search
  // ---------------------------------------------------------------------------

  server.tool(
    "search_spell",
    "Search spells by name in the 'spell_dbc' table. Useful when designing quests (spell cast objectives) or assigning auras to NPCs.",
    {
      search: z.string().describe("Spell name to search (partial match) or numeric spell ID"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ search, limit = 20 }) => {
      try {
        const isNumeric = /^\d+$/.test(search);
        let sql: string;
        let params: unknown[];
        if (isNumeric) {
          sql = `SELECT Id, Comment FROM spell_dbc WHERE Id = ? LIMIT ${Number(limit)}`;
          params = [parseInt(search)];
        } else {
          sql = `SELECT Id, Comment FROM spell_dbc WHERE Comment LIKE ? LIMIT ${Number(limit)}`;
          params = [`%${search}%`];
        }
        const rows = await query("world", sql, params);
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `No spells found matching "${search}".` }] };
        const lines = rows.map(r => `  [${r.Id}] ${r.Comment || "(no comment)"}`);
        return { content: [{ type: "text" as const, text: `${rows.length} spell(s) found:\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error searching spells: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // World events
  // ---------------------------------------------------------------------------

  server.tool(
    "get_world_events",
    "List world events from the 'game_event' table (Hallow's End, Brewfest, etc.) with active status.",
    {},
    async () => {
      try {
        const rows = await query("world",
          `SELECT eventEntry, description, start_time, end_time, occurence, length, holiday, world_event
           FROM game_event
           ORDER BY start_time ASC`,
          []
        );
        if (rows.length === 0) return { content: [{ type: "text" as const, text: "No game events found in game_event table." }] };

        const now = new Date();
        const lines = rows.map(r => {
          const start = r.start_time ? new Date(r.start_time) : null;
          const end = r.end_time ? new Date(r.end_time) : null;
          let status = "Scheduled";
          if (start && end && now >= start && now <= end) status = "🟢 ACTIVE";
          else if (end && now > end) status = "Ended";
          const stateStr = r.world_event === 1 ? "Auto" : "Manual";
          return `[${r.eventEntry}] ${r.description} | ${status} | Holiday: ${r.holiday || "none"} | ${stateStr}`;
        });
        return { content: [{ type: "text" as const, text: `${rows.length} event(s):\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Teleport locations
  // ---------------------------------------------------------------------------

  server.tool(
    "search_teleport_location",
    "Search teleport locations from 'game_tele'. Useful for finding coordinates when placing NPCs or testing quests in-game.",
    {
      search: z.string().describe("Location name (partial match)"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ search, limit = 20 }) => {
      try {
        const rows = await query("world",
          `SELECT id, name, map, position_x, position_y, position_z, orientation FROM game_tele WHERE name LIKE ? LIMIT ${Number(limit)}`,
          [`%${search}%`]
        );
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `No teleport locations found matching "${search}".` }] };
        const lines = rows.map(r =>
          `[${r.id}] ${r.name} | Map ${r.map} | X:${Number(r.position_x).toFixed(2)} Y:${Number(r.position_y).toFixed(2)} Z:${Number(r.position_z).toFixed(2)}`
        );
        return { content: [{ type: "text" as const, text: `${rows.length} location(s):\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}
