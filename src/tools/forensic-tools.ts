import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "fs";
import { join } from "path";
import { query } from "../services/database.js";
import { getConfig } from "../config.js";
import { getSchema } from "../schema/resolver.js";

/**
 * Forensic / DB-integrity tools.
 *
 * These tools accelerate the "is this actually a bug?" verification loop
 * that's tedious with raw db_query: cross-referencing creature templates
 * against SmartAI handlers, walking gossip-menu chains, checking whether
 * orphan IDs are actually broken (vs. handled by core scripts), and
 * sweeping for missing foreign-key targets across tables.
 *
 * See docs/BUGHUNT.md for the anti-false-positive playbook these tools
 * were designed for.
 */

// ---------------------------------------------------------------------------
// Lookup tables for human-readable SmartAI / gossip metadata
// ---------------------------------------------------------------------------

const SMART_EVENT_NAMES: Record<number, string> = {
  0: "UPDATE_IC",
  1: "UPDATE_OOC",
  2: "HEALTH_PCT",
  3: "MANA_PCT",
  4: "AGGRO",
  5: "KILL",
  6: "DEATH",
  7: "EVADE",
  8: "SPELLHIT",
  9: "RANGE",
  10: "OOC_LOS",
  11: "RESPAWN",
  12: "TARGET_HEALTH_PCT",
  13: "VICTIM_CASTING",
  14: "FRIENDLY_HEALTH",
  15: "FRIENDLY_IS_CC",
  16: "FRIENDLY_MISSING_BUFF",
  17: "SUMMONED_UNIT",
  18: "TARGET_MANA_PCT",
  19: "ACCEPTED_QUEST",
  20: "REWARD_QUEST",
  21: "REACHED_HOME",
  22: "RECEIVE_EMOTE",
  23: "HAS_AURA",
  24: "TARGET_BUFFED",
  25: "RESET",
  26: "IC_LOS",
  27: "PASSENGER_BOARDED",
  28: "PASSENGER_REMOVED",
  29: "CHARMED",
  30: "CHARMED_TARGET",
  31: "SPELLHIT_TARGET",
  32: "DAMAGED",
  33: "DAMAGED_TARGET",
  34: "MOVEMENTINFORM",
  35: "SUMMON_DESPAWNED",
  36: "CORPSE_REMOVED",
  37: "AI_INIT",
  38: "DATA_SET",
  39: "WAYPOINT_START",
  40: "WAYPOINT_REACHED",
  41: "TRANSPORT_ADDPLAYER",
  42: "TRANSPORT_ADDCREATURE",
  43: "TRANSPORT_REMOVE_PLAYER",
  44: "TRANSPORT_RELOCATE",
  45: "INSTANCE_PLAYER_ENTER",
  46: "AREATRIGGER_ONTRIGGER",
  47: "QUEST_ACCEPTED",
  48: "QUEST_OBJ_COMPLETION",
  49: "QUEST_COMPLETION",
  50: "QUEST_REWARDED",
  51: "QUEST_FAIL",
  52: "TEXT_OVER",
  53: "RECEIVE_HEAL",
  54: "JUST_SUMMONED",
  55: "WAYPOINT_PAUSED",
  56: "WAYPOINT_RESUMED",
  57: "WAYPOINT_STOPPED",
  58: "WAYPOINT_ENDED",
  59: "TIMED_EVENT_TRIGGERED",
  60: "UPDATE",
  61: "LINK",
  62: "GOSSIP_SELECT",
  63: "JUST_CREATED",
  64: "GOSSIP_HELLO",
  65: "FOLLOW_COMPLETED",
  66: "EVENT_PHASE_CHANGE",
  67: "IS_BEHIND_TARGET",
  68: "GAME_EVENT_START",
  69: "GAME_EVENT_END",
  70: "GO_STATE_CHANGED",
  71: "GO_EVENT_INFORM",
  72: "ACTION_DONE",
  73: "ON_SPELLCLICK",
  74: "FRIENDLY_HEALTH_PCT",
  75: "DISTANCE_CREATURE",
  76: "DISTANCE_GAMEOBJECT",
  77: "COUNTER_SET",
};

