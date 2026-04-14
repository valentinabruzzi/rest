import "dotenv/config";

import path from "node:path";
import { Client } from "pg";
import {
  getRequiredEnv,
  getSnapshotFilePath,
  importSnapshot,
  loadSnapshotFromFile,
} from "./db-transfer";

type DrillSummary = {
  restaurants: number;
  staffUsers: number;
  tables: number;
  categories: number;
  products: number;
  orders: number;
  orderItems: number;
  payments: number;
  staffRequests: number;
  ordersWithoutItems: number;
};

async function runChecks(connectionString: string): Promise<DrillSummary> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const [
      restaurants,
      staffUsers,
      tables,
      categories,
      products,
      orders,
      orderItems,
      payments,
      staffRequests,
      ordersWithoutItems,
    ] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS count FROM "Restaurant"`),
      client.query(`SELECT COUNT(*)::int AS count FROM "StaffUser"`),
      client.query(`SELECT COUNT(*)::int AS count FROM "Table"`),
      client.query(`SELECT COUNT(*)::int AS count FROM "Category"`),
      client.query(`SELECT COUNT(*)::int AS count FROM "Product"`),
      client.query(`SELECT COUNT(*)::int AS count FROM "Order"`),
      client.query(`SELECT COUNT(*)::int AS count FROM "OrderItem"`),
      client.query(`SELECT COUNT(*)::int AS count FROM "Payment"`),
      client.query(`SELECT COUNT(*)::int AS count FROM "StaffRequest"`),
      client.query(`
        SELECT COUNT(*)::int AS count
        FROM "Order" o
        WHERE NOT EXISTS (
          SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o."id"
        )
      `),
    ]);

    return {
      restaurants: restaurants.rows[0]?.count ?? 0,
      staffUsers: staffUsers.rows[0]?.count ?? 0,
      tables: tables.rows[0]?.count ?? 0,
      categories: categories.rows[0]?.count ?? 0,
      products: products.rows[0]?.count ?? 0,
      orders: orders.rows[0]?.count ?? 0,
      orderItems: orderItems.rows[0]?.count ?? 0,
      payments: payments.rows[0]?.count ?? 0,
      staffRequests: staffRequests.rows[0]?.count ?? 0,
      ordersWithoutItems: ordersWithoutItems.rows[0]?.count ?? 0,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const explicitPath = process.argv[2];
  const snapshotPath = explicitPath
    ? path.resolve(explicitPath)
    : getSnapshotFilePath();
  const targetDatabaseUrl =
    process.env.RESTORE_DRILL_DATABASE_URL?.trim() ||
    process.env.TARGET_DATABASE_URL?.trim() ||
    getRequiredEnv("TARGET_DATABASE_URL");

  const snapshot = await loadSnapshotFromFile(snapshotPath);
  await importSnapshot(targetDatabaseUrl, snapshot);
  const summary = await runChecks(targetDatabaseUrl);

  if (summary.restaurants === 0) {
    throw new Error("Restore drill failed: no restaurants found after import.");
  }
  if (summary.orders > 0 && summary.ordersWithoutItems > 0) {
    throw new Error(
      `Restore drill failed: ${summary.ordersWithoutItems} restored orders have no items.`
    );
  }

  console.log(
    JSON.stringify(
      {
        snapshotPath,
        checkedAt: new Date().toISOString(),
        summary,
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
