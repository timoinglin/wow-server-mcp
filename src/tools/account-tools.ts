import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendRaCommand } from "../services/ra-client.js";
import { query, execute } from "../services/database.js";
import { getSchema } from "../schema/resolver.js";

/** Replace every occurrence of `password` in a string with "***". Used to
 *  filter command echoes from RA responses so we don't surface plaintext
 *  passwords back to the AI agent / logs. */
function redactPassword(text: string, password: string): string {
  if (!password) return text;
  // Escape regex metacharacters in the password value.
  const escaped = password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "g"), "***");
}

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
      const safeResponse = redactPassword(result.response || "", password);
      return {
        content: [
          {
            type: "text" as const,
            text: result.success
              ? `Account creation result: ${safeResponse || "Success"}`
              : `Failed: ${redactPassword(result.error || "", password)}`,
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
      const safeResponse = redactPassword(result.response || "", new_password);
      return {
        content: [
          {
            type: "text" as const,
            text: result.success
              ? `Password changed: ${safeResponse || "Success"}`
              : `Failed: ${redactPassword(result.error || "", new_password)}`,
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
        const acc = getSchema().auth.account;
        // First check if account exists
        const rows = await query(
          "auth",
          `SELECT ${acc.id}, ${acc.username}, ${acc.dp} FROM ${acc.table} WHERE ${acc.id} = ?`,
          [account_id]
        );
        if (rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Account ID ${account_id} not found.` }],
            isError: true,
          };
        }

        const oldDp = rows[0][acc.dp];
        await execute("auth", `UPDATE ${acc.table} SET ${acc.dp} = ? WHERE ${acc.id} = ?`, [dp_amount, account_id]);

        return {
          content: [
            {
              type: "text" as const,
              text: `DP updated for account "${rows[0][acc.username]}" (ID: ${account_id})\nOld DP: ${oldDp}\nNew DP: ${dp_amount}`,
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
        const acc = getSchema().auth.account;
        // Single atomic UPDATE: safe under concurrent calls (no read-modify-
        // write window). affectedRows tells us whether the account existed.
        const result = await execute(
          "auth",
          `UPDATE ${acc.table} SET ${acc.dp} = ${acc.dp} + ? WHERE ${acc.id} = ?`,
          [amount, account_id]
        );
        if (result.affectedRows === 0) {
          return {
            content: [{ type: "text" as const, text: `Account ID ${account_id} not found.` }],
            isError: true,
          };
        }
        const rows = await query(
          "auth",
          `SELECT ${acc.username}, ${acc.dp} FROM ${acc.table} WHERE ${acc.id} = ?`,
          [account_id]
        );
        const newDp = Number(rows[0]?.[acc.dp]) || 0;
        return {
          content: [
            {
              type: "text" as const,
              text: `DP updated for "${rows[0]?.[acc.username]}" (ID: ${account_id})\nNew balance: ${newDp} (${amount >= 0 ? "+" : ""}${amount})`,
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
        const schema = getSchema();
        const acc = schema.auth.account;
        const access = schema.auth.account_access;
        const maxRows = limit || 50;
        
        let sql = `
          SELECT 
            a.${acc.id}, 
            a.${acc.username}, 
            ga.${access.gmlevel}, 
            a.${acc.dp}, 
            a.${acc.email}, 
            a.${acc.last_login}
          FROM ${acc.table} a
          LEFT JOIN ${access.table} ga ON a.${acc.id} = ga.${access.id}
        `;
        const params: unknown[] = [];

        if (search) {
          sql += ` WHERE a.${acc.username} LIKE ?`;
          params.push(`%${search}%`);
        }
        sql += ` ORDER BY a.${acc.id} ASC LIMIT ${Number(maxRows)}`;

        const rows = await query("auth", sql, params);

        if (rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No accounts found." }],
          };
        }

        const lines = rows.map(
          (r) =>
            `[${r[acc.id]}] ${r[acc.username]} | GM: ${r[access.gmlevel] ?? 0} | DP: ${r[acc.dp] ?? 0} | Email: ${r[acc.email] || "N/A"} | Last: ${r[acc.last_login] || "Never"}`
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
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
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
        // Characters schema not yet implemented in definitions.ts, but we keep hardcoded for POC 
        // to show we can mix or just focus on auth first.
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
