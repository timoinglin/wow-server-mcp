# Bug-Hunting Playbook

Practical guide for using the MCP to verify whether a suspected DB anomaly is actually a bug — without filing false positives.

This document is also intended for AI agents commissioned to hunt bugs autonomously. Read the **Anti-false-positive rules** section before filing anything.

---

## TL;DR — the workflow

For any "this looks broken" claim:

1. **`inspect_creature(entry)`** if it involves an NPC. Look at `ScriptName`, `AIName`, and the smart_scripts summary. **If either is non-empty, half the "obvious" bugs evaporate.**
2. **`inspect_gossip_chain(menu_id)`** if it involves gossip. Look for sentinel `action_menu_id` values and SmartAI handlers on the NPCs that use the menu.
3. **`check_scriptname(name)`** if a ScriptName showed up in step 1. If it's present in the source, the C++ probably handles the behavior — DO NOT assume DB-level breakage.
4. **`inspect_loot_table(table, entry)`** if it involves loot. Negative item IDs are currencies, not bugs. A table with 13 working rows + 1 broken row is not "drops nothing".
5. **`find_orphan_refs(...)`** for systematic sweeps across many rows at once (e.g. "all quest_objective items that don't exist").

When in doubt, **mark UNVERIFIED, don't file** — write down what would prove it in-game, then test there.

---

## The five forensic tools (added in 1.4.0)

| Tool | Use when |
| --- | --- |
| `inspect_creature(entry)` | Investigating any creature. One call replaces 6–8 raw `db_query`s. |
| `inspect_gossip_chain(menu_id)` | Investigating any gossip-related bug. Traces menu → options → destinations → script handlers in one pass. |
| `get_smart_scripts(entryorguid, source_type=0)` | When you suspect SmartAI is involved (event 62 = `GOSSIP_SELECT`, event 64 = `GOSSIP_HELLO`, etc.). |
| `find_orphan_refs(source_table, source_column, target_table, target_column, where?)` | Systematic FK-integrity sweeps. Auto-excludes known sentinel values when scanning `action_menu_id`. |
| `check_scriptname(name)` | Verifying whether a `ScriptName` corresponds to actual C++ code. Requires `core_source_path` in `config.json`. |
| `inspect_loot_table(table, entry)` | Auditing any loot row. Classifies each row as valid drop / currency / reference / missing. |

---

## Anti-false-positive rules

These are the patterns that account for the vast majority of bad bug reports on a typical repack. **Run the listed check before filing.**

### Rule 1 — Currencies are not items

Loot tables can have **negative item IDs**. These point to `Currency.dbc` entries, not `item_template`. Examples on MoP:

- `-738` = Lesser Charm of Good Fortune
- `-777` = Timeless Coin
- `-697` = Elder Charm of Good Fortune

**Wrong:** "Mob X drops nonexistent item -738."
**Right:** `inspect_loot_table('creature_loot_template', X)` — the tool labels these as `CURRENCY`.

### Rule 2 — `action_menu_id` sentinels are not menu IDs

Several `action_menu_id` values are **magic constants** matching `UNIT_NPC_FLAG_*` bits. They tell the core "this option is a battlefield queue button / auctioneer / banker / etc." — no `gossip_menu` row is needed for them.

The full list is in `src/tools/forensic-tools.ts` (`GOSSIP_OPTION_SENTINELS`). The most common offender:

- `1048576` = `GOSSIP_OPTION_BATTLEFIELD` (Wintergrasp queue, etc.)
- `2097152` = `GOSSIP_OPTION_AUCTIONEER`
- `4194304` = `GOSSIP_OPTION_STABLEPET`

**Wrong:** "Wintergrasp Battlemaster has broken gossip — menu 1048576 missing."
**Right:** `inspect_gossip_chain(10662)` — the tool flags these explicitly.

### Rule 3 — SmartAI event 62 / 64 bypasses missing gossip_menu rows

If a creature has `smart_scripts` rows with `event_type = 62` (`SMART_EVENT_GOSSIP_SELECT`) or `64` (`SMART_EVENT_GOSSIP_HELLO`), the script fires when the player clicks the option, regardless of whether the destination `gossip_menu` row exists. The missing row may just mean the menu has no header text (cosmetic).

**Wrong:** "Warlord Gar'dul gossip chain broken — menu 50812 missing."
**Right:** `inspect_creature(37811)` → sees SmartAI handler on event 62 with `event_param1 = 50812`. The handler grants quest credit on click. **Cosmetic, not a bug.**

### Rule 4 — ScriptName implies C++ handling

If `creature_template.ScriptName` is non-empty, a C++ handler exists (in the running server). Even if the upstream source clone doesn't contain it, the live server might. DB-only reasoning is insufficient.

**Wrong:** "Madam Goya has `phaseMask = 0` → upstream TrinityCore convention says this means invisible."
**Right:** `phaseMask` semantics are core-specific. EmuCoach's modified build treats `phaseMask = 0` as visible-to-all. Verify in-game before claiming invisibility.

