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
import { registerSchemaTools } from "./tools/schema-tools.js";
import { registerForensicTools } from "./tools/forensic-tools.js";
import { initializeSchema } from "./schema/resolver.js";
import { getConfig, resolveConfigPath } from "./config.js";
import { isAbsolute } from "path";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "wow-server-mcp",
    version: "1.4.1",
  });

  // Initialize database schema mapping. If config.schemaOverride is set,
  // resolve it (absolute paths used as-is, relative paths resolved from the
  // project base dir) and pass it to the resolver.
  const cfg = getConfig();
  const overridePath = cfg.schemaOverride
    ? (isAbsolute(cfg.schemaOverride) ? cfg.schemaOverride : resolveConfigPath(cfg.schemaOverride))
    : undefined;
  await initializeSchema(overridePath);

  // Register all tool groups
  registerConfigTools(server);
  registerDatabaseTools(server);
  registerRaTools(server);
  registerProcessTools(server);
  registerAccountTools(server);
  registerServerConfigTools(server);
  registerLookupTools(server);
  registerSchemaTools(server);

  // Repack development tools
  registerNpcDevTools(server);
  registerQuestDevTools(server);
  registerLootDevTools(server);

  // Forensic / DB-integrity tools (bug hunting, false-positive prevention)
  registerForensicTools(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("WoW Server MCP started (stdio transport)");
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