const SMART_ACTION_NAMES: Record<number, string> = {
  0: "NONE",
  1: "TALK",
  2: "SET_FACTION",
  3: "MORPH_TO_ENTRY_OR_MODEL",
  4: "SOUND",
  5: "PLAY_EMOTE",
  6: "FAIL_QUEST",
  7: "OFFER_QUEST",
  8: "SET_REACT_STATE",
  9: "ACTIVATE_GOBJECT",
  10: "RANDOM_EMOTE",
  11: "CAST",
  12: "SUMMON_CREATURE",
  13: "THREAT_SINGLE_PCT",
  14: "THREAT_ALL_PCT",
  15: "CALL_AREAEXPLOREDOREVENTHAPPENS",
  17: "SET_EMOTE_STATE",
  18: "SET_UNIT_FLAG",
  19: "REMOVE_UNIT_FLAG",
  20: "AUTO_ATTACK",
  21: "ALLOW_COMBAT_MOVEMENT",
  22: "SET_EVENT_PHASE",
  23: "INC_EVENT_PHASE",
  24: "EVADE",
  25: "FLEE_FOR_ASSIST",
  26: "CALL_GROUPEVENTHAPPENS",
  27: "COMBAT_STOP",
  28: "REMOVEAURASFROMSPELL",
  29: "FOLLOW",
  30: "RANDOM_PHASE",
  31: "RANDOM_PHASE_RANGE",
  32: "RESET_GOBJECT",
  33: "CALL_KILLEDMONSTER",
  34: "SET_INST_DATA",
  35: "SET_INST_DATA64",
  36: "UPDATE_TEMPLATE",
  37: "DIE",
  38: "SET_IN_COMBAT_WITH_ZONE",
  39: "CALL_FOR_HELP",
  40: "SET_SHEATH",
  41: "FORCE_DESPAWN",
  42: "SET_INVINCIBILITY_HP_LEVEL",
  43: "MOUNT_TO_ENTRY_OR_MODEL",
  44: "SET_INGAME_PHASE_MASK",
  45: "SET_DATA",
  46: "MOVE_FORWARD",
  47: "SET_VISIBILITY",
  48: "SET_ACTIVE",
  49: "ATTACK_START",
  50: "SUMMON_GO",
  51: "KILL_UNIT",
  52: "ACTIVATE_TAXI",
  53: "WP_START",
  54: "WP_PAUSE",
  55: "WP_STOP",
  56: "ADD_ITEM",
  57: "REMOVE_ITEM",
  58: "INSTALL_AI_TEMPLATE",
  59: "SET_RUN",
  60: "SET_FLY",
  61: "SET_SWIM",
  62: "TELEPORT",
  63: "SET_COUNTER",
  64: "STORE_TARGET_LIST",
  65: "WP_RESUME",
  66: "SET_ORIENTATION",
  67: "CREATE_TIMED_EVENT",
  68: "PLAYMOVIE",
  69: "MOVE_TO_POS",
  70: "RESPAWN_TARGET",
  71: "EQUIP",
  72: "CLOSE_GOSSIP",
  73: "TRIGGER_TIMED_EVENT",
  74: "REMOVE_TIMED_EVENT",
  75: "ADD_AURA",
  76: "OVERRIDE_SCRIPT_BASE_OBJECT",
  77: "RESET_SCRIPT_BASE_OBJECT",
  78: "CALL_SCRIPT_RESET",
  79: "SET_RANGED_MOVEMENT",
  80: "CALL_TIMED_ACTIONLIST",
  81: "SET_NPC_FLAG",
  82: "ADD_NPC_FLAG",
  83: "REMOVE_NPC_FLAG",
  84: "SIMPLE_TALK",
  85: "INVOKER_CAST",
  86: "CROSS_CAST",
  87: "CALL_RANDOM_TIMED_ACTIONLIST",
  88: "CALL_RANDOM_RANGE_TIMED_ACTIONLIST",
  89: "RANDOM_MOVE",
  90: "SET_UNIT_FIELD_BYTES_1",
  91: "REMOVE_UNIT_FIELD_BYTES_1",
  92: "INTERRUPT_SPELL",
  93: "SEND_GO_CUSTOM_ANIM",
  94: "SET_DYNAMIC_FLAG",
  95: "ADD_DYNAMIC_FLAG",
  96: "REMOVE_DYNAMIC_FLAG",
  97: "JUMP_TO_POS",
  98: "SEND_GOSSIP_MENU",
  99: "GO_SET_LOOT_STATE",
  100: "SEND_TARGET_TO_TARGET",
  101: "SET_HOME_POS",
  102: "SET_HEALTH_REGEN",
  103: "SET_ROOT",
  104: "SET_GO_FLAG",
  105: "ADD_GO_FLAG",
  106: "REMOVE_GO_FLAG",
  107: "SUMMON_CREATURE_GROUP",
  108: "SET_POWER",
  109: "ADD_POWER",
  110: "REMOVE_POWER",
  111: "GAME_EVENT_STOP",
  112: "GAME_EVENT_START",
  113: "START_CLOSEST_WAYPOINT",
  114: "RISE_UP",
};

const SMART_SOURCE_TYPE_NAMES: Record<number, string> = {
  0: "CREATURE",
  1: "GAMEOBJECT",
  2: "AREATRIGGER",
  3: "EVENT",
  4: "GOSSIP",
  5: "QUEST",
  6: "SPELL",
  7: "TRANSPORT",
  8: "INSTANCE",
  9: "TIMED_ACTIONLIST",
};

/** action_menu_id sentinel values that are NOT real menu IDs — they're npcflag
 *  bits the core recognizes as built-in option types. See SkyFire's GossipDef.h
 *  GOSSIP_OPTION_* enum. */
