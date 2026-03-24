import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getConfig, resolveConfigPath } from "../config.js";

const execAsync = promisify(exec);

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

/** Backup database(s) using mysqldump */
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

  let cmd = `"${mysqldumpPath}" -h${config.database.host} -P${config.database.port} -u${config.database.user}`;
  if (config.database.password) {
    cmd += ` -p${config.database.password}`;
  }

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
    cmd += ` ${dbNames[0]} ${tables.join(" ")}`;
  } else {
    cmd += ` --databases ${dbNames.join(" ")}`;
  }

  if (whereClause) {
    // Note: mysqldump --where applies to ALL dumped tables in that execution.
    // If you only want to filter rows for a specific table, provide only that table in the 'tables' list.
    cmd += ` "--where=${whereClause}"`;
  }

  cmd += ` > "${outputPath}"`;

  await execAsync(cmd, { windowsHide: true });
  return outputPath;
}
