import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgAdapter: PrismaPg | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter =
    process.env.NODE_ENV === "production"
      ? new PrismaPg({ connectionString: url })
      : (globalForPrisma.pgAdapter ??= new PrismaPg({ connectionString: url }));

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function stripWrappingQuotes(value: string) {
  return value.replace(/^['"]|['"]$/g, "");
}

function readProjectDatabaseUrlFromFile(filename: string) {
  const filePath = path.join(process.cwd(), filename);
  if (!existsSync(filePath)) {
    return null;
  }

  const parsed = parseDotenv(readFileSync(filePath));
  const value = parsed.DATABASE_URL?.trim();
  return value ? stripWrappingQuotes(value) : null;
}

function resolveDatabaseUrl() {
  if (process.env.NODE_ENV !== "production") {
    const localUrl =
      readProjectDatabaseUrlFromFile(".env.local") ??
      readProjectDatabaseUrlFromFile(".env");
    if (localUrl) {
      return localUrl;
    }
  }

  return process.env.DATABASE_URL;
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