const GOSSIP_OPTION_SENTINELS: Record<number, string> = {
  2: "GOSSIP_OPTION_GOSSIP (UNIT_NPC_FLAG_GOSSIP)",
  16: "GOSSIP_OPTION_TRAINER (UNIT_NPC_FLAG_TRAINER)",
  128: "GOSSIP_OPTION_VENDOR (UNIT_NPC_FLAG_VENDOR)",
  256: "GOSSIP_OPTION_TAXIVENDOR (UNIT_NPC_FLAG_TAXIVENDOR)",
  4096: "GOSSIP_OPTION_FLIGHTMASTER (UNIT_NPC_FLAG_FLIGHTMASTER)",
  8192: "GOSSIP_OPTION_SPIRITHEALER (UNIT_NPC_FLAG_SPIRITHEALER)",
  16384: "GOSSIP_OPTION_SPIRITGUIDE (UNIT_NPC_FLAG_SPIRITGUIDE)",
  32768: "GOSSIP_OPTION_INNKEEPER (UNIT_NPC_FLAG_INNKEEPER)",
  65536: "GOSSIP_OPTION_BANKER (UNIT_NPC_FLAG_BANKER)",
  131072: "GOSSIP_OPTION_PETITIONER (legacy)",
  262144: "GOSSIP_OPTION_TABARDDESIGNER (UNIT_NPC_FLAG_TABARDDESIGNER)",
  524288: "GOSSIP_OPTION_BATTLEFIELD-related",
  1048576: "GOSSIP_OPTION_BATTLEFIELD (UNIT_NPC_FLAG_BATTLEFIELDPERSON)",
  2097152: "GOSSIP_OPTION_AUCTIONEER (UNIT_NPC_FLAG_AUCTIONEER)",
  4194304: "GOSSIP_OPTION_STABLEPET (UNIT_NPC_FLAG_STABLE)",
  8388608: "GOSSIP_OPTION_ARMORER",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eventName(t: number): string {
  return `${t}/${SMART_EVENT_NAMES[t] || "?"}`;
}

function actionName(t: number): string {
  return `${t}/${SMART_ACTION_NAMES[t] || "?"}`;
}

/** Walk a directory recursively and yield .cpp/.h files (and similar). */
function* walkSourceFiles(root: string, includeExts: Set<string>): Generator<string> {
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true, encoding: "utf-8" }) as Dirent[];
  } catch {
    return;
  }
  for (const e of entries) {
    const name: string = typeof e.name === "string" ? e.name : String(e.name);
    const full = join(root, name);
    if (e.isDirectory()) {
      // Skip git internals and build outputs
      if (name === ".git" || name === "node_modules" || name === "build" || name === "dist" || name === "objs") {
        continue;
      }
      yield* walkSourceFiles(full, includeExts);
    } else if (e.isFile()) {
      const dotIdx = name.lastIndexOf(".");
      if (dotIdx !== -1 && includeExts.has(name.slice(dotIdx + 1).toLowerCase())) {
        yield full;
      }
    }
  }
}

/**
 * SQL identifiers and reserved words we should NOT prefix with `s.` when
 * auto-disambiguating a self-join WHERE clause. List is intentionally
 * conservative — better to leave something un-prefixed and surface a
 * MySQL ambiguity error than to break a valid query.
 */
const SQL_KEYWORDS = new Set([
  "AND", "OR", "NOT", "IS", "NULL", "TRUE", "FALSE",
  "IN", "BETWEEN", "LIKE", "AS", "ON", "USING",
  "DISTINCT", "ALL", "ANY", "SOME", "EXISTS", "CASE", "WHEN", "THEN", "ELSE", "END",
  "DIV", "MOD", "XOR",
]);

/**
 * Auto-prefix bare column identifiers in a user-supplied WHERE clause with
 * `s.` when we're doing a self-join (source_table === target_table). Strings
 * (single-quoted) and backtick-quoted identifiers are left alone.
 *
 * Conservative: only prefixes identifiers that look like column names AND
 * aren't already qualified AND aren't SQL keywords. Numeric literals,
 * already-qualified columns (`s.foo`, `t.foo`), keywords, and quoted
 * strings pass through unchanged.
 */
function autoPrefixSelfJoinWhere(where: string): string {
  // Tokenize: match string literals, backtick-quoted identifiers, or bare identifiers.
  // The two captured groups correspond to: (a) opaque chunks we don't touch,
  // (b) the bare identifier we might need to prefix.
  // Negative lookbehind `(?<![\w.])` skips the second half of a qualified name
  // (e.g. `Title` in `t.Title`). Negative lookahead `(?!\s*\.)` skips an
  // unqualified identifier that's about to BE the alias of a qualified name
  // (e.g. the `t` in `t.Title`).
  return where.replace(
    /('(?:[^'\\]|\\.)*'|`[^`]*`|"(?:[^"\\]|\\.)*")|(?<![\w.])([A-Za-z_][A-Za-z0-9_]*)(?!\s*\.)/g,
    (match, quoted, ident) => {
      if (quoted) return match;        // string / backtick block — leave alone
      if (!ident) return match;
      if (SQL_KEYWORDS.has(ident.toUpperCase())) return match;
      return `s.\`${ident}\``;
    }
  );
}

/**
 * Grep a directory tree for an exact string. Returns at most `maxMatches`
 * results. Cheap enough for one-shot queries against a SkyFire-sized tree.
 */
