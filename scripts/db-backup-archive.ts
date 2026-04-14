import "dotenv/config";

import path from "node:path";
import {
  exportSnapshot,
  getSourceDatabaseUrl,
  saveSnapshotToFile,
} from "./db-transfer";

function formatTimestampPart(date: Date) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

async function main() {
  const sourceDatabaseUrl = getSourceDatabaseUrl();
  const backupDir = process.env.DB_BACKUP_DIR?.trim()
    ? path.resolve(process.env.DB_BACKUP_DIR.trim())
    : path.resolve("tmp", "backups");
  const snapshotPath = path.join(
    backupDir,
    formatTimestampPart(new Date()),
    "db-snapshot.json"
  );

  const snapshot = await exportSnapshot(sourceDatabaseUrl);
  await saveSnapshotToFile(snapshotPath, snapshot);

  const tableCounts = Object.fromEntries(
    Object.entries(snapshot.tables).map(([tableName, rows]) => [tableName, rows.length])
  );

  console.log(
    JSON.stringify(
      {
        snapshotPath,
        exportedAt: snapshot.exportedAt,
        sourceDatabase: snapshot.sourceDatabase,
        tableCounts,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
