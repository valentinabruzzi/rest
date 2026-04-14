import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const TABLES = [
  "Restaurant",
  "StaffUser",
  "Table",
  "Category",
  "Product",
  "ProductOptionGroup",
  "ProductOption",
  "Order",
  "OrderItem",
  "Payment",
  "OrderReward",
  "StaffRequest",
] as const;

type TableName = (typeof TABLES)[number];

type DatabaseSnapshot = {
  exportedAt: string;
  sourceDatabase: string;
  tables: Record<TableName, Array<Record<string, unknown>>>;
};

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function maskConnectionString(value: string) {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "********";
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function getSourceDatabaseUrl() {
  return process.env.SOURCE_DATABASE_URL?.trim() || getRequiredEnv("DATABASE_URL");
}

export function getTargetDatabaseUrl() {
  return getRequiredEnv("TARGET_DATABASE_URL");
}

export function getSnapshotFilePath(explicitPath?: string) {
  if (explicitPath?.trim()) {
    return path.resolve(explicitPath.trim());
  }

  const fromEnv = process.env.DB_TRANSFER_FILE?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  return path.resolve("tmp", "db-snapshot.json");
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function withClient<T>(connectionString: string, run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function getTableColumns(client: Client, tableName: TableName) {
  const result = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position ASC
    `,
    [tableName]
  );

  if (result.rows.length === 0) {
    throw new Error(`Could not read columns for table ${tableName}.`);
  }

  return result.rows.map((row) => row.column_name);
}

export async function exportSnapshot(connectionString: string): Promise<DatabaseSnapshot> {
  return withClient(connectionString, async (client) => {
    const tables = {} as DatabaseSnapshot["tables"];

    for (const tableName of TABLES) {
      const result = await client.query<Record<string, unknown>>(
        `SELECT * FROM ${quoteIdent(tableName)} ORDER BY "id" ASC`
      );
      tables[tableName] = result.rows;
    }

    return {
      exportedAt: new Date().toISOString(),
      sourceDatabase: maskConnectionString(connectionString),
      tables,
    };
  });
}

async function insertRows(
  client: Client,
  tableName: TableName,
  rows: Array<Record<string, unknown>>
) {
  if (rows.length === 0) {
    return;
  }

  const columns = await getTableColumns(client, tableName);
  const columnSql = columns.map(quoteIdent).join(", ");

  for (const batch of chunkArray(rows, 100)) {
    const values: unknown[] = [];
    const tuples = batch.map((row, rowIndex) => {
      const placeholders = columns.map((columnName, columnIndex) => {
        values.push(row[columnName] ?? null);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    await client.query(
      `INSERT INTO ${quoteIdent(tableName)} (${columnSql}) VALUES ${tuples.join(", ")}`,
      values
    );
  }
}

export async function importSnapshot(
  connectionString: string,
  snapshot: DatabaseSnapshot
) {
  await withClient(connectionString, async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `TRUNCATE TABLE ${[...TABLES]
          .reverse()
          .map(quoteIdent)
          .join(", ")} RESTART IDENTITY CASCADE`
      );

      for (const tableName of TABLES) {
        await insertRows(client, tableName, snapshot.tables[tableName] ?? []);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveSnapshotToFile(filePath: string, snapshot: DatabaseSnapshot) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function loadSnapshotFromFile(filePath: string): Promise<DatabaseSnapshot> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as DatabaseSnapshot;
}

async function main() {
  const [command, arg] = process.argv.slice(2);

  if (!command || !["export", "import", "copy"].includes(command)) {
    console.error(
      "Usage:\n  npm run db:transfer:export -- ./tmp/db-snapshot.json\n  npm run db:transfer:import -- ./tmp/db-snapshot.json\n  npm run db:transfer:copy"
    );
    process.exit(1);
  }

  if (command === "export") {
    const filePath = getSnapshotFilePath(arg);
    const sourceDatabaseUrl = getSourceDatabaseUrl();
    const snapshot = await exportSnapshot(sourceDatabaseUrl);
    await saveSnapshotToFile(filePath, snapshot);
    console.log(`Snapshot saved to ${filePath}`);
    return;
  }

  if (command === "import") {
    const filePath = getSnapshotFilePath(arg);
    const targetDatabaseUrl = getTargetDatabaseUrl();
    const snapshot = await loadSnapshotFromFile(filePath);
    await importSnapshot(targetDatabaseUrl, snapshot);
    console.log(`Snapshot imported into ${maskConnectionString(targetDatabaseUrl)}`);
    return;
  }

  const sourceDatabaseUrl = getSourceDatabaseUrl();
  const targetDatabaseUrl = getTargetDatabaseUrl();
  const snapshot = await exportSnapshot(sourceDatabaseUrl);
  await importSnapshot(targetDatabaseUrl, snapshot);
  console.log(
    `Copied data from ${maskConnectionString(sourceDatabaseUrl)} to ${maskConnectionString(
      targetDatabaseUrl
    )}`
  );
}

const currentFilePath = fileURLToPath(import.meta.url);
const entryFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entryFilePath === currentFilePath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
