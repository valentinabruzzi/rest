import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";

export type ProductNameTranslations = Partial<
  Record<RestaurantLanguageCode, string>
>;

const SUPPORTED_NAME_LANGUAGES: RestaurantLanguageCode[] = ["it", "en"];

const IT_TO_EN_DICTIONARY: Record<string, string> = {
  acqua: "water",
  naturale: "still",
  frizzante: "sparkling",
  birra: "beer",
  vino: "wine",
  bianco: "white",
  rosso: "red",
  rosata: "rose",
  cocktail: "cocktail",
  aperitivo: "aperitif",
  tagliere: "platter",
  spritz: "spritz",
  caffe: "coffee",
  cappuccino: "cappuccino",
  succo: "juice",
  arancia: "orange",
  limone: "lemon",
  focaccia: "focaccia",
  panino: "sandwich",
  hamburger: "burger",
  burger: "burger",
  pizza: "pizza",
  pasta: "pasta",
  spaghetti: "spaghetti",
  penne: "penne",
  risotto: "risotto",
  insalata: "salad",
  cesare: "caesar",
  pollo: "chicken",
  manzo: "beef",
  vitello: "veal",
  maiale: "pork",
  salmone: "salmon",
  tonno: "tuna",
  gamberi: "shrimp",
  calamari: "squid",
  patate: "potatoes",
  patatine: "fries",
  fritte: "fried",
  fritto: "fried",
  misto: "mixed",
  mozzarella: "mozzarella",
  burrata: "burrata",
  pomodoro: "tomato",
  basilico: "basil",
  parmigiana: "parmigiana",
  tartare: "tartare",
  carpaccio: "carpaccio",
  tiramisu: "tiramisu",
  cheesecake: "cheesecake",
  gelato: "ice cream",
  dolce: "dessert",
  vegetariano: "vegetarian",
  vegano: "vegan",
  classico: "classic",
  speciale: "special",
  gratis: "free",
  condiviso: "shared",
  omaggio: "complimentary",
};

const EN_TO_IT_DICTIONARY: Record<string, string> = Object.fromEntries(
  Object.entries(IT_TO_EN_DICTIONARY).map(([it, en]) => [en, it])
);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...value } as Record<string, unknown>)
    : {};
}

function normalizeTranslationValue(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function preserveCase(source: string, translated: string) {
  if (source.toUpperCase() === source) return translated.toUpperCase();
  if (source[0] && source[0].toUpperCase() === source[0]) {
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }
  return translated;
}

function translateToken(
  token: string,
  dictionary: Record<string, string>
) {
  const normalized = token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const translated = dictionary[normalized];
  if (!translated) return token;
  return preserveCase(token, translated);
}

function translateByDictionary(
  value: string,
  dictionary: Record<string, string>
) {
  const parts = value.split(/(\s+|\/|-|\(|\)|,)/g);
  return parts
    .map((part) =>
      /^[A-Za-zÀ-ÿ]+$/.test(part) ? translateToken(part, dictionary) : part
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProductNameTranslations(
  value: unknown
): ProductNameTranslations {
  const source = asObject(value);
  return SUPPORTED_NAME_LANGUAGES.reduce<ProductNameTranslations>((acc, language) => {
    const next = normalizeTranslationValue(source[language]);
    if (next) acc[language] = next;
    return acc;
  }, {});
}

export function getLocalizedMenuItemName(args: {
  baseName: string;
  translations: unknown;
  language: RestaurantLanguageCode;
}) {
  const normalized = normalizeProductNameTranslations(args.translations);
  return normalized[args.language]?.trim() || args.baseName;
}

export function hasLocalizedMenuItemNames(value: unknown) {
  return Object.keys(normalizeProductNameTranslations(value)).length > 0;
}

export function suggestMenuItemNameTranslation(args: {
  name: string;
  fromLanguage: RestaurantLanguageCode;
  toLanguage: RestaurantLanguageCode;
}) {
  const normalizedName = args.name.trim().replace(/\s+/g, " ");
  if (!normalizedName || args.fromLanguage === args.toLanguage) {
    return normalizedName;
  }

  if (args.fromLanguage === "it" && args.toLanguage === "en") {
    return translateByDictionary(normalizedName, IT_TO_EN_DICTIONARY);
  }

  if (args.fromLanguage === "en" && args.toLanguage === "it") {
    return translateByDictionary(normalizedName, EN_TO_IT_DICTIONARY);
  }

  return normalizedName;
}
