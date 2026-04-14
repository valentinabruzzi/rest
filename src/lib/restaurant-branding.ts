type BrandingObject = Record<string, unknown>;

export type RestaurantFontPreset =
  | "manrope"
  | "system"
  | "serif"
  | "modern"
  | "soft"
  | "editorial"
  | "display"
  | "mono"
  | "grotesk"
  | "humanist"
  | "luxe"
  | "classic";

export type RestaurantLanguageCode = "it" | "en" | "fr" | "es" | "de";
export type RestaurantEditableTextField =
  | "name"
  | "welcomeLabel"
  | "welcomeDescription"
  | "menuLabel"
  | "staffTitle"
  | "staffSubtitle";

export type RestaurantBranding = {
  fontPreset: RestaurantFontPreset;
  welcomeLabel: string;
  welcomeDescription: string;
  menuLabel: string;
  staffTitle: string;
  staffSubtitle: string;
  headingTextColor: string;
  bodyTextColor: string;
  textColorOverrides: Partial<Record<RestaurantEditableTextField, string>>;
  dynamicTexts: Record<string, string>;
};

export type RestaurantInterfaceSettings = {
  defaultLanguage: RestaurantLanguageCode;
  enabledLanguages: RestaurantLanguageCode[];
  allowOnlinePayment: boolean;
};

export const RESTAURANT_FONT_OPTIONS: Array<{
  value: RestaurantFontPreset;
  label: string;
}> = [
  { value: "manrope", label: "Manrope" },
  { value: "system", label: "System" },
  { value: "serif", label: "Serif classic" },
  { value: "modern", label: "Modern sans" },
  { value: "soft", label: "Soft rounded" },
  { value: "editorial", label: "Editorial serif" },
  { value: "display", label: "Display" },
  { value: "mono", label: "Mono" },
  { value: "grotesk", label: "Grotesk" },
  { value: "humanist", label: "Humanist" },
  { value: "luxe", label: "Luxe serif" },
  { value: "classic", label: "Classic roman" },
];

export const RESTAURANT_LANGUAGE_OPTIONS: Array<{
  value: RestaurantLanguageCode;
  label: string;
}> = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
];

const DEFAULT_BRANDING: RestaurantBranding = {
  fontPreset: "manrope",
  welcomeLabel: "Welcome",
  welcomeDescription:
    "Browse the menu, order from your seat, and pay when you are ready. Your order is sent directly to the bar with your table number.",
  menuLabel: "Menu",
  staffTitle: "Staff dashboard",
  staffSubtitle: "Operations and analytics",
  headingTextColor: "#1C1C1C",
  bodyTextColor: "#5C5A57",
  textColorOverrides: {},
  dynamicTexts: {},
};

const DEFAULT_INTERFACE_SETTINGS: RestaurantInterfaceSettings = {
  defaultLanguage: "it",
  enabledLanguages: ["it", "en"],
  allowOnlinePayment: true,
};

function asObject(value: unknown): BrandingObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...value } as BrandingObject)
    : {};
}

function readString(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  return next.length > 0 ? next : fallback;
}

function readFontPreset(value: unknown): RestaurantFontPreset {
  if (
    value === "serif" ||
    value === "system" ||
    value === "manrope" ||
    value === "modern" ||
    value === "soft" ||
    value === "editorial" ||
    value === "display" ||
    value === "mono" ||
    value === "grotesk" ||
    value === "humanist" ||
    value === "luxe" ||
    value === "classic"
  ) {
    return value;
  }
  return DEFAULT_BRANDING.fontPreset;
}

function readLanguageCode(value: unknown): RestaurantLanguageCode {
  if (
    value === "it" ||
    value === "en" ||
    value === "fr" ||
    value === "es" ||
    value === "de"
  ) {
    return value;
  }
  return DEFAULT_INTERFACE_SETTINGS.defaultLanguage;
}

function readTextColorOverrides(
  value: unknown
): Partial<Record<RestaurantEditableTextField, string>> {
  const source = asObject(value);
  const fields: RestaurantEditableTextField[] = [
    "name",
    "welcomeLabel",
    "welcomeDescription",
    "menuLabel",
    "staffTitle",
    "staffSubtitle",
  ];

  return fields.reduce<Partial<Record<RestaurantEditableTextField, string>>>(
    (acc, field) => {
      const next = readString(source[field], "");
      if (next) {
        acc[field] = next;
      }
      return acc;
    },
    {}
  );
}

