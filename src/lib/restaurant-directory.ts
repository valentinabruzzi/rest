export type StaffLoginRestaurantOption = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
};

export function normalizeRestaurantNameInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeRestaurantSlugInput(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatRestaurantNameFromSlug(slug: string) {
  return slug
    .trim()
    .split("-")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function createRestaurantIdentityKey(args: {
  name: string;
  slug: string;
}) {
  return `${normalizeRestaurantNameInput(args.name).toLowerCase()}::${normalizeRestaurantSlugInput(
    args.slug
  )}`;
}
