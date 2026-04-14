import { CartProvider } from "@/context/cart-context";
import { MenuExperience } from "@/components/menu/menu-experience";
import {
  getRestaurantMenuPayload,
  getTableContextData,
} from "@/lib/public-menu-data";

export default async function RestaurantMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{
    name?: string;
    table?: string;
    token?: string;
    t?: string;
    adminPreview?: string;
  }>;
}) {
  const { restaurantSlug } = await params;
  const sp = await searchParams;
  const token = sp.token ?? sp.t;
  const initialTableContextResult = await getTableContextData({
    token,
    restaurantSlug,
    restaurantName: sp.name,
    tableNumber: sp.table,
  });
  const initialMenuResult = await getRestaurantMenuPayload({
    slug: restaurantSlug,
    name: sp.name,
  });

  return (
    <CartProvider>
      <MenuExperience
        restaurant={restaurantSlug}
        restaurantName={initialTableContextResult.data?.restaurant.name ?? sp.name}
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
