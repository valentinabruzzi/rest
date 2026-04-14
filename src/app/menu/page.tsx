import { CartProvider } from "@/context/cart-context";
import { MenuExperience } from "@/components/menu/menu-experience";
import {
  getRestaurantMenuPayload,
  getTableContextData,
} from "@/lib/public-menu-data";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{
    restaurant?: string;
    name?: string;
    table?: string;
    token?: string;
    t?: string;
    adminPreview?: string;
  }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? sp.t;
  const initialTableContextResult = await getTableContextData({
    token,
    restaurantSlug: sp.restaurant,
    restaurantName: sp.name,
    tableNumber: sp.table,
  });
  const initialRestaurantSlug =
    initialTableContextResult.data?.restaurant.slug ?? sp.restaurant ?? "";
  const initialRestaurantName =
    initialTableContextResult.data?.restaurant.name ?? sp.name ?? "";
  const initialMenuResult = initialRestaurantSlug
    ? await getRestaurantMenuPayload({
        slug: initialRestaurantSlug,
        name: initialRestaurantName,
      })
    : { restaurant: null, categories: [], error: null };

  return (
    <CartProvider>
      <MenuExperience
        restaurant={sp.restaurant}
        restaurantName={initialRestaurantName}
        table={sp.table}
        token={token}
        preview={typeof sp.adminPreview !== "undefined"}
        initialTableContext={initialTableContextResult.data}
        initialCategories={initialMenuResult.categories}
        initialErrorMessage={initialTableContextResult.error}
        initialMenuLoaded={
          !!initialTableContextResult.data && !initialMenuResult.error
        }
      />
    </CartProvider>
  );
}
