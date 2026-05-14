import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { query } from "../services/database.js";
import { MoPSchema, SchemaDefinition } from "../schema/definitions.js";
import * as fs from "fs";
import * as path from "path";

export function registerSchemaTools(server: McpServer): void {
  server.tool(
    "discover_schema",
    "Discover tool that scans the connected world and auth databases to find the correct column names for the current repack/expansion. It uses fuzzy matching and outputs a suggested schema_override.json file that can be used to configure the MCP server for a different WoW patch.",
    {},
    async () => {
      try {
        const discoveredSchema: Partial<SchemaDefinition> = {
          auth: JSON.parse(JSON.stringify(MoPSchema.auth)),
          world: JSON.parse(JSON.stringify(MoPSchema.world)),
        };

        const logs: string[] = [];
        logs.push("Starting Schema Discovery...");

        // Helper to query INFORMATION_SCHEMA
        const getColumns = async (dbType: "auth" | "world", tableName: string) => {
          const rows = await query(
            dbType,
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
            [tableName]
          );
          return rows.map((r: any) => r.COLUMN_NAME.toLowerCase() as string);
        };

        // --- AUTH DATABASE DISCOVERY ---
        try {
          const accCols = await getColumns("auth", "account");
          if (accCols.length > 0) {
            logs.push(`Found 'account' table with ${accCols.length} columns.`);
            discoveredSchema.auth!.account!.table = "account";
            
            // Heuristics
            if (accCols.includes("id")) discoveredSchema.auth!.account!.id = "id";
            if (accCols.includes("username")) discoveredSchema.auth!.account!.username = "username";
            
            if (accCols.includes("sha_pass_hash")) discoveredSchema.auth!.account!.sha_pass_hash = "sha_pass_hash";
            else if (accCols.includes("v")) discoveredSchema.auth!.account!.sha_pass_hash = "v"; // TC newer uses Salt & Verifier, this is a placeholder check
            
            if (accCols.includes("joindate")) discoveredSchema.auth!.account!.last_login = "joindate";
            if (accCols.includes("last_login")) discoveredSchema.auth!.account!.last_login = "last_login";
            
            if (accCols.includes("dp")) discoveredSchema.auth!.account!.dp = "dp";
            else if (accCols.includes("donation_points")) discoveredSchema.auth!.account!.dp = "donation_points";
            else if (accCols.includes("vp")) discoveredSchema.auth!.account!.dp = "vp"; // fallback if no dp exists but vp does
          } else {
             logs.push(`Warning: Could not find 'account' table in auth db.`);
          }
          
          const accAccessCols = await getColumns("auth", "account_access");
          if (accAccessCols.length > 0) {
             logs.push(`Found 'account_access' table.`);
             if (accAccessCols.includes("id")) discoveredSchema.auth!.account_access!.id = "id";
             else if (accAccessCols.includes("accountid")) discoveredSchema.auth!.account_access!.id = "AccountID";
             
             if (accAccessCols.includes("gmlevel")) discoveredSchema.auth!.account_access!.gmlevel = "gmlevel";
             else if (accAccessCols.includes("securitylevel")) discoveredSchema.auth!.account_access!.gmlevel = "SecurityLevel";
          }
        } catch (e: any) {
           logs.push(`Auth discovery error: ${e.message}`);
        }

        // --- WORLD DATABASE DISCOVERY ---
        try {
            // Quest Template
            const questCols = await getColumns("world", "quest_template");
            if (questCols.length > 0) {
                logs.push(`Found 'quest_template' table with ${questCols.length} columns.`);
                if (questCols.includes("id")) discoveredSchema.world!.quest_template!.id = "id";
                if (questCols.includes("entry")) discoveredSchema.world!.quest_template!.id = "entry";
                
                if (questCols.includes("logtitle")) discoveredSchema.world!.quest_template!.title = "LogTitle";
                if (questCols.includes("title")) discoveredSchema.world!.quest_template!.title = "Title";

                if (questCols.includes("questlevel")) discoveredSchema.world!.quest_template!.level = "QuestLevel";
                if (questCols.includes("level")) discoveredSchema.world!.quest_template!.level = "Level";
                
                if (questCols.includes("rewardxpi")) discoveredSchema.world!.quest_template!.reward_xp = "RewardXPI";
                if (questCols.includes("rewardxpid")) discoveredSchema.world!.quest_template!.reward_xp = "RewardXPId";
                if (questCols.includes("rewardmoney")) discoveredSchema.world!.quest_template!.reward_money = "RewardMoney";
                if (questCols.includes("rewardorrequiredmoney")) discoveredSchema.world!.quest_template!.reward_money = "RewardOrRequiredMoney";
            }

            // Creature Template
            const creatureCols = await getColumns("world", "creature_template");
            if (creatureCols.length > 0) {
                logs.push(`Found 'creature_template' table.`);
                if (creatureCols.includes("entry")) discoveredSchema.world!.creature_template!.entry = "entry";
                if (creatureCols.includes("name")) discoveredSchema.world!.creature_template!.name = "name";

                if (creatureCols.includes("npcflag")) discoveredSchema.world!.creature_template!.npcflag = "npcflag";
                if (creatureCols.includes("npc_flags")) discoveredSchema.world!.creature_template!.npcflag = "npc_flags";

                if (creatureCols.includes("gossip_menu_id")) discoveredSchema.world!.creature_template!.gossip_menu_id = "gossip_menu_id";
            }

            // Creature (spawn) table — TC 3.3.5/AzerothCore use `id1`, MoP/Cata use `id`.
            const spawnCols = await getColumns("world", "creature");
            if (spawnCols.length > 0) {
                logs.push(`Found 'creature' (spawn) table with ${spawnCols.length} columns.`);
                if (spawnCols.includes("id")) {
                  discoveredSchema.world!.creature!.id = "id";
                } else if (spawnCols.includes("id1")) {
                  discoveredSchema.world!.creature!.id = "id1";
                  logs.push(`  Detected legacy 'id1' column — using id1 instead of id.`);
                }
            }
        } catch (e: any) {
           logs.push(`World discovery error: ${e.message}`);
        }

        // Output formatting
        const outputJson = JSON.stringify({ schema_override: discoveredSchema }, null, 2);
        const outputPath = path.resolve("./schema_override.json");
        
        fs.writeFileSync(outputPath, outputJson);

        return {
          content: [
            {
              type: "text" as const,
              text: `${logs.join("\n")}\n\nDiscovery Complete! Suggestion file saved to:\n${outputPath}\n\nReview this file and point to it in your config.json if you wish to use it.`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Discovery failed: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
