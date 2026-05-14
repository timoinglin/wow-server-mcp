import { MoPSchema, SchemaDefinition } from './definitions.js';
import * as fs from 'fs';

let currentSchema: SchemaDefinition = structuredClone(MoPSchema);

type DbSection = SchemaDefinition['auth'] | SchemaDefinition['world'];

/**
 * Per-table deep merge: for each table in `override`, merge the override's
 * column mappings on top of the default table mapping (rather than replacing
 * the whole table). This lets users override one column without re-specifying
 * the rest.
 */
function mergeSection<T extends DbSection>(base: T, override: Partial<T> | undefined): T {
  if (!override) return base;
  const result = { ...base };
  for (const tbl of Object.keys(override) as Array<keyof T>) {
    const ov = override[tbl];
    if (ov && typeof ov === 'object') {
      result[tbl] = { ...(base[tbl] as object), ...(ov as object) } as T[keyof T];
    }
  }
  return result;
}

/**
 * Load the schema. If `configPath` points to an existing JSON file with a
 * `schema_override` field, its mappings are merged on top of the default
 * MoPSchema. Otherwise the default schema is used.
 */
export async function initializeSchema(configPath?: string): Promise<SchemaDefinition> {
  currentSchema = structuredClone(MoPSchema);

  if (!configPath) return currentSchema;
  if (!fs.existsSync(configPath)) {
    console.error(`Schema override file not found at ${configPath}; using default MoPSchema.`);
    return currentSchema;
  }

  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const override = data.schema_override;
    if (!override) {
      console.error(`Schema override file ${configPath} has no 'schema_override' key; using default MoPSchema.`);
      return currentSchema;
    }
    currentSchema.auth = mergeSection(currentSchema.auth, override.auth);
    currentSchema.world = mergeSection(currentSchema.world, override.world);
    console.error(`Schema override loaded from ${configPath}.`);
  } catch (err) {
    console.error('Failed to load schema override:', err);
  }
  return currentSchema;
}

/**
 * Returns the currently active schema definition. Always call this inside a
 * tool handler — do NOT cache the result at registration time, since the
 * schema can change between registration and first call.
 */
export function getSchema(): SchemaDefinition {
  return currentSchema;
}
