import "dotenv/config";

import { config as loadDotenv } from "dotenv";
import { Client } from "pg";
import {
  exportSnapshot,
  getSnapshotFilePath,
  importSnapshot,
  saveSnapshotToFile,
} from "./db-transfer";

loadDotenv({ path: ".env.neon.backup.local", override: false });

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function maskConnectionString(value: string) {
  try {
    const url = new URL(value);
    if (url.password) url.password = "********";
    return url.toString();
  } catch {
    return value;
  }
}

async function checkConnection(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const restaurants = await client.query<{ count: string }>(
      'select count(*) from "Restaurant"'
    );
    const products = await client.query<{ count: string }>(
      'select count(*) from "Product"'
    );

    return {
      restaurants: Number(restaurants.rows[0]?.count ?? 0),
      products: Number(products.rows[0]?.count ?? 0),
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const [command = "check", maybeFilePath] = process.argv.slice(2);
  if (!["check", "export", "copy"].includes(command)) {
    throw new Error(
      "Usage: npm run db:recover:neon -- [check|export|copy] [optional-snapshot-path]"
    );
  }

  const sourceDatabaseUrl =
    process.env.NEON_DATABASE_URL?.trim() ||
    process.env.NEON_POSTGRES_URL?.trim() ||
    process.env.NEON_POSTGRES_PRISMA_URL?.trim();
  const targetDatabaseUrl = getRequiredEnv("DATABASE_URL");

  if (!sourceDatabaseUrl) {
    throw new Error(
      "No Neon backup connection found. Set NEON_DATABASE_URL in .env.neon.backup.local."
    );
  }

  if (command === "check") {
    const counts = await checkConnection(sourceDatabaseUrl);
    console.log(
      JSON.stringify(
        {
          sourceDatabase: maskConnectionString(sourceDatabaseUrl),
          counts,
        },
        null,
        2
      )
    );
    return;
  }

  const snapshot = await exportSnapshot(sourceDatabaseUrl);
  if (command === "export") {
    const filePath = getSnapshotFilePath(maybeFilePath || "tmp/neon-recovery-snapshot.json");
    await saveSnapshotToFile(filePath, snapshot);
    console.log(
      JSON.stringify(
        {
          sourceDatabase: maskConnectionString(sourceDatabaseUrl),
          snapshotPath: filePath,
          exportedAt: snapshot.exportedAt,
        },
        null,
        2
      )
    );
    return;
  }

  await importSnapshot(targetDatabaseUrl, snapshot);
  console.log(
    JSON.stringify(
      {
        sourceDatabase: maskConnectionString(sourceDatabaseUrl),
        targetDatabase: maskConnectionString(targetDatabaseUrl),
        importedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
