import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/staff-auth";
import { StaffBoard } from "@/components/staff/staff-board";
import type { StaffRequestSummary } from "@/types/staff-request";
import { resolveRestaurantIdentity } from "@/lib/restaurant-resolver";
import {
  getStaffMenuEditorPayload,
  getStaffOrdersPayload,
  getStaffOrderTakingPayload,
  getStaffRequestsPayload,
  type StaffMenuCategoryRow,
  type StaffMenuItemRow,
  type StaffOrderRowData,
  type StaffTableRow,
} from "@/lib/staff-view-data";
import type { MenuCategory } from "@/types/menu";

export default async function StaffHomePage({
  searchParams,
}: {
  searchParams: Promise<{
    adminPreview?: string;
    restaurant?: string;
    restaurantName?: string;
    name?: string;
  }>;
}) {
  const params = await searchParams;
  const previewRestaurantSlug =
    typeof params.adminPreview !== "undefined"
      ? params.restaurant?.trim() ?? ""
      : "";
  const previewRestaurantName =
    typeof params.adminPreview !== "undefined"
      ? params.restaurantName?.trim() ?? params.name?.trim() ?? ""
      : "";

  if (previewRestaurantSlug) {
    const resolvedRestaurant = await resolveRestaurantIdentity({
      slug: previewRestaurantSlug,
      name: previewRestaurantName,
      activeOnly: false,
    });
    if (resolvedRestaurant.status !== "ok") redirect("/admin");

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: resolvedRestaurant.restaurant.id },
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        theme: true,
        settings: true,
      },
    });

    if (!restaurant) redirect("/admin");

    return (
      <StaffBoard
        restaurantName={restaurant.name}
        restaurantSlug={restaurant.slug}
        logoUrl={restaurant.logoUrl}
        primaryColor={restaurant.primaryColor}
        secondaryColor={restaurant.secondaryColor}
        theme={restaurant.theme}
        settings={restaurant.settings}
        preview
      />
    );
  }

  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  let initialOrders: StaffOrderRowData[] = [];
  let initialRequests: StaffRequestSummary[] = [];
  let initialDashboardLoaded = false;
  let initialMenuCategories: StaffMenuCategoryRow[] = [];
  let initialMenuItems: StaffMenuItemRow[] = [];
  let initialMenuEditorLoaded = false;
  let initialOrderTakingTables: StaffTableRow[] = [];
  let initialOrderTakingCategories: MenuCategory[] = [];
  let initialOrderTakingCurrency = "EUR";
  let initialOrderTakingServiceFeePercent = 0;
  let initialOrderTakingLoaded = false;

  const preloaded = await Promise.allSettled([
    getStaffOrdersPayload(session.restaurantId, { servedRange: "today" }),
    getStaffRequestsPayload(session.restaurantId),
    getStaffOrderTakingPayload({ restaurantId: session.restaurantId }),
    getStaffMenuEditorPayload(session.restaurantId),
  ]);

  if (preloaded[0].status === "fulfilled") {
    initialOrders = preloaded[0].value;
  }

  if (preloaded[1].status === "fulfilled") {
    initialRequests = preloaded[1].value;
  }

  initialDashboardLoaded =
    preloaded[0].status === "fulfilled" && preloaded[1].status === "fulfilled";

  if (preloaded[2].status === "fulfilled") {
    initialOrderTakingTables = preloaded[2].value.tables;
    initialOrderTakingCategories = preloaded[2].value.categories;
    initialOrderTakingCurrency = preloaded[2].value.currency;
    initialOrderTakingServiceFeePercent = preloaded[2].value.serviceFeePercent;
    initialOrderTakingLoaded = true;
  }

  if (preloaded[3].status === "fulfilled") {
    initialMenuCategories = preloaded[3].value.categories;
    initialMenuItems = preloaded[3].value.items;
    initialMenuEditorLoaded = true;
  }

  return (
    <StaffBoard
      restaurantName={session.restaurantName}
      restaurantSlug={session.restaurantSlug}
      logoUrl={session.restaurantLogoUrl}
      primaryColor={session.restaurantPrimaryColor}
      secondaryColor={session.restaurantSecondaryColor}
      theme={session.restaurantTheme}
      settings={session.restaurantSettings}
      preview={false}
      initialOrders={initialOrders}
      initialRequests={initialRequests}
      initialDashboardLoaded={initialDashboardLoaded}
      initialMenuCategories={initialMenuCategories}
      initialMenuItems={initialMenuItems}
      initialMenuEditorLoaded={initialMenuEditorLoaded}
      initialOrderTakingTables={initialOrderTakingTables}
      initialOrderTakingCategories={initialOrderTakingCategories}
      initialOrderTakingCurrency={initialOrderTakingCurrency}
      initialOrderTakingServiceFeePercent={initialOrderTakingServiceFeePercent}
      initialOrderTakingLoaded={initialOrderTakingLoaded}
    />
  );
}
