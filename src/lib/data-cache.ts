import { revalidateTag } from "next/cache";

export const DATA_CACHE_TAGS = {
  restaurantDirectory: "restaurant-directory",
  adminData: "admin-data",
  publicMenu: "public-menu",
  tableContext: "table-context",
  staffMenu: "staff-menu",
  staffOrderTaking: "staff-order-taking",
  staffAnalytics: "staff-analytics",
} as const;

export function revalidateRestaurantDirectoryCache() {
  revalidateTag(DATA_CACHE_TAGS.restaurantDirectory);
}

export function revalidateAdminDataCache() {
  revalidateTag(DATA_CACHE_TAGS.adminData);
}

export function revalidateMenuReadCaches() {
  revalidateTag(DATA_CACHE_TAGS.publicMenu);
  revalidateTag(DATA_CACHE_TAGS.tableContext);
  revalidateTag(DATA_CACHE_TAGS.staffMenu);
  revalidateTag(DATA_CACHE_TAGS.staffOrderTaking);
}

export function revalidateAnalyticsCache() {
  revalidateTag(DATA_CACHE_TAGS.staffAnalytics);
}

export function revalidateAllRestaurantReadCaches() {
  revalidateRestaurantDirectoryCache();
  revalidateAdminDataCache();
  revalidateMenuReadCaches();
  revalidateAnalyticsCache();
}
