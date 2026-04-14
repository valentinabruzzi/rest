import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/staff-auth";
import {
  createRestaurantIdentityKey,
  type StaffLoginRestaurantOption,
} from "@/lib/restaurant-directory";
import { getStaffLoginRestaurants } from "@/lib/staff-login-restaurants";
import { StaffLoginForm } from "@/components/staff/staff-login-form";

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurant?: string; restaurantName?: string; name?: string }>;
}) {
  const session = await getStaffSession();
  if (session) redirect("/staff");

  const params = await searchParams;
  let initialRestaurants: StaffLoginRestaurantOption[] = [];
  try {
    initialRestaurants = await getStaffLoginRestaurants();
  } catch {
    initialRestaurants = [];
  }
  const requestedSlug = params.restaurant?.trim() ?? "";
  const requestedName =
    params.restaurantName?.trim() ?? params.name?.trim() ?? "";
  const initialRestaurant =
    initialRestaurants.find(
      (restaurant) =>
        restaurant.slug === requestedSlug &&
        (!requestedName || restaurant.name === requestedName)
    ) ??
    initialRestaurants.find((restaurant) => restaurant.slug === requestedSlug) ??
    initialRestaurants[0] ??
    null;

  return (
    <StaffLoginForm
      initialRestaurants={initialRestaurants}
      initialRestaurantSlug={initialRestaurant?.slug ?? requestedSlug}
      initialRestaurantName={initialRestaurant?.name ?? requestedName}
      initialRestaurantSelectionKey={
        initialRestaurant
          ? createRestaurantIdentityKey({
              name: initialRestaurant.name,
              slug: initialRestaurant.slug,
            })
          : ""
      }
    />
  );
}
