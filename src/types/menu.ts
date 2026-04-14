import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";

export type MenuItemNameTranslations = Partial<
  Record<RestaurantLanguageCode, string>
>;

export type MenuOption = {
  id: string;
  name: string;
  priceDelta: number;
};

export type MenuOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  multiple: boolean;
  options: MenuOption[];
};

export type MenuCustomerNoteOption = {
  id: string;
  label: string;
};

export type MenuCustomerNoteConfig = {
  id: string;
  label: string;
  kind: "single" | "choice";
  options: MenuCustomerNoteOption[];
};

export type MenuProduct = {
  id: string;
  name: string;
  nameTranslations: MenuItemNameTranslations;
  description: string;
  price: number;
  imageUrl: string | null;
  volumeLabel: string | null;
  allergens: string[];
  tags: string[];
  optionGroups: MenuOptionGroup[];
  customerNotes: MenuCustomerNoteConfig[];
};

export type MenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
  products: MenuProduct[];
};

export type TableContext = {
  valid: true;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    currency: string;
    allowPayAtCounter: boolean;
    serviceFeePercent: number;
    theme: unknown | null;
    settings: unknown | null;
    openingHours: unknown | null;
    paymentConfig: unknown | null;
    rewardConfig: unknown | null;
  };
  table: {
    id: string;
    tableNumber: string;
  };
};
