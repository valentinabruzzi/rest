import { unstable_cache } from "next/cache";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { type StaffLoginRestaurantOption } from "@/lib/restaurant-directory";

const STAFF_LOGIN_RESTAURANTS_REVALIDATE_SECONDS = 300;
const STAFF_LOGIN_RESTAURANTS_CACHE_FILE = join(
  tmpdir(),
  "bb-staff-login-restaurants.json"
);

function sanitizeRestaurantOptions(value: unknown): StaffLoginRestaurantOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const restaurant = entry as Record<string, unknown>;
      const id =
        typeof restaurant.id === "string" && restaurant.id.trim().length > 0
          ? restaurant.id.trim()
          : null;
      const name =
        typeof restaurant.name === "string" && restaurant.name.trim().length > 0
          ? restaurant.name.trim()
          : null;
      const slug =
        typeof restaurant.slug === "string" && restaurant.slug.trim().length > 0
          ? restaurant.slug.trim()
          : null;

      if (!id || !name || !slug) return null;

      return {
        id,
        name,
        slug,
        logoUrl: typeof restaurant.logoUrl === "string" ? restaurant.logoUrl : null,
        primaryColor:
          typeof restaurant.primaryColor === "string" &&
          restaurant.primaryColor.trim().length > 0
            ? restaurant.primaryColor
            : "#6E0F1F",
        secondaryColor:
          typeof restaurant.secondaryColor === "string" &&
          restaurant.secondaryColor.trim().length > 0
            ? restaurant.secondaryColor
            : "#4E0915",
      };
    })
    .filter((entry): entry is StaffLoginRestaurantOption => entry !== null);
}

async function readStaffLoginRestaurantsFromDisk() {
  try {
    const raw = await readFile(STAFF_LOGIN_RESTAURANTS_CACHE_FILE, "utf8");
    return sanitizeRestaurantOptions(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeStaffLoginRestaurantsToDisk(
  restaurants: StaffLoginRestaurantOption[]
) {
  try {
    await mkdir(tmpdir(), { recursive: true });
    await writeFile(
      STAFF_LOGIN_RESTAURANTS_CACHE_FILE,
      JSON.stringify(restaurants),
      "utf8"
    );
  } catch {
    /* cache writes are best-effort */
  }
}

const getCachedStaffLoginRestaurants = unstable_cache(
  async (): Promise<StaffLoginRestaurantOption[]> => {
    return prisma.restaurant.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
      },
    });
  },
  ["staff-login-restaurants"],
  {
    revalidate: STAFF_LOGIN_RESTAURANTS_REVALIDATE_SECONDS,
  }
);

export async function getStaffLoginRestaurants() {
  try {
    const restaurants = await getCachedStaffLoginRestaurants();
    if (restaurants.length > 0) {
      await writeStaffLoginRestaurantsToDisk(restaurants);
    }
    return restaurants;
  } catch (error) {
    const cachedRestaurants = await readStaffLoginRestaurantsFromDisk();
    if (cachedRestaurants.length > 0) {
      return cachedRestaurants;
    }
    throw error;
  }
}
