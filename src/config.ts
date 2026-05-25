import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  auth: string;
  characters: string;
  world: string;
}

export interface RemoteAccessConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  timeout_seconds: number;
}

export interface ServerProcessConfig {
  start_script?: string;
  path?: string;
  working_dir: string;
  process_name: string;
}

export interface ServersConfig {
  mysql: ServerProcessConfig;
  authserver: ServerProcessConfig;
  worldserver: ServerProcessConfig;
}

export interface ConfigFiles {
  worldserver_conf: string;
  authserver_conf: string;
  my_ini: string;
  my_cnf: string;
}

export interface AppConfig {
  database: DatabaseConfig;
  remote_access: RemoteAccessConfig;
  servers: ServersConfig;
  config_files: ConfigFiles;
  /** Optional path (relative to project root or absolute) to a schema override JSON file. */
  schemaOverride?: string;
  /** Optional absolute path to the worldserver core source tree (e.g. SkyFire / TrinityCore
   *  clone). Enables `check_scriptname` and other source-grep forensic tools. If unset,
   *  those tools return a "source path not configured" message instead of failing. */
  core_source_path?: string;
}

const CONFIG_PATH = resolve(__dirname, "..", "config.json");
const EXAMPLE_CONFIG_PATH = resolve(__dirname, "..", "example.config.json");

/** Base directory for resolving relative paths in config */
export function getBaseDir(): string {
  return resolve(__dirname, "..");
}

/** Resolve a relative path from config against the project base dir */
export function resolveConfigPath(relativePath: string): string {
  return resolve(getBaseDir(), relativePath);
}

export function getConfig(): AppConfig {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as AppConfig;
}

/**
 * Sections of config.json that cannot be modified via `updateConfig` (i.e. via
 * the `update_config` MCP tool). These control where the server reads & writes
 * files on disk; allowing the agent to repoint them would let it write to any
 * path via `write_server_config` / `update_conf_value`. Edit them by hand if
 * you need to change them.
 */
const LOCKED_SECTIONS = new Set<string>(["config_files"]);

export function updateConfig(patch: Record<string, unknown>): AppConfig {
  for (const key of Object.keys(patch)) {
    if (LOCKED_SECTIONS.has(key)) {
      throw new Error(
        `Section "${key}" is read-only via update_config (security: paths under config_files gate file writes). Edit config.json directly to change it.`
      );
    }
  }
  const current = getConfig();
  const updated = deepMerge(current as unknown as Record<string, unknown>, patch) as unknown as AppConfig;
  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export function resetConfig(): AppConfig {
  const example = readFileSync(EXAMPLE_CONFIG_PATH, "utf-8");
  writeFileSync(CONFIG_PATH, example, "utf-8");
  return JSON.parse(example) as AppConfig;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
