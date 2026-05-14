import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, execute, type DbName } from "../services/database.js";
import { sendRaCommand } from "../services/ra-client.js";
import { getConfig } from "../config.js";
import { getSchema } from "../schema/resolver.js";

export function registerLookupTools(server: McpServer): void {
  server.tool("search_creature_template",
    "Search NPCs/creatures by name or entry ID in the world database. Returns matching creature templates.",
    {
      search: z.string().describe("Search term (name partial match) or entry ID (exact match if numeric)"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ search, limit }) => {
      try {
        const max = limit || 20;
        const isNumeric = /^\d+$/.test(search);
        let sql: string;
        let params: unknown[];
        const ct = getSchema().world.creature_template;
        if (isNumeric) {
          sql = `SELECT ${ct.entry}, ${ct.name}, subname, minlevel, maxlevel, \`rank\`, \`type\`, faction_A, faction_H FROM ${ct.table} WHERE ${ct.entry} = ? LIMIT ${Number(max)}`;
          params = [parseInt(search)];
        } else {
          sql = `SELECT ${ct.entry}, ${ct.name}, subname, minlevel, maxlevel, \`rank\`, \`type\`, faction_A, faction_H FROM ${ct.table} WHERE ${ct.name} LIKE ? LIMIT ${Number(max)}`;
          params = [`%${search}%`];
        }
        const rows = await query("world", sql, params);
        if (rows.length === 0) return { content: [{ type: "text" as const, text: "No creatures found." }] };
        return { content: [{ type: "text" as const, text: `${rows.length} creature(s) found:\n\n${JSON.stringify(rows, null, 2)}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("get_creature_template",
    "Get full creature template data by entry ID from the world database.",
    { entry: z.number().describe("Creature template entry ID") },
    async ({ entry }) => {
      try {
        const ct = getSchema().world.creature_template;
        const rows = await query("world", `SELECT * FROM ${ct.table} WHERE ${ct.entry} = ?`, [entry]);
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `Creature entry ${entry} not found.` }], isError: true };
        return { content: [{ type: "text" as const, text: JSON.stringify(rows[0], null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("update_creature_template",
    "Update specific fields on a creature template. After updating, use RA '.reload creature_template' to apply in-game.",
    {
      entry: z.number().describe("Creature entry ID"),
      fields: z.string().describe('JSON object of fields to update, e.g. \'{"name": "New Name", "maxlevel": 90}\''),
    },
    async ({ entry, fields }) => {
      try {
        const ct = getSchema().world.creature_template;
        const data = JSON.parse(fields) as Record<string, unknown>;
        const keys = Object.keys(data);
        if (keys.length === 0) return { content: [{ type: "text" as const, text: "No fields provided." }], isError: true };
        const setClause = keys.map(k => `\`${k}\` = ?`).join(", ");
        const vals = [...Object.values(data), entry];
        const { affectedRows } = await execute("world", `UPDATE ${ct.table} SET ${setClause} WHERE ${ct.entry} = ?`, vals);
        return { content: [{ type: "text" as const, text: `Updated creature ${entry}. Rows affected: ${affectedRows}.\nRun '.reload ${ct.table}' via RA to apply.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("search_quest_template",
    "Search quests by name or ID in the world database.",
    {
      search: z.string().describe("Search term (name partial match) or quest ID"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ search, limit }) => {
      try {
        const max = limit || 20;
        const isNumeric = /^\d+$/.test(search);
        let sql: string; let params: unknown[];
        const qt = getSchema().world.quest_template;
        if (isNumeric) {
          sql = `SELECT ${qt.id}, ${qt.title}, ${qt.level}, MinLevel, MaxLevel, \`Type\` FROM ${qt.table} WHERE ${qt.id} = ? LIMIT ${Number(max)}`;
          params = [parseInt(search)];
        } else {
          sql = `SELECT ${qt.id}, ${qt.title}, ${qt.level}, MinLevel, MaxLevel, \`Type\` FROM ${qt.table} WHERE ${qt.title} LIKE ? LIMIT ${Number(max)}`;
          params = [`%${search}%`];
        }
        const rows = await query("world", sql, params);
        if (rows.length === 0) return { content: [{ type: "text" as const, text: "No quests found." }] };
        return { content: [{ type: "text" as const, text: `${rows.length} quest(s):\n\n${JSON.stringify(rows, null, 2)}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("get_quest_template",
    "Get full quest data by ID from world database.",
    { id: z.number().describe("Quest ID") },
    async ({ id }) => {
      try {
        const qt = getSchema().world.quest_template;
        const rows = await query("world", `SELECT * FROM ${qt.table} WHERE ${qt.id} = ?`, [id]);
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `Quest ${id} not found.` }], isError: true };
        return { content: [{ type: "text" as const, text: JSON.stringify(rows[0], null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("update_quest_template",
    "Update fields on a quest template. Use RA '.reload quest_template' to apply.",
    {
      id: z.number().describe("Quest ID"),
      fields: z.string().describe('JSON object of fields to update'),
    },
    async ({ id, fields }) => {
      try {
        const qt = getSchema().world.quest_template;
        const data = JSON.parse(fields) as Record<string, unknown>;
        const keys = Object.keys(data);
        if (keys.length === 0) return { content: [{ type: "text" as const, text: "No fields." }], isError: true };
        const setClause = keys.map(k => `\`${k}\` = ?`).join(", ");
        const vals = [...Object.values(data), id];
        const { affectedRows } = await execute("world", `UPDATE ${qt.table} SET ${setClause} WHERE ${qt.id} = ?`, vals);
        return { content: [{ type: "text" as const, text: `Updated quest ${id}. Rows: ${affectedRows}. Run '.reload ${qt.table}' via RA.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("search_item_template",
    "Search items by name or entry ID in the world database.",
    {
      search: z.string().describe("Search term or item entry ID"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ search, limit }) => {
      try {
        const max = limit || 20;
        const isNumeric = /^\d+$/.test(search);
        let sql: string; let params: unknown[];
        if (isNumeric) {
          sql = `SELECT entry, name, Quality, ItemLevel, RequiredLevel, class, subclass FROM item_template WHERE entry = ? LIMIT ${Number(max)}`;
          params = [parseInt(search)];
        } else {
          sql = `SELECT entry, name, Quality, ItemLevel, RequiredLevel, class, subclass FROM item_template WHERE name LIKE ? LIMIT ${Number(max)}`;
          params = [`%${search}%`];
        }
        const rows = await query("world", sql, params);
        if (rows.length === 0) return { content: [{ type: "text" as const, text: "No items found." }] };
        return { content: [{ type: "text" as const, text: `${rows.length} item(s):\n\n${JSON.stringify(rows, null, 2)}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("get_item_template",
    "Get full item data by entry ID.",
    { entry: z.number().describe("Item entry ID") },
    async ({ entry }) => {
      try {
        const rows = await query("world", "SELECT * FROM item_template WHERE entry = ?", [entry]);
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `Item ${entry} not found.` }], isError: true };
        return { content: [{ type: "text" as const, text: JSON.stringify(rows[0], null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("update_item_template",
    "Update fields on an item template. Use RA '.reload item_template' to apply.",
    {
      entry: z.number().describe("Item entry ID"),
      fields: z.string().describe('JSON object of fields to update'),
    },
    async ({ entry, fields }) => {
      try {
        const data = JSON.parse(fields) as Record<string, unknown>;
        const keys = Object.keys(data);
        if (keys.length === 0) return { content: [{ type: "text" as const, text: "No fields." }], isError: true };
        const setClause = keys.map(k => `\`${k}\` = ?`).join(", ");
        const vals = [...Object.values(data), entry];
        const { affectedRows } = await execute("world", `UPDATE item_template SET ${setClause} WHERE entry = ?`, vals);
        return { content: [{ type: "text" as const, text: `Updated item ${entry}. Rows: ${affectedRows}. Run '.reload item_template' via RA.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("search_gameobject_template",
    "Search gameobjects by name or entry ID in the world database.",
    {
      search: z.string().describe("Search term or gameobject entry ID"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ search, limit }) => {
      try {
        const max = limit || 20;
        const isNumeric = /^\d+$/.test(search);
        let sql: string; let params: unknown[];
        if (isNumeric) {
          sql = `SELECT entry, name, \`type\`, size FROM gameobject_template WHERE entry = ? LIMIT ${Number(max)}`;
          params = [parseInt(search)];
        } else {
          sql = `SELECT entry, name, \`type\`, size FROM gameobject_template WHERE name LIKE ? LIMIT ${Number(max)}`;
          params = [`%${search}%`];
        }
        const rows = await query("world", sql, params);
        if (rows.length === 0) return { content: [{ type: "text" as const, text: "No gameobjects found." }] };
        return { content: [{ type: "text" as const, text: `${rows.length} gameobject(s):\n\n${JSON.stringify(rows, null, 2)}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // --- Server info tools ---

  server.tool("get_server_info",
    "Get server uptime and player count via RA '.server info' command.",
    {},
    async () => {
      try {
        const result = await sendRaCommand(".server info");
        if (result.success) return { content: [{ type: "text" as const, text: result.response }] };
        return { content: [{ type: "text" as const, text: `RA error: ${result.error}` }], isError: true };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("get_online_players",
    "List currently online players from the characters database.",
    {},
    async () => {
      try {
        const config = getConfig();
        const authDb = config.database.auth;
        const rows = await query("characters",
          `SELECT c.guid, c.name, c.level, c.race, c.class, c.zone, c.map, a.username AS account_name
           FROM characters c
           JOIN \`${authDb}\`.account a ON c.account = a.id
           WHERE c.online = 1
           ORDER BY c.name`,
          []
        );
        if (rows.length === 0) return { content: [{ type: "text" as const, text: "No players online." }] };
        const lines = rows.map(r => `${r.name} (Lv${r.level}) - Account: ${r.account_name} - Zone: ${r.zone} Map: ${r.map}`);
        return { content: [{ type: "text" as const, text: `${rows.length} player(s) online:\n\n${lines.join("\n")}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool("get_db_stats",
    "Get database statistics: table counts, approximate row counts, and database sizes.",
    {},
    async () => {
      try {
        const dbs: DbName[] = ["auth", "characters", "world"];
        // Run all 3 queries in parallel for speed
        const results = await Promise.all(
          dbs.map(db =>
            query(db,
              "SELECT COUNT(*) as table_count, SUM(data_length + index_length) as total_size, SUM(table_rows) as total_rows FROM information_schema.tables WHERE table_schema = DATABASE()",
              []
            )
          )
        );
        const stats = dbs.map((db, i) => {
          const r = results[i][0];
          const sizeMB = (Number(r.total_size) / 1024 / 1024).toFixed(2);
          return `${db}: ${r.table_count} tables, ~${r.total_rows} rows, ${sizeMB} MB`;
        });
        return { content: [{ type: "text" as const, text: stats.join("\n") }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}
