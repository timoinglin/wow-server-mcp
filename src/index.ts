#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerConfigTools } from "./tools/config-tools.js";
import { registerDatabaseTools } from "./tools/database-tools.js";
import { registerRaTools } from "./tools/ra-tools.js";
import { registerProcessTools } from "./tools/process-tools.js";
import { registerAccountTools } from "./tools/account-tools.js";
import { registerServerConfigTools } from "./tools/server-config-tools.js";
import { registerLookupTools } from "./tools/lookup-tools.js";
import { registerNpcDevTools } from "./tools/npc-dev-tools.js";
import { registerQuestDevTools } from "./tools/quest-dev-tools.js";
import { registerLootDevTools } from "./tools/loot-dev-tools.js";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "emucoach-mcp",
    version: "1.1.0",
  });

  // Register all tool groups
  registerConfigTools(server);
  registerDatabaseTools(server);
  registerRaTools(server);
  registerProcessTools(server);
  registerAccountTools(server);
  registerServerConfigTools(server);
  registerLookupTools(server);

  // Repack development tools
  registerNpcDevTools(server);
  registerQuestDevTools(server);
  registerLootDevTools(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Emucoach MCP Server v1.1.0 started (stdio transport)");
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
