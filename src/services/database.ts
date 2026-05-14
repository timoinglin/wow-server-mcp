import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { spawn } from "child_process";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getConfig, resolveConfigPath } from "../config.js";

const pools: Map<string, Pool> = new Map();

export type DbName = "auth" | "characters" | "world";

function getDbNameFromConfig(db: DbName): string {
  const config = getConfig();
  switch (db) {
    case "auth":
      return config.database.auth;
    case "characters":
      return config.database.characters;
    case "world":
      return config.database.world;
  }
}

function createPool(db: DbName): Pool {
  const config = getConfig();
  const dbName = getDbNameFromConfig(db);

  const opts: PoolOptions = {
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false,
  };

  return mysql.createPool(opts);
}

export function getPool(db: DbName): Pool {
  let pool = pools.get(db);
  if (!pool) {
    pool = createPool(db);
    pools.set(db, pool);
  }
  return pool;
}

/** Reset all pools (e.g., after config change) */
export async function resetPools(): Promise<void> {
  for (const [, pool] of pools) {
    await pool.end();
  }
  pools.clear();
}

/** Execute a SELECT query and return rows */
export async function query(
  db: DbName,
  sql: string,
  params?: unknown[]
): Promise<RowDataPacket[]> {
  const pool = getPool(db);
  const [rows] = await pool.execute<RowDataPacket[]>(sql, (params || []) as any[]);
  return rows;
}

/** Execute an INSERT/UPDATE/DELETE and return result info */
export async function execute(
  db: DbName,
  sql: string,
  params?: unknown[]
): Promise<{ affectedRows: number; insertId: number; info: string }> {
  const pool = getPool(db);
  const [result] = await pool.execute<ResultSetHeader>(sql, (params || []) as any[]);
  return {
    affectedRows: result.affectedRows,
    insertId: result.insertId,
    info: result.info,
  };
}

/** Execute raw SQL (for DDL, complex queries, etc.) — returns raw result */
export async function executeRaw(
  db: DbName,
  sql: string,
  params?: unknown[]
): Promise<unknown> {
  const pool = getPool(db);
  const [result] = await pool.query(sql, params || []);
  return result;
}

/** Test connection to a specific database */
export async function testConnection(db: DbName): Promise<boolean> {
  try {
    const pool = getPool(db);
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch {
    return false;
  }
}

/** Identifier-safe: letters, digits, underscore. Used to validate table names
 *  before passing them to mysqldump as command-line arguments. */
const SAFE_IDENT = /^[A-Za-z0-9_]+$/;

/**
 * Backup database(s) using mysqldump.
 *
 * Security notes:
 *  - We invoke mysqldump with `spawn` and an argument array (no shell), so
 *    table names / db names cannot inject extra shell tokens.
 *  - The MySQL password is passed via the `MYSQL_PWD` environment variable
 *    rather than `-p<pwd>` on the command line, so it does not appear in
 *    process listings (tasklist / ps).
 *  - Identifier arguments (database name, table names) are validated with
 *    `SAFE_IDENT`. `whereClause` is passed as a single `--where=...` argv
 *    entry, so it cannot break out of the arg even with quotes/semicolons.
 */
export async function createDatabaseBackup(
  databases: DbName[],
  tables?: string[],
  whereClause?: string
): Promise<string> {
  const config = getConfig();
  const mysqldumpPath = resolveConfigPath(config.servers.mysql.working_dir + "/mysql/bin/mysqldump.exe");
  if (!existsSync(mysqldumpPath)) {
    throw new Error(`mysqldump.exe not found at ${mysqldumpPath}`);
  }

  const dbNames = databases.map((db) => {
    switch (db) {
      case "auth": return config.database.auth;
      case "characters": return config.database.characters;
      case "world": return config.database.world;
    }
  });

  for (const name of dbNames) {
    if (!name || !SAFE_IDENT.test(name)) {
      throw new Error(`Refusing to back up database with unsafe name: ${JSON.stringify(name)}`);
    }
  }
  if (tables) {
    for (const t of tables) {
      if (!SAFE_IDENT.test(t)) {
        throw new Error(`Refusing to back up table with unsafe name: ${JSON.stringify(t)}`);
      }
    }
  }

  const args: string[] = [
    `-h${config.database.host}`,
    `-P${String(config.database.port)}`,
    `-u${config.database.user}`,
  ];

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let filename = `backup_${timestamp}`;
  if (databases.length === 3 && (!tables || tables.length === 0) && !whereClause) {
    filename += "_full";
  } else if (databases.length === 1) {
    filename += `_${databases[0]}`;
  }
  filename += `.sql`;

  const backupDir = resolveConfigPath("backups");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  const outputPath = join(backupDir, filename);

  if (tables && tables.length > 0) {
    if (databases.length > 1) {
      throw new Error("Cannot specify tables when dumping multiple databases.");
    }
    args.push(dbNames[0]!, ...tables);
  } else {
    args.push("--databases", ...dbNames as string[]);
  }

  if (whereClause) {
    // mysqldump --where applies to ALL dumped tables in this execution.
    // Passed as a single argv entry so shell metacharacters in the clause
    // cannot break out.
    args.push(`--where=${whereClause}`);
  }

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(outputPath);
    const env = { ...process.env };
    if (config.database.password) env.MYSQL_PWD = config.database.password;

    const child = spawn(mysqldumpPath, args, {
      env,
      windowsHide: true,
      shell: false,
    });

    child.stdout.pipe(out);

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      out.destroy();
      reject(new Error(`mysqldump spawn failed: ${err.message}`));
    });

    child.on("close", (code) => {
      out.end(() => {
        if (code === 0) {
          resolve();
        } else {
          // Redact password (which lives in env, not args, but belt-and-braces)
          // and trim stderr — mysqldump can emit warnings on stderr even on success.
          const safeStderr = stderr.replace(/\b(password)\b\s*[:=]\s*\S+/gi, "$1=***").trim();
          reject(new Error(`mysqldump exited with code ${code}${safeStderr ? `: ${safeStderr}` : ""}`));
        }
      });
    });
  });

  return outputPath;
}