export function getRestaurantBranding(
  theme: unknown,
  settings: unknown
): RestaurantBranding {
  const themeObject = asObject(theme);
  const settingsObject = asObject(settings);
  const uiTexts = asObject(settingsObject.uiTexts);
  const uiStyle = asObject(settingsObject.uiStyle);
  const dynamicTexts = asObject(uiTexts.dynamicTexts);

  return {
    fontPreset: readFontPreset(themeObject.fontPreset),
    welcomeLabel: readString(uiTexts.welcomeLabel, DEFAULT_BRANDING.welcomeLabel),
    welcomeDescription: readString(
      uiTexts.welcomeDescription,
      DEFAULT_BRANDING.welcomeDescription
    ),
    menuLabel: readString(uiTexts.menuLabel, DEFAULT_BRANDING.menuLabel),
    staffTitle: readString(uiTexts.staffTitle, DEFAULT_BRANDING.staffTitle),
    staffSubtitle: readString(uiTexts.staffSubtitle, DEFAULT_BRANDING.staffSubtitle),
    headingTextColor: readString(
      uiStyle.headingTextColor,
      DEFAULT_BRANDING.headingTextColor
    ),
    bodyTextColor: readString(
      uiStyle.bodyTextColor,
      DEFAULT_BRANDING.bodyTextColor
    ),
    textColorOverrides: readTextColorOverrides(uiStyle.textColorOverrides),
    dynamicTexts: Object.fromEntries(
      Object.entries(dynamicTexts).map(([key, value]) => [
        key,
        readString(value, ""),
      ])
    ),
  };
}

export function getRestaurantInterfaceSettings(
  settings: unknown
): RestaurantInterfaceSettings {
  const settingsObject = asObject(settings);
  const ui = asObject(settingsObject.interface);
  const enabledLanguages = Array.isArray(ui.enabledLanguages)
    ? ui.enabledLanguages
        .map((value) => readLanguageCode(value))
        .filter((value, index, list) => list.indexOf(value) === index)
    : DEFAULT_INTERFACE_SETTINGS.enabledLanguages;

  const safeEnabledLanguages =
    enabledLanguages.length > 0
      ? enabledLanguages
      : DEFAULT_INTERFACE_SETTINGS.enabledLanguages;

  const defaultLanguage = readLanguageCode(ui.defaultLanguage);

  return {
    defaultLanguage: safeEnabledLanguages.includes(defaultLanguage)
      ? defaultLanguage
      : safeEnabledLanguages[0],
    enabledLanguages: safeEnabledLanguages,
    allowOnlinePayment:
      typeof ui.allowOnlinePayment === "boolean"
        ? ui.allowOnlinePayment
        : DEFAULT_INTERFACE_SETTINGS.allowOnlinePayment,
  };
}

export function mergeRestaurantBranding(args: {
  theme: unknown;
  settings: unknown;
  updates: RestaurantBranding;
}) {
  const nextTheme = asObject(args.theme);
  const nextSettings = asObject(args.settings);
  const nextUiTexts = asObject(nextSettings.uiTexts);

  nextTheme.fontPreset = args.updates.fontPreset;
  nextUiTexts.welcomeLabel = args.updates.welcomeLabel.trim();
  nextUiTexts.welcomeDescription = args.updates.welcomeDescription.trim();
  nextUiTexts.menuLabel = args.updates.menuLabel.trim();
  nextUiTexts.staffTitle = args.updates.staffTitle.trim();
  nextUiTexts.staffSubtitle = args.updates.staffSubtitle.trim();
  nextUiTexts.dynamicTexts = args.updates.dynamicTexts;
  nextSettings.uiTexts = nextUiTexts;
  nextSettings.uiStyle = {
    ...asObject(nextSettings.uiStyle),
    headingTextColor: args.updates.headingTextColor.trim(),
    bodyTextColor: args.updates.bodyTextColor.trim(),
    textColorOverrides: args.updates.textColorOverrides,
  };

  return {
    theme: nextTheme,
    settings: nextSettings,
  };
}

export function mergeRestaurantInterfaceSettings(args: {
  settings: unknown;
  updates: RestaurantInterfaceSettings;
}) {
  const nextSettings = asObject(args.settings);
  nextSettings.interface = {
    defaultLanguage: args.updates.defaultLanguage,
    enabledLanguages: args.updates.enabledLanguages,
    allowOnlinePayment: args.updates.allowOnlinePayment,
  };
  return nextSettings;
}

export function getRestaurantFontFamily(fontPreset: RestaurantFontPreset) {
  switch (fontPreset) {
    case "modern":
      return '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif';
    case "soft":
      return '"Trebuchet MS", "Gill Sans", "Segoe UI", sans-serif';
    case "editorial":
      return '"Baskerville", "Times New Roman", "Georgia", serif';
    case "display":
      return '"Optima", "Gill Sans", "Segoe UI", sans-serif';
    case "mono":
      return '"SFMono-Regular", "Menlo", "Monaco", "Courier New", monospace';
    case "grotesk":
      return '"Helvetica Neue", Helvetica, Arial, sans-serif';
    case "humanist":
      return '"Gill Sans", "Segoe UI", "Trebuchet MS", sans-serif';
    case "luxe":
      return '"Didot", "Bodoni 72", "Times New Roman", serif';
    case "classic":
      return '"Garamond", "Baskerville", "Times New Roman", serif';
    case "serif":
      return 'Iowan Old Style, "Palatino Linotype", "Book Antiqua", Georgia, serif';
    case "system":
      return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    case "manrope":
    default:
      return "var(--font-manrope), system-ui, sans-serif";
  }
}
