import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendRaCommand } from "../services/ra-client.js";
import { query, execute, type DbName } from "../services/database.js";

export function registerAccountTools(server: McpServer): void {
  server.tool(
    "create_account",
    "Create a new game account with username and password via RA command (.account create). The account can then log in to the game.",
    {
      username: z.string().describe("Account username (used for login)"),
      password: z.string().describe("Account password"),
    },
    async ({ username, password }) => {
      const result = await sendRaCommand(`.account create ${username} ${password}`);
      return {
        content: [
          {
            type: "text" as const,
            text: result.success
              ? `Account creation result: ${result.response || "Success"}`
              : `Failed: ${result.error}`,
          },
        ],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "set_gm_level",
    "Set the GM (Game Master) security level for an account. Levels: 0=Player, 1=Moderator, 2=GameMaster, 3=Admin, 4+=Higher admin levels. Max level is 9.",
    {
      username: z.string().describe("Account username"),
      gm_level: z.number().min(0).max(9).describe("GM level (0-9): 0=Player, 1=Mod, 2=GM, 3=Admin"),
      realm_id: z.number().optional().describe("Realm ID (-1 for all realms, default: -1)"),
    },
    async ({ username, gm_level, realm_id }) => {
      const realmArg = realm_id !== undefined ? realm_id : -1;
      const result = await sendRaCommand(
        `.account set gmlevel ${username} ${gm_level} ${realmArg}`
      );
      return {
        content: [
          {
            type: "text" as const,
            text: result.success
              ? `GM level set: ${result.response || `${username} → level ${gm_level}`}`
              : `Failed: ${result.error}`,
          },
        ],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "set_account_password",
    "Change an account's password via RA command.",
    {
      username: z.string().describe("Account username"),
      new_password: z.string().describe("New password"),
    },
    async ({ username, new_password }) => {
      const result = await sendRaCommand(
        `.account set password ${username} ${new_password} ${new_password}`
      );
      return {
        content: [
          {
            type: "text" as const,
            text: result.success
              ? `Password changed: ${result.response || "Success"}`
              : `Failed: ${result.error}`,
          },
        ],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "modify_dp",
    "Modify the Donation Points (DP / Battle Pay balance) for an account. This is the 'dp' column in the auth.account table used for the in-game store.",
    {
      account_id: z.number().describe("Account ID (numeric)"),
      dp_amount: z.number().describe("New DP amount to set"),
    },
    async ({ account_id, dp_amount }) => {
      try {
        // First check if account exists
        const rows = await query(
          "auth",
          "SELECT id, username, dp FROM account WHERE id = ?",
          [account_id]
        );
        if (rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Account ID ${account_id} not found.` }],
            isError: true,
          };
        }

        const oldDp = rows[0].dp;
        await execute("auth", "UPDATE account SET dp = ? WHERE id = ?", [dp_amount, account_id]);

        return {
          content: [
            {
              type: "text" as const,
              text: `DP updated for account "${rows[0].username}" (ID: ${account_id})\nOld DP: ${oldDp}\nNew DP: ${dp_amount}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Error modifying DP: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "add_dp",
    "Add Donation Points (DP) to an account's balance. Use negative values to subtract.",
    {
      account_id: z.number().describe("Account ID (numeric)"),
      amount: z.number().describe("Amount of DP to add (negative to subtract)"),
    },
    async ({ account_id, amount }) => {
      try {
        const rows = await query(
          "auth",
          "SELECT id, username, dp FROM account WHERE id = ?",
          [account_id]
        );
        if (rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Account ID ${account_id} not found.` }],
            isError: true,
          };
        }

        const oldDp = Number(rows[0].dp) || 0;
        const newDp = oldDp + amount;
        await execute("auth", "UPDATE account SET dp = ? WHERE id = ?", [newDp, account_id]);

        return {
          content: [
            {
              type: "text" as const,
              text: `DP updated for "${rows[0].username}" (ID: ${account_id})\nOld: ${oldDp} → New: ${newDp} (${amount >= 0 ? "+" : ""}${amount})`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Error adding DP: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_accounts",
    "List all game accounts from the auth database. Shows ID, username, GM level, DP, email, and last login.",
    {
      limit: z.number().optional().describe("Max number of accounts to return (default 50)"),
      search: z.string().optional().describe("Search filter for username (partial match)"),
    },
    async ({ limit, search }) => {
      try {
        const maxRows = limit || 50;
        let sql = "SELECT id, username, gmlevel, dp, email, last_login, online FROM account";
        const params: unknown[] = [];

        if (search) {
          sql += " WHERE username LIKE ?";
          params.push(`%${search}%`);
        }
        sql += ` ORDER BY id ASC LIMIT ${Number(maxRows)}`;

        const rows = await query("auth", sql, params);

        if (rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No accounts found." }],
          };
        }

        const lines = rows.map(
          (r) =>
            `[${r.id}] ${r.username} | GM: ${r.gmlevel ?? 0} | DP: ${r.dp ?? 0} | Email: ${r.email || "N/A"} | Online: ${r.online ? "Yes" : "No"} | Last: ${r.last_login || "Never"}`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${rows.length} account(s) found:\n\n${lines.join("\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Error listing accounts: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_account_characters",
    "List all characters belonging to a specific account.",
    {
      account_id: z.number().describe("Account ID"),
    },
    async ({ account_id }) => {
      try {
        const rows = await query(
          "characters",
          "SELECT guid, name, race, class, level, zone, online, totaltime, map FROM characters WHERE account = ? ORDER BY name",
          [account_id]
        );

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No characters found for account ID ${account_id}.`,
              },
            ],
          };
        }

        const lines = rows.map(
          (r) =>
            `[${r.guid}] ${r.name} | Level ${r.level} | Race: ${r.race} | Class: ${r.class} | Zone: ${r.zone} | Map: ${r.map} | Online: ${r.online ? "Yes" : "No"} | Playtime: ${Math.floor(r.totaltime / 3600)}h`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${rows.length} character(s) for account ${account_id}:\n\n${lines.join("\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
