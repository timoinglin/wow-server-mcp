import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, execute } from "../services/database.js";
import { sendRaCommand } from "../services/ra-client.js";

export function registerQuestDevTools(server: McpServer): void {

  // ---------------------------------------------------------------------------
  // Quest relations: who gives / finishes a quest
  // ---------------------------------------------------------------------------

  server.tool(
    "get_quest_relations",
    "Show which NPCs and game objects offer (start) and finish a given quest. Queries creature_queststarter, creature_questender, gameobject_queststarter, gameobject_questender.",
    {
      quest_id: z.number().describe("Quest ID"),
    },
    async ({ quest_id }) => {
      try {
        const [cStart, cEnd, goStart, goEnd] = await Promise.all([
          query("world",
            `SELECT cqs.id AS entry, ct.name FROM creature_queststarter cqs LEFT JOIN creature_template ct ON ct.entry = cqs.id WHERE cqs.quest = ?`,
            [quest_id]),
          query("world",
            `SELECT cqe.id AS entry, ct.name FROM creature_questender cqe LEFT JOIN creature_template ct ON ct.entry = cqe.id WHERE cqe.quest = ?`,
            [quest_id]),
          query("world",
            `SELECT gqs.id AS entry, gt.name FROM gameobject_queststarter gqs LEFT JOIN gameobject_template gt ON gt.entry = gqs.id WHERE gqs.quest = ?`,
            [quest_id]),
          query("world",
            `SELECT gqe.id AS entry, gt.name FROM gameobject_questender gqe LEFT JOIN gameobject_template gt ON gt.entry = gqe.id WHERE gqe.quest = ?`,
            [quest_id]),
        ]);

        const fmt = (rows: typeof cStart) => rows.length === 0 ? "  None" : rows.map(r => `  [${r.entry}] ${r.name || "Unknown"}`).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `Quest ${quest_id} relations:\n\nNPC Starters:\n${fmt(cStart)}\n\nNPC Enders:\n${fmt(cEnd)}\n\nGameobject Starters:\n${fmt(goStart)}\n\nGameobject Enders:\n${fmt(goEnd)}`,
          }],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Assign quest giver / ender NPCs
  // ---------------------------------------------------------------------------

  server.tool(
    "set_quest_giver",
    "Assign an NPC as the quest starter (giver) for a quest. Inserts into creature_queststarter and reloads.",
    {
      npc_entry: z.number().describe("NPC creature template entry ID"),
      quest_id: z.number().describe("Quest ID"),
    },
    async ({ npc_entry, quest_id }) => {
      try {
        // Check if already set
        const existing = await query("world", "SELECT id FROM creature_queststarter WHERE id = ? AND quest = ?", [npc_entry, quest_id]);
        if (existing.length > 0) {
          return { content: [{ type: "text" as const, text: `NPC ${npc_entry} is already set as quest giver for quest ${quest_id}.` }] };
        }
        await execute("world", "INSERT INTO creature_queststarter (id, quest) VALUES (?, ?)", [npc_entry, quest_id]);

        // Make sure NPC has QuestGiver flag (npcflag bit 2)
        await execute("world", "UPDATE creature_template SET npcflag = npcflag | 2 WHERE entry = ? AND (npcflag & 2) = 0", [npc_entry]);

        await sendRaCommand(".reload creature_queststarter creature_questender");
        await sendRaCommand(".reload creature_template");

        return { content: [{ type: "text" as const, text: `NPC ${npc_entry} set as quest giver for quest ${quest_id}.\nQuestGiver npcflag ensured.\nTables reloaded.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "set_quest_ender",
    "Assign an NPC as the quest ender (turn-in NPC) for a quest. Inserts into creature_questender and reloads.",
    {
      npc_entry: z.number().describe("NPC creature template entry ID"),
      quest_id: z.number().describe("Quest ID"),
    },
    async ({ npc_entry, quest_id }) => {
      try {
        const existing = await query("world", "SELECT id FROM creature_questender WHERE id = ? AND quest = ?", [npc_entry, quest_id]);
        if (existing.length > 0) {
          return { content: [{ type: "text" as const, text: `NPC ${npc_entry} is already set as quest ender for quest ${quest_id}.` }] };
        }
        await execute("world", "INSERT INTO creature_questender (id, quest) VALUES (?, ?)", [npc_entry, quest_id]);

        // Ensure QuestGiver flag
        await execute("world", "UPDATE creature_template SET npcflag = npcflag | 2 WHERE entry = ? AND (npcflag & 2) = 0", [npc_entry]);

        await sendRaCommand(".reload creature_queststarter creature_questender");
        await sendRaCommand(".reload creature_template");

        return { content: [{ type: "text" as const, text: `NPC ${npc_entry} set as quest ender for quest ${quest_id}.\nQuestGiver npcflag ensured.\nTables reloaded.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "remove_quest_relation",
    "Remove an NPC from a quest starter or ender relationship.",
    {
      npc_entry: z.number().describe("NPC creature template entry ID"),
      quest_id: z.number().describe("Quest ID"),
      relation: z.enum(["giver", "ender", "both"]).describe("Which relation to remove: giver, ender, or both"),
    },
    async ({ npc_entry, quest_id, relation }) => {
      try {
        let removed = 0;
        if (relation === "giver" || relation === "both") {
          const r = await execute("world", "DELETE FROM creature_queststarter WHERE id = ? AND quest = ?", [npc_entry, quest_id]);
          removed += r.affectedRows;
        }
        if (relation === "ender" || relation === "both") {
          const r = await execute("world", "DELETE FROM creature_questender WHERE id = ? AND quest = ?", [npc_entry, quest_id]);
          removed += r.affectedRows;
        }
        await sendRaCommand(".reload creature_queststarter creature_questender");
        return { content: [{ type: "text" as const, text: `Removed ${removed} relation(s) for NPC ${npc_entry} / quest ${quest_id}. Tables reloaded.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Create a quest
  // ---------------------------------------------------------------------------

  server.tool(
    "create_quest",
    "Insert a new quest_template row. Creates a basic quest with title, level range, type, and optional reward XP/money. Returns the new quest ID. Use update_quest_template to fine-tune objectives and rewards afterward.",
    {
      id: z.number().describe("Quest ID (must be unique, check existing IDs first with search_quest_template)"),
      title: z.string().describe("Quest title shown to players"),
      level: z.number().describe("Recommended level for the quest"),
      min_level: z.number().describe("Minimum level to pick up the quest"),
      max_level: z.number().optional().describe("Maximum level to pick up (0 = no max, default 0)"),
      quest_type: z.number().optional().describe("Quest type: 0=Normal, 1=Daily, 21=Weekly (default 0)"),
      reward_xp: z.number().optional().describe("XP reward amount (default 0)"),
      reward_money: z.number().optional().describe("Money reward in copper (default 0)"),
      quest_info: z.string().optional().describe("Short description / objective text"),
      area_description: z.string().optional().describe("Area/zone description"),
    },
    async ({ id, title, level, min_level, max_level = 0, quest_type = 0, reward_xp = 0, reward_money = 0, quest_info = "", area_description = "" }) => {
      try {
        // Check ID not in use
        const existing = await query("world", "SELECT Id FROM quest_template WHERE Id = ?", [id]);
        if (existing.length > 0) return { content: [{ type: "text" as const, text: `Quest ID ${id} already exists. Choose a different ID.` }], isError: true };

        await execute("world",
          `INSERT INTO quest_template
            (Id, QuestType, QuestLevel, MinLevel, MaxLevel, Title, ObjectiveText1, AreaDescription, RewardXP, RewardMoney)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, quest_type, level, min_level, max_level, title, quest_info, area_description, reward_xp, reward_money]
        );
        await sendRaCommand(".reload quest_template");
        return {
          content: [{
            type: "text" as const,
            text: `Created quest [${id}] "${title}"\n  Level: ${level} (Min: ${min_level}, Max: ${max_level || "none"})\n  Type: ${quest_type}\n  Reward XP: ${reward_xp} | Money: ${reward_money} copper\nQuest template reloaded.\n\nNext steps:\n• Set quest giver: set_quest_giver\n• Set quest ender: set_quest_ender\n• Fine-tune fields: update_quest_template`,
          }],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "delete_quest",
    "Delete a quest_template by ID and remove all NPC quest relations for it. Use with caution.",
    {
      quest_id: z.number().describe("Quest ID to delete"),
    },
    async ({ quest_id }) => {
      try {
        const [, , , r] = await Promise.all([
          execute("world", "DELETE FROM creature_queststarter WHERE quest = ?", [quest_id]),
          execute("world", "DELETE FROM creature_questender WHERE quest = ?", [quest_id]),
          execute("world", "DELETE FROM gameobject_queststarter WHERE quest = ?", [quest_id]),
          execute("world", "DELETE FROM quest_template WHERE Id = ?", [quest_id]),
        ]);
        if (r.affectedRows === 0) return { content: [{ type: "text" as const, text: `Quest ${quest_id} not found.` }], isError: true };
        await sendRaCommand(".reload quest_template");
        await sendRaCommand(".reload creature_queststarter creature_questender");
        return { content: [{ type: "text" as const, text: `Deleted quest ${quest_id} and all NPC relations. Tables reloaded.` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Quest item rewards
  // ---------------------------------------------------------------------------

  server.tool(
    "get_quest_rewards",
    "Show all reward items, choices, and currencies for a quest from quest_template.",
    {
      quest_id: z.number().describe("Quest ID"),
    },
    async ({ quest_id }) => {
      try {
        const rows = await query("world",
          `SELECT Id, Title,
            RewardItem1, RewardAmount1, RewardItem2, RewardAmount2, RewardItem3, RewardAmount3, RewardItem4, RewardAmount4,
            RewardChoiceItemId1, RewardChoiceItemCount1, RewardChoiceItemId2, RewardChoiceItemCount2,
            RewardChoiceItemId3, RewardChoiceItemCount3, RewardChoiceItemId4, RewardChoiceItemCount4,
            RewardChoiceItemId5, RewardChoiceItemCount5, RewardChoiceItemId6, RewardChoiceItemCount6,
            RewardXP, RewardMoney, RewardHonor
           FROM quest_template WHERE Id = ?`,
          [quest_id]
        );
        if (rows.length === 0) return { content: [{ type: "text" as const, text: `Quest ${quest_id} not found.` }], isError: true };
        const q = rows[0];

        const guaranteed: string[] = [];
        for (let i = 1; i <= 4; i++) {
          const item = q[`RewardItem${i}`];
          const amt = q[`RewardAmount${i}`];
          if (item) guaranteed.push(`  Item ${item} x${amt}`);
        }
        const choices: string[] = [];
        for (let i = 1; i <= 6; i++) {
          const item = q[`RewardChoiceItemId${i}`];
          const cnt = q[`RewardChoiceItemCount${i}`];
          if (item) choices.push(`  Item ${item} x${cnt}`);
        }

        return {
          content: [{
            type: "text" as const,
            text: `Quest [${q.Id}] "${q.Title}" rewards:\n\nGuaranteed Items:\n${guaranteed.length ? guaranteed.join("\n") : "  None"}\n\nChoice Items:\n${choices.length ? choices.join("\n") : "  None"}\n\nXP: ${q.RewardXP} | Money: ${q.RewardMoney} copper | Honor: ${q.RewardHonor}`,
          }],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}