function grepSourceTree(root: string, needle: string, maxMatches: number = 30): { file: string; line: number; text: string }[] {
  if (!existsSync(root)) return [];
  const exts = new Set(["cpp", "h", "hpp", "c", "cc"]);
  const out: { file: string; line: number; text: string }[] = [];
  for (const file of walkSourceFiles(root, exts)) {
    let content: string;
    try {
      const stats = statSync(file);
      if (stats.size > 5 * 1024 * 1024) continue; // skip huge files
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    if (!content.includes(needle)) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(needle)) {
        out.push({ file, line: i + 1, text: lines[i].trim().slice(0, 250) });
        if (out.length >= maxMatches) return out;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function registerForensicTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // get_smart_scripts
  // -------------------------------------------------------------------------
  server.tool(
    "get_smart_scripts",
    "Fetch SmartAI rules for a given source (creature / gameobject / quest / etc.) from the `smart_scripts` table, with human-readable event_type and action_type names. Use this BEFORE filing a 'broken gossip / missing menu' bug — SmartAI event 62 (GOSSIP_SELECT) or 64 (GOSSIP_HELLO) handlers on the source often bypass the need for the destination gossip_menu row.",
    {
      entryorguid: z.number().describe("The creature_template entry (or gameobject entry, or other source ID) to look up. Negative values are spawn-specific GUIDs."),
      source_type: z.number().min(0).max(9).optional().describe("SmartAI source_type. 0=CREATURE (default), 1=GAMEOBJECT, 2=AREATRIGGER, 3=EVENT, 4=GOSSIP, 5=QUEST, 6=SPELL, 7=TRANSPORT, 8=INSTANCE, 9=TIMED_ACTIONLIST."),
      limit: z.number().min(1).max(500).optional().describe("Max rows to return. Default 100."),
    },
    async ({ entryorguid, source_type = 0, limit = 100 }) => {
      try {
        // Schema varies across cores: 3.3.5 has target_param4, MoP/Cata SkyFire does not.
        // SELECT * keeps us schema-agnostic — only a handful of rows per call so cost is fine.
        // LIMIT is inlined (not bound) because mysql2 prepared-statement protocol rejects
        // numeric placeholders for LIMIT on some MySQL versions ("Incorrect arguments to
        // mysqld_stmt_execute"). `limit` is validated by zod min(1).max(500).
        const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
        const rows = await query(
          "world",
          `SELECT *
           FROM smart_scripts
           WHERE source_type = ? AND entryorguid = ?
           ORDER BY id
           LIMIT ${safeLimit}`,
          [source_type, entryorguid]
        );
        if (rows.length === 0) {
          return { content: [{ type: "text" as const, text: `No smart_scripts rows for source_type=${source_type} (${SMART_SOURCE_TYPE_NAMES[source_type] || "?"}), entryorguid=${entryorguid}.` }] };
        }
        const lines = rows.map(r => {
          const p4 = r.event_param4 !== undefined ? `, p4=${r.event_param4}` : "";
          return `  id=${r.id} link=${r.link} | event ${eventName(Number(r.event_type))} (p1=${r.event_param1}, p2=${r.event_param2}, p3=${r.event_param3}${p4}) → action ${actionName(Number(r.action_type))} (p1=${r.action_param1}, p2=${r.action_param2}, p3=${r.action_param3}) | target=${r.target_type}`;
        });
        // Summarize gossip-related handlers up front since that's the #1 false-positive source
        const gossipHandlers = rows.filter(r => Number(r.event_type) === 62 || Number(r.event_type) === 64);
        const summary = gossipHandlers.length > 0
          ? `\n\n⚠️  ${gossipHandlers.length} gossip handler(s) found (event_type 62 GOSSIP_SELECT or 64 GOSSIP_HELLO). These typically intercept option clicks BEFORE the destination gossip_menu row is consulted, so 'missing menu' bugs on this source are often false positives.\n`
          : "";
        return {
          content: [{
            type: "text" as const,
            text: `${rows.length} smart_scripts row(s) for ${SMART_SOURCE_TYPE_NAMES[source_type] || "?"} entryorguid=${entryorguid}:${summary}\n${lines.join("\n")}`,
          }],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // -------------------------------------------------------------------------
  // inspect_creature
  // -------------------------------------------------------------------------
  server.tool(
    "inspect_creature",
    "Full deep-dive on a creature: template (name, flags, ScriptName, gossip_menu_id), quest starter/ender rows, vendor item count, smart_scripts summary, spawn count, and creature_loot_template summary. Combines ~6-8 queries you'd otherwise run by hand. Use this as the FIRST step when investigating any NPC bug.",
    {
      entry: z.number().describe("creature_template entry ID"),
    },
    async ({ entry }) => {
      try {
        const ct = getSchema().world.creature_template;
        const [tplRows, starterRows, enderRows, vendorRows, scriptRows, spawnRows, lootRows] = await Promise.all([
          query("world", `SELECT \`${ct.entry}\` AS entry, \`${ct.name}\` AS name, \`${ct.subname}\` AS subname, \`${ct.minlevel}\` AS minlevel, \`${ct.maxlevel}\` AS maxlevel, \`${ct.npcflag}\` AS npcflag, \`${ct.gossip_menu_id}\` AS gossip_menu_id, ScriptName, AIName FROM \`${ct.table}\` WHERE \`${ct.entry}\` = ?`, [entry]),
          query("world", `SELECT quest FROM creature_queststarter WHERE id = ? ORDER BY quest`, [entry]),
          query("world", `SELECT quest FROM creature_questender WHERE id = ? ORDER BY quest`, [entry]),
          query("world", `SELECT COUNT(*) AS n FROM npc_vendor WHERE entry = ?`, [entry]),
          query("world", `SELECT event_type, COUNT(*) AS n FROM smart_scripts WHERE source_type = 0 AND entryorguid = ? GROUP BY event_type ORDER BY event_type`, [entry]),
          query("world", `SELECT COUNT(*) AS n FROM \`${getSchema().world.creature.table}\` WHERE \`${getSchema().world.creature.id}\` = ?`, [entry]),
          query("world", `SELECT COUNT(*) AS n, SUM(CASE WHEN mincountOrRef < 0 THEN 1 ELSE 0 END) AS ref_rows FROM creature_loot_template WHERE entry = ?`, [entry]),
        ]);

        if (tplRows.length === 0) {
          return { content: [{ type: "text" as const, text: `Creature template entry ${entry} does not exist.` }], isError: true };
        }
        const tpl = tplRows[0];
        const parts: string[] = [];
        parts.push(`=== Creature ${entry}: "${tpl.name}"${tpl.subname ? ` <${tpl.subname}>` : ""} ===`);
        parts.push(`Level: ${tpl.minlevel}-${tpl.maxlevel} | npcflag: ${tpl.npcflag} | gossip_menu_id: ${tpl.gossip_menu_id}`);
        parts.push(`ScriptName: ${tpl.ScriptName ? `"${tpl.ScriptName}"` : "(none)"} | AIName: ${tpl.AIName ? `"${tpl.AIName}"` : "(none)"}`);
        if (tpl.ScriptName) {
          parts.push(`  → use \`check_scriptname("${tpl.ScriptName}")\` to verify if this C++ script exists in the configured core source tree.`);
        }
        parts.push(`Spawns in world: ${spawnRows[0]?.n ?? 0}`);
        parts.push(`Quest starter rows: ${starterRows.length}${starterRows.length > 0 ? ` (quests: ${starterRows.map(r => r.quest).join(", ")})` : ""}`);
        parts.push(`Quest ender rows:   ${enderRows.length}${enderRows.length > 0 ? ` (quests: ${enderRows.map(r => r.quest).join(", ")})` : ""}`);
        parts.push(`npc_vendor rows:    ${vendorRows[0]?.n ?? 0}`);
        const totalLoot = Number(lootRows[0]?.n ?? 0);
        const refLoot = Number(lootRows[0]?.ref_rows ?? 0);
        parts.push(`creature_loot_template rows: ${totalLoot}${refLoot > 0 ? ` (${refLoot} are reference_loot_template refs)` : ""}`);
        if (scriptRows.length > 0) {
          parts.push(`smart_scripts (source_type=0):`);
          for (const r of scriptRows) {
            parts.push(`  ${eventName(Number(r.event_type))}: ${r.n} row(s)`);
          }
          const hasGossipHandler = scriptRows.some(r => Number(r.event_type) === 62 || Number(r.event_type) === 64);
          if (hasGossipHandler && Number(tpl.gossip_menu_id) > 0) {
            parts.push(`  ⚠️  This NPC has both gossip_menu_id=${tpl.gossip_menu_id} AND SmartAI gossip handler(s). 'Missing destination menu' bugs are likely false positives — SmartAI fires on option click regardless of whether the destination gossip_menu row exists.`);
          }
        } else {
          parts.push(`smart_scripts: (none)`);
        }
        return { content: [{ type: "text" as const, text: parts.join("\n") }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // -------------------------------------------------------------------------
  // inspect_gossip_chain
  // -------------------------------------------------------------------------
  server.tool(
    "inspect_gossip_chain",
    "Trace a gossip menu fully: the gossip_menu row (text_id), every option in gossip_menu_option, the existence status of each option's action_menu_id (including magic GOSSIP_OPTION_* sentinels like 1048576 = BATTLEFIELD queue), every NPC that uses this menu (via creature_template.gossip_menu_id), and any smart_scripts event 62/64 handlers tied to those NPCs. Use this BEFORE filing a 'missing gossip menu blocks players' bug — SmartAI or sentinel values frequently make the missing row irrelevant.",
    {
      menu_id: z.number().describe("gossip_menu.entry to inspect"),
    },
    async ({ menu_id }) => {
      try {
        const [menuRows, optRows, npcRows] = await Promise.all([
          query("world", `SELECT entry, text_id FROM gossip_menu WHERE entry = ?`, [menu_id]),
          query("world", `SELECT id, option_text, action_menu_id, action_poi_id, npc_option_npcflag, OptionBroadcastTextID FROM gossip_menu_option WHERE menu_id = ? ORDER BY id`, [menu_id]),
          query("world", `SELECT entry, name, ScriptName FROM creature_template WHERE gossip_menu_id = ? ORDER BY entry LIMIT 50`, [menu_id]),
        ]);

        const parts: string[] = [];
        parts.push(`=== Gossip Menu ${menu_id} ===`);
        if (menuRows.length === 0) {
          parts.push(`gossip_menu row: MISSING (no row with entry=${menu_id})`);
          parts.push(`  → If this menu is referenced by options or smart_scripts, the menu page will show no header text. Whether that breaks anything depends on whether the OPTIONS exist and whether scripts handle clicks.`);
        } else {
          parts.push(`gossip_menu row: text_id=${menuRows[0].text_id}${menuRows.length > 1 ? ` (${menuRows.length} duplicate rows!)` : ""}`);
        }

        parts.push(`\nOptions in gossip_menu_option (${optRows.length}):`);
        if (optRows.length === 0) {
          parts.push(`  (none — menu has no clickable options on this row)`);
        }

        // For each option's action_menu_id, classify it
        const actionTargets = Array.from(new Set(optRows.map(r => Number(r.action_menu_id)).filter(v => v > 0 && !GOSSIP_OPTION_SENTINELS[v])));
        const targetExistsMap = new Map<number, boolean>();
        if (actionTargets.length > 0) {
          const placeholders = actionTargets.map(() => "?").join(",");
          const targetRows = await query("world", `SELECT entry FROM gossip_menu WHERE entry IN (${placeholders})`, actionTargets);
          const found = new Set(targetRows.map(r => Number(r.entry)));
          for (const t of actionTargets) targetExistsMap.set(t, found.has(t));
        }

        for (const o of optRows) {
          const am = Number(o.action_menu_id);
          let amStatus: string;
          if (am === 0) {
            amStatus = `action_menu_id=0 (no further menu — usually closes gossip or completes scripted action)`;
          } else if (GOSSIP_OPTION_SENTINELS[am]) {
            amStatus = `action_menu_id=${am} ⚠️  SENTINEL: ${GOSSIP_OPTION_SENTINELS[am]} — NOT a real menu ID, handled by core C++`;
          } else if (targetExistsMap.get(am)) {
            amStatus = `action_menu_id=${am} ✓ exists in gossip_menu`;
          } else {
            amStatus = `action_menu_id=${am} ✗ MISSING from gossip_menu`;
          }
          parts.push(`  [${o.id}] "${(o.option_text || "").slice(0, 80)}" | ${amStatus}${o.action_poi_id ? ` | action_poi_id=${o.action_poi_id}` : ""}${o.npc_option_npcflag ? ` | npc_option_npcflag=${o.npc_option_npcflag}` : ""}`);
        }

        parts.push(`\nNPCs using this menu (creature_template.gossip_menu_id=${menu_id}): ${npcRows.length}`);
        for (const n of npcRows.slice(0, 20)) {
          parts.push(`  ${n.entry} ${n.name}${n.ScriptName ? ` | ScriptName="${n.ScriptName}"` : ""}`);
        }
        if (npcRows.length > 20) parts.push(`  ... and ${npcRows.length - 20} more`);

        // Cross-check SmartAI handlers on those NPCs
        if (npcRows.length > 0) {
          const entries = npcRows.map(n => Number(n.entry));
          const placeholders = entries.map(() => "?").join(",");
          const smartHandlers = await query(
            "world",
            `SELECT entryorguid, event_type, event_param1, COUNT(*) AS n
             FROM smart_scripts
             WHERE source_type = 0 AND entryorguid IN (${placeholders}) AND event_type IN (62, 64)
             GROUP BY entryorguid, event_type, event_param1
             ORDER BY entryorguid, event_type`,
            entries
          );
          if (smartHandlers.length > 0) {
            parts.push(`\n⚠️  SmartAI gossip handlers on these NPCs (${smartHandlers.length} groupings):`);
            for (const h of smartHandlers) {
              parts.push(`  entry=${h.entryorguid} | ${eventName(Number(h.event_type))} | event_param1 (gossipMenuId)=${h.event_param1} | ${h.n} row(s)`);
            }
            parts.push(`  → If event_param1 matches one of the 'missing' destination menus above, SmartAI is handling the click and the missing row is COSMETIC ONLY. Don't file as a bug.`);
          }
        }

        return { content: [{ type: "text" as const, text: parts.join("\n") }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // -------------------------------------------------------------------------
  // find_orphan_refs
  // -------------------------------------------------------------------------
  server.tool(
    "find_orphan_refs",
    "Generic foreign-key integrity sweep. Finds rows in `source_table.source_column` that point to a value not present in `target_table.target_column`. Use this for systematic bug-hunting: quest_objective→item_template, creature_loot_template→item_template, gossip_menu_option.action_menu_id→gossip_menu, etc. Returns count, sample rows, and a SQL repro snippet.",
    {
      source_table: z.string().regex(/^[A-Za-z0-9_]+$/).describe("Table containing the foreign reference (e.g. 'quest_objective')"),
      source_column: z.string().regex(/^[A-Za-z0-9_]+$/).describe("Column in source_table holding the foreign key (e.g. 'objectId')"),
      target_table: z.string().regex(/^[A-Za-z0-9_]+$/).describe("Table that should contain the referenced value (e.g. 'item_template')"),
      target_column: z.string().regex(/^[A-Za-z0-9_]+$/).describe("Column in target_table that source_column refers to (e.g. 'entry')"),
      where: z.string().optional().describe("Optional extra WHERE clause on source rows (e.g. 'type = 1 AND objectId > 0'). Identifier-safe substring is NOT enforced — only pass values you trust. For self-joins (source_table = target_table, e.g. quest_template.PrevQuestId → quest_template.Id), bare column references are auto-prefixed with `s.` to disambiguate; if you need to reference a target-table column instead, qualify it explicitly with `t.colname`."),
      sample_size: z.number().min(0).max(100).optional().describe("Number of sample orphan rows to return (default 10)"),
      exclude_sentinels: z.boolean().optional().describe("If true, excludes known GOSSIP_OPTION_* sentinel values (1048576, 2097152, etc.) from the orphan count when source_column is action_menu_id. Default: auto (true if column name contains 'action_menu_id')."),
    },
    async ({ source_table, source_column, target_table, target_column, where, sample_size = 10, exclude_sentinels }) => {
      try {
        const includeSentinelFilter = exclude_sentinels ?? source_column.toLowerCase().includes("action_menu_id");
        const sentinelClause = includeSentinelFilter
          ? ` AND s.\`${source_column}\` NOT IN (${Object.keys(GOSSIP_OPTION_SENTINELS).join(",")})`
          : "";

        // When source_table === target_table (self-join, e.g. quest_template.PrevQuestId →
        // quest_template.Id), bare column names in the user's WHERE clause are ambiguous
        // because both `s` and `t` aliases expose every column. Auto-prefix unqualified
        // identifiers with `s.` so users don't have to know about the join structure.
        // We skip:
        //   - identifiers already qualified (preceded by `.`)
        //   - SQL keywords
        //   - identifiers inside string literals or backtick-quoted blocks
        const processedWhere = (where && source_table === target_table)
          ? autoPrefixSelfJoinWhere(where)
          : where;
        const extraWhere = processedWhere ? ` AND (${processedWhere})` : "";

        const countSql = `
          SELECT COUNT(*) AS n
          FROM \`${source_table}\` s
          LEFT JOIN \`${target_table}\` t ON s.\`${source_column}\` = t.\`${target_column}\`
          WHERE s.\`${source_column}\` > 0
            AND t.\`${target_column}\` IS NULL
            ${sentinelClause}
            ${extraWhere}
        `;
        const sampleSql = `
          SELECT s.*
          FROM \`${source_table}\` s
          LEFT JOIN \`${target_table}\` t ON s.\`${source_column}\` = t.\`${target_column}\`
          WHERE s.\`${source_column}\` > 0
            AND t.\`${target_column}\` IS NULL
            ${sentinelClause}
            ${extraWhere}
          ORDER BY s.\`${source_column}\`
          LIMIT ${Math.max(0, Math.min(100, Math.floor(sample_size)))}
        `;

        const [countRows, sampleRows] = await Promise.all([
          query("world", countSql),
          sample_size > 0 ? query("world", sampleSql) : Promise.resolve([] as any[]),
        ]);
        const n = Number(countRows[0]?.n ?? 0);

        const parts: string[] = [];
        parts.push(`Orphan-reference sweep:`);
        parts.push(`  ${source_table}.${source_column} → ${target_table}.${target_column}${where ? ` WHERE ${where}` : ""}${includeSentinelFilter ? `  (excluding ${Object.keys(GOSSIP_OPTION_SENTINELS).length} GOSSIP_OPTION_* sentinel values)` : ""}`);
        parts.push(`  Orphan rows: ${n}`);
        if (sampleRows.length > 0) {
          parts.push(`\nFirst ${sampleRows.length} sample(s):`);
          for (const r of sampleRows) {
            parts.push(`  ${JSON.stringify(r)}`);
          }
        }
        parts.push(`\nReproducible SQL:`);
        parts.push(`-- count`);
        parts.push(countSql.trim().replace(/\s+/g, " "));
        parts.push(`-- sample`);
        parts.push(sampleSql.trim().replace(/\s+/g, " "));

        return { content: [{ type: "text" as const, text: parts.join("\n") }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // -------------------------------------------------------------------------
  // check_scriptname
  // -------------------------------------------------------------------------
  server.tool(
    "check_scriptname",
    "Search the configured worldserver core source tree (config.core_source_path) for a ScriptName string. Returns the files + line numbers where the script is registered (and a not-found warning if absent). Use this whenever a creature/gameobject has a non-empty ScriptName before claiming its DB-level behavior is broken — the C++ may handle things outside the DB. Requires `core_source_path` to be set in config.json.",
    {
      script_name: z.string().min(1).describe("The ScriptName value (e.g. 'npc_wg_queue', 'boss_ordos')"),
      max_matches: z.number().min(1).max(100).optional().describe("Max matches to return (default 20)"),
    },
    async ({ script_name, max_matches = 20 }) => {
      const cfg = getConfig();
      const root = cfg.core_source_path;
      if (!root) {
        return {
          content: [{
            type: "text" as const,
            text: `Source path not configured. Set "core_source_path" in config.json to the absolute path of your worldserver core clone (e.g. SkyFire_548 or TrinityCore checkout) to enable this tool.`,
          }],
        };
      }
      if (!existsSync(root)) {
        return {
          content: [{
            type: "text" as const,
            text: `Configured core_source_path does not exist: ${root}`,
          }],
          isError: true,
        };
      }
      const hits = grepSourceTree(root, script_name, max_matches);
      if (hits.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No matches for ScriptName "${script_name}" in ${root}.\n\n⚠️  This does NOT prove the script is absent on the running server — many repacks (incl. EmuCoach MoP Premium) ship a modified core whose source is not available locally. Interpret as: "upstream baseline doesn't have it." Recommend testing in-game before filing a bug.`,
          }],
        };
      }
      const lines = hits.map(h => `  ${h.file.replace(root, "").replace(/^[\\/]/, "")}:${h.line}  ${h.text}`);
      return {
        content: [{
          type: "text" as const,
          text: `Found ${hits.length} match(es) for "${script_name}" in ${root}:\n${lines.join("\n")}`,
        }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // inspect_loot_table  (bonus tool, same forensic theme)
  // -------------------------------------------------------------------------
  server.tool(
    "inspect_loot_table",
    "Inspect any loot table row (creature_loot_template, gameobject_loot_template, item_loot_template, reference_loot_template, etc.) for an entry, classifying each row as: valid item drop / currency (negative ID) / reference (negative mincountOrRef) / missing item. Use this BEFORE claiming a chest/mob 'drops nothing' — most have a mix of working and broken rows, and negative item IDs are currencies not bugs.",
    {
      table: z.enum(["creature_loot_template", "gameobject_loot_template", "item_loot_template", "reference_loot_template", "disenchant_loot_template", "milling_loot_template", "prospecting_loot_template", "mail_loot_template", "fishing_loot_template", "skinning_loot_template"]).describe("Loot table name"),
      entry: z.number().describe("Loot table entry/source ID"),
    },
    async ({ table, entry }) => {
      try {
        const rows = await query("world", `SELECT entry, item, ChanceOrQuestChance, lootmode, groupid, mincountOrRef, maxcount FROM \`${table}\` WHERE entry = ? ORDER BY groupid, item`, [entry]);
        if (rows.length === 0) {
          return { content: [{ type: "text" as const, text: `No rows in ${table} for entry=${entry}.` }] };
        }

        // For positive item IDs, check existence
        const positiveItems = Array.from(new Set(rows.map(r => Number(r.item)).filter(v => v > 0)));
        const existingItems = new Set<number>();
        if (positiveItems.length > 0) {
          const placeholders = positiveItems.map(() => "?").join(",");
          const it = getSchema().world.item_template;
          const found = await query("world", `SELECT \`${it.id}\` AS entry FROM \`${it.table}\` WHERE \`${it.id}\` IN (${placeholders})`, positiveItems);
          for (const r of found) existingItems.add(Number(r.entry));
        }

        // For reference rows (mincountOrRef < 0), check the target ref exists
        const refTargets = Array.from(new Set(rows.map(r => Number(r.mincountOrRef)).filter(v => v < 0).map(v => Math.abs(v))));
        const existingRefs = new Set<number>();
        if (refTargets.length > 0) {
          const placeholders = refTargets.map(() => "?").join(",");
          const found = await query("world", `SELECT entry FROM reference_loot_template WHERE entry IN (${placeholders}) GROUP BY entry`, refTargets);
          for (const r of found) existingRefs.add(Number(r.entry));
        }

        let validDrops = 0, currencies = 0, missingItems = 0, validRefs = 0, missingRefs = 0;
        const lines: string[] = [];
        for (const r of rows) {
          const item = Number(r.item);
          const minRef = Number(r.mincountOrRef);
          let classification: string;
          if (item < 0) {
            classification = `CURRENCY (negative item ID — points to Currency.dbc entry ${Math.abs(item)})`;
            currencies++;
          } else if (minRef < 0) {
            const refExists = existingRefs.has(Math.abs(minRef));
            classification = refExists
              ? `REF → reference_loot_template entry ${Math.abs(minRef)} (exists)`
              : `REF → reference_loot_template entry ${Math.abs(minRef)} ✗ MISSING`;
            if (refExists) validRefs++; else missingRefs++;
          } else {
            const itemExists = existingItems.has(item);
            classification = itemExists ? `ITEM ok` : `ITEM ${item} ✗ MISSING from item_template`;
            if (itemExists) validDrops++; else missingItems++;
          }
          lines.push(`  item=${item} chance=${r.ChanceOrQuestChance} min=${r.mincountOrRef} max=${r.maxcount} group=${r.groupid} | ${classification}`);
        }

        const validRows = validDrops + currencies + validRefs;
        const brokenRows = missingItems + missingRefs;
        const summary: string[] = [];
        summary.push(`=== ${table} entry ${entry}: ${rows.length} row(s) ===`);
        summary.push(`  ${validDrops} valid item drop(s), ${currencies} currency drop(s), ${validRefs} valid ref(s)`);
        if (brokenRows > 0) {
          summary.push(`  ⚠️  ${missingItems} broken item ref(s), ${missingRefs} broken loot-table ref(s)`);
        }
        if (brokenRows > 0 && validRows === 0) {
          summary.push(`  ⚠️  ALL ${rows.length} row(s) are broken — this loot table produces NOTHING in-game.`);
        } else if (brokenRows > 0 && validRows > 0) {
          summary.push(`  Note: ${validRows} of ${rows.length} rows still produce valid drops despite the ${brokenRows} broken row(s) above.`);
        }
        return { content: [{ type: "text" as const, text: summary.join("\n") + "\n\nRow details:\n" + lines.join("\n") }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}
