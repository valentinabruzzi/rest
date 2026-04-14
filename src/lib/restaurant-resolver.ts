import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";
import {
  normalizeRestaurantNameInput,
  normalizeRestaurantSlugInput,
} from "@/lib/restaurant-directory";

type ResolvedRestaurantIdentity = {
  id: string;
  name: string;
  slug: string;
};

const RESOLVED_RESTAURANT_IDENTITY_SELECT = {
  id: true,
  name: true,
  slug: true,
} as const;

export type ResolveRestaurantIdentityResult =
  | { status: "ok"; restaurant: ResolvedRestaurantIdentity }
  | { status: "not_found" }
  | { status: "ambiguous" };

const resolveRestaurantIdentityCached = unstable_cache(
  async (
    slug: string,
    name: string,
    activeOnly: boolean
  ): Promise<ResolveRestaurantIdentityResult> => {
    if (!slug) {
      return { status: "not_found" };
    }

    const restaurantsWithMatchingSlug = await prisma.restaurant.findMany({
      where: {
        slug,
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: RESOLVED_RESTAURANT_IDENTITY_SELECT,
    });

    if (restaurantsWithMatchingSlug.length === 0) {
      return { status: "not_found" };
    }

    if (name) {
      const matchingRestaurantsByName = restaurantsWithMatchingSlug.filter(
        (restaurant) => normalizeRestaurantNameInput(restaurant.name) === name
      );

      if (matchingRestaurantsByName.length === 1) {
        return { status: "ok", restaurant: matchingRestaurantsByName[0] };
      }

      if (matchingRestaurantsByName.length > 1) {
        return { status: "ambiguous" };
      }

      return { status: "not_found" };
    }

    if (restaurantsWithMatchingSlug.length === 1) {
      return { status: "ok", restaurant: restaurantsWithMatchingSlug[0] };
    }

    return { status: "ambiguous" };
  },
  ["restaurant-identity"],
  {
    revalidate: 300,
    tags: [DATA_CACHE_TAGS.restaurantDirectory],
  }
);

export async function resolveRestaurantIdentity(args: {
  slug?: string | null;
  name?: string | null;
  activeOnly?: boolean;
}): Promise<ResolveRestaurantIdentityResult> {
  const slug = normalizeRestaurantSlugInput(args.slug ?? "");
  const name = normalizeRestaurantNameInput(args.name ?? "");
  return resolveRestaurantIdentityCached(slug, name, args.activeOnly !== false);
}