### Rule 5 — Don't cherry-pick evidence rows

If your evidence query returns 2 rows that prove the bug but the actual table has 14 rows of which 12 work fine, **show all 14**. A loot table with 12 working drops and 2 broken drops is not "broken" — it's slightly wrong. The fix is a one-row trim, not a major rewrite.

**Use `inspect_loot_table(...)`** — it summarizes `X valid / Y broken / Z currencies` so cherry-picking is impossible.

### Rule 6 — Deprecated content isn't a "blocker"

Some quest chains, class rituals, and NPC dialogues from classic / Burning Crusade / Wotlk are deprecated by Cata/MoP and never invoked by the current client. Even if they're literally broken in the DB, no current player is blocked.

When you find broken old content, label it `LOW` severity at most and note "deprecated in current expansion" — don't escalate.

### Rule 7 — When unsure, mark UNVERIFIED

If you can't decisively prove the bug from DB + source, file it with `severity: UNVERIFIED` and a `requires_ingame_check:` field listing exact in-game repro steps. Don't inflate to HIGH to make it look important.

---

## Recommended sweeps for systematic hunting

Drop these into `find_orphan_refs` for an integrity sweep across the whole world DB:

```
# Quests requiring nonexistent items (item-collect objectives)
find_orphan_refs(
  source_table='quest_objective',
  source_column='objectId',
  target_table='item_template',
  target_column='entry',
  where='type = 1 AND objectId > 0'
)

# Quests requiring kills of nonexistent creatures
find_orphan_refs(
  source_table='quest_objective',
  source_column='objectId',
  target_table='creature_template',
  target_column='entry',
  where='type = 0 AND objectId > 0'
)

# Quests requiring use of nonexistent gameobjects
find_orphan_refs(
  source_table='quest_objective',
  source_column='objectId',
  target_table='gameobject_template',
  target_column='entry',
  where='type = 2 AND objectId > 0'
)

# Creature loot dropping items that don't exist
find_orphan_refs(
  source_table='creature_loot_template',
  source_column='item',
  target_table='item_template',
  target_column='entry',
  where='item > 0'
)

# Gameobject loot dropping items that don't exist
find_orphan_refs(
  source_table='gameobject_loot_template',
  source_column='item',
  target_table='item_template',
  target_column='entry',
  where='item > 0'
)

# NPC vendors selling items that don't exist
find_orphan_refs(
  source_table='npc_vendor',
  source_column='item',
  target_table='item_template',
  target_column='entry',
  where='item > 0'
)

# Creature questgivers offering quests that don't exist
find_orphan_refs(
  source_table='creature_queststarter',
  source_column='quest',
  target_table='quest_template',
  target_column='Id'
)

# Broken gossip navigation (excludes UNIT_NPC_FLAG sentinels)
find_orphan_refs(
  source_table='gossip_menu_option',
  source_column='action_menu_id',
  target_table='gossip_menu',
  target_column='entry',
  where='action_menu_id > 0',
  exclude_sentinels=true
)
```

Each orphan hit becomes a CANDIDATE bug — run `inspect_creature` / `inspect_gossip_chain` / `check_scriptname` on the specific entries before filing.

---

## Filing format (if writing MD files for a tracker)

YAML frontmatter:
```yaml
---
severity: HIGH | MEDIUM | LOW | UNVERIFIED
category: quest-hook | loot | gossip | spawn | vendor | reward | areatrigger | trainer
status: open
db: world
tables: comma, separated, list
ids_involved: comma, separated, list
requires_ingame_check: (only if UNVERIFIED) exact steps to reproduce in-game
---
```

Body sections:
- `## What I found`
- `## Evidence (reproducible)` — actual SQL + actual output
- `## Why this might be an issue` — what player impact
- `## What to verify next` — what would confirm or refute
- `## NOT a fix.` — explicit note we are only reporting

Cite the tools used (`inspect_creature`, `inspect_gossip_chain`, etc.) so a reviewer can re-run them.

---

## Repack-specific quirks worth knowing

These have been observed on EmuCoach MoP Premium 7.1 (a modified SkyFire 5.4.8 build). Other repacks may differ.

| Quirk | Don't do | Do |
| --- | --- | --- |
| `creature.phaseMask = 0` is visible-to-all | Assume invisible based on upstream | Verify in-game |
| Schema uses only `phaseMask`, not upstream `phaseid`+`phasegroup` | Grep upstream source for phase logic | Test live |
| Many NPCs have `ScriptName` but the C++ isn't in upstream | Treat `check_scriptname` "not found" as proof of absence | Treat as "upstream baseline doesn't have it" — test in-game |
| SmartAI handles a lot of gossip flow | File "missing gossip_menu" on any NPC with event 62/64 handlers | Use `inspect_gossip_chain` first |

Last updated 2026-05-25 after the round-2 audit that produced this playbook.
