"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryTabs } from "@/components/menu/category-tabs";
import { StaffInfoBadge } from "@/components/staff/staff-info-badge";
import {
  getLocalizedMenuItemName,
  hasLocalizedMenuItemNames,
  normalizeProductNameTranslations,
  suggestMenuItemNameTranslation,
} from "@/lib/menu-item-name";
import { fetchJsonWithRetry } from "@/lib/runtime-resilience";
import type { MenuCategory, MenuCustomerNoteConfig } from "@/types/menu";
import type { DishRadarMenuEditorIngredientRow } from "@/types/staff-availability";
import type {
  StaffMenuCategoryRow,
  StaffMenuItemRow,
} from "@/lib/staff-view-data";

const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";
type StaffUiLanguage = "it" | "en";

type MenuCategoryRow = StaffMenuCategoryRow;
type MenuItemRow = StaffMenuItemRow;

type MenuEditorState = {
  mode: "create" | "edit";
  itemId: string | null;
  name: string;
  translatableName: boolean;
  italianName: string;
  englishName: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  active: boolean;
  customerNotes: MenuCustomerNoteConfig[];
  ingredients: DishRadarMenuEditorIngredientRow[];
};

const MENU_PANEL_COPY = {
  it: {
    invalidPrice: "Inserisci un prezzo valido, per esempio 9,50",
    noteOptionRequired: (label: string) =>
      `Aggiungi almeno un'opzione per “${label}”.`,
    loadMenu: "Impossibile caricare il menu.",
    loadEditor: "Impossibile caricare l'editor menu.",
    saveItem: "Impossibile salvare il prodotto.",
    itemAdded: "Nuovo prodotto aggiunto.",
    itemUpdated: "Prodotto aggiornato.",
    updateAvailability: "Impossibile aggiornare la disponibilita.",
    markedUnavailable: "Prodotto segnato come non disponibile.",
    markedAvailable: "Prodotto segnato come disponibile.",
    confirmDeleteItem: "Vuoi davvero rimuovere questo prodotto?",
    removeItemFallback:
      "Impossibile rimuovere questo prodotto. Segnalo come non disponibile invece.",
    itemRemoved: "Prodotto rimosso dal menu.",
    removeItem: "Impossibile rimuovere il prodotto.",
    selectImage: "Seleziona un file immagine.",
    readImage: "Impossibile leggere l'immagine.",
    addCategory: "Impossibile aggiungere la categoria.",
    categoryAdded: "Categoria aggiunta.",
    renameCategory: "Impossibile rinominare la categoria.",
    categoryRenamed: "Categoria rinominata.",
    deleteCategory: "Impossibile eliminare la categoria.",
    confirmDeleteCategoryWithItems: (name: string, linkedItems: number) =>
      `Eliminare la categoria “${name}”? ${linkedItems} prodott${linkedItems === 1 ? "o restera" : "i resteranno"} senza categoria.`,
    confirmDeleteCategory: (name: string) => `Eliminare la categoria “${name}”?`,
    categoryDeletedWithItems:
      "Categoria eliminata. I prodotti collegati ora sono senza categoria.",
    categoryDeleted: "Categoria eliminata.",
    loading: "Caricamento menu editor…",
    menu: "Menu",
    menuInfo:
      "Aggiorna prodotti, prezzi, categorie e note cliente specifiche del prodotto",
    menuEditorFor: "Menu editor per",
    menuEditorInfo:
      "Aggiorna prodotti, prezzi, categorie e note cliente specifiche senza cambiare il layout cliente.",
    addNewItem: "Aggiungi prodotto",
    totalItems: "Prodotti totali",
    available: "Disponibili",
    unavailable: "Non disponibili",
    categories: "Categorie",
    categoriesTitle: "Categorie",
    categoriesHelp: "Scegli una categoria per filtrare i prodotti sotto.",
    allProducts: "Tutti i prodotti",
    uncategorized: "Senza categoria",
    newCategory: "Nuova categoria",
    adding: "Aggiunta…",
    save: "Salva",
    cancel: "Annulla",
    addCategoryButton: "Aggiungi categoria",
    saving: "Salvataggio…",
    rename: "Rinomina",
    deleting: "Eliminazione…",
    delete: "Elimina",
    searchItemName: "Cerca nome prodotto",
    sortMenuOrder: "Ordina: ordine menu",
    sortName: "Ordina: nome",
    sortLowestPrice: "Ordina: prezzo crescente",
    sortHighestPrice: "Ordina: prezzo decrescente",
    noItemsMatch: "Nessun prodotto corrisponde a questo filtro.",
    noPhoto: "Nessuna foto",
    note: "nota",
    notes: "note",
    noDescription: "Nessuna descrizione.",
    categoryInactive: "Categoria attualmente inattiva",
    waitingCategory: "In attesa di categoria",
    edit: "Modifica",
    markUnavailable: "Segna non disponibile",
    markAvailable: "Segna disponibile",
    removing: "Rimozione…",
    newItem: "Nuovo prodotto",
    editItem: "Modifica prodotto",
    addNewMenuItem: "Aggiungi un nuovo prodotto",
    updateMenuItem: "Aggiorna prodotto",
    close: "Chiudi",
    name: "Nome",
    translatableName: "Nome traducibile",
    translatableNameHelp:
      "Se disattivato, il nome resta uguale in tutte le lingue. Se attivato, puoi salvare una versione italiana e una inglese.",
    italianName: "Nome italiano",
    englishName: "Nome inglese",
    useSuggestedTranslation: "Usa traduzione suggerita",
    nameTranslationInfo:
      "La traduzione viene proposta automaticamente e poi puo essere corretta dal locale.",
    category: "Categoria",
    noCategoryForNow: "Nessuna categoria per ora",
    description: "Descrizione",
    price: "Prezzo",
    imageUrl: "URL immagine",
    imageUrlPlaceholder: "https://... oppure lascia vuoto",
    uploadPhoto: "Carica foto",
    availableInCustomerMenu: "Disponibile nel menu cliente",
    preview: "Anteprima",
    itemName: "Nome prodotto",
    descriptionPreview: "Anteprima descrizione",
    itemNotes: "Note",
    itemNotesHelp:
      "Scegli quali note il cliente puo vedere solo per questo prodotto.",
    addSingleNote: "+ Nota singola",
    addNoteWithOptions: "+ Nota con opzioni",
    noCustomerNotes: "Nessuna nota cliente per questo prodotto.",
    noteLabel: "Etichetta nota",
    singleNote: "Nota singola",
    noteWithOptions: "Nota con opzioni",
    options: "Opzioni",
    addOption: "+ Aggiungi opzione",
    optionLabel: "Etichetta opzione",
    remove: "Rimuovi",
    addItem: "Aggiungi prodotto",
    saveChanges: "Salva modifiche",
    availableBadge: "Disponibile",
    unavailableBadge: "Non disponibile",
    filterCategoryHelp: "Barra categorie come nel menu cliente",
    ingredients: "Ingredienti",
    ingredientsHelp: "Nome e grammi per porzione.",
    noIngredients: "Nessun ingrediente configurato.",
    ingredientName: "Ingrediente",
    gramsPerPortion: "g / porzione",
    addIngredient: "Aggiungi ingrediente",
    ingredientsRequired: "Aggiungi almeno un ingrediente con grammi per porzione.",
    ingredientRowIncomplete:
      "Completa ogni ingrediente con nome e grammi per porzione maggiori di zero.",
  },
  en: {
    invalidPrice: "Enter a valid price, for example 9.50",
    noteOptionRequired: (label: string) => `Add at least one option for “${label}”.`,
    loadMenu: "Could not load the menu.",
    loadEditor: "Could not load the menu editor.",
    saveItem: "Could not save item.",
    itemAdded: "New menu item added.",
    itemUpdated: "Menu item updated.",
    updateAvailability: "Could not update availability.",
    markedUnavailable: "Item marked unavailable.",
    markedAvailable: "Item marked available.",
    confirmDeleteItem: "Are you sure you want to remove this item?",
    removeItemFallback:
      "Could not remove this item. Mark it unavailable instead.",
    itemRemoved: "Item removed from the menu.",
    removeItem: "Could not remove this item.",
    selectImage: "Select an image file.",
    readImage: "Could not read image.",
    addCategory: "Could not add category.",
    categoryAdded: "Category added.",
    renameCategory: "Could not rename category.",
    categoryRenamed: "Category renamed.",
    deleteCategory: "Could not delete category.",
    confirmDeleteCategoryWithItems: (name: string, linkedItems: number) =>
      `Delete category “${name}”? ${linkedItems} item${linkedItems === 1 ? "" : "s"} will stay without category.`,
    confirmDeleteCategory: (name: string) => `Delete category “${name}”?`,
    categoryDeletedWithItems:
      "Category deleted. Linked items are now without category.",
    categoryDeleted: "Category deleted.",
    loading: "Loading menu editor…",
    menu: "Menu",
    menuInfo:
      "Update products, price, categories and product specific customer notes",
    menuEditorFor: "Menu editor for",
    menuEditorInfo:
      "Update products, prices, categories, and item-specific customer notes without changing the customer layout.",
    addNewItem: "Add new item",
    totalItems: "Total items",
    available: "Available",
    unavailable: "Unavailable",
    categories: "Categories",
    categoriesTitle: "Categories",
    categoriesHelp: "Pick one category to filter the items below.",
    allProducts: "All products",
    uncategorized: "No category yet",
    newCategory: "New category",
    adding: "Adding…",
    save: "Save",
    cancel: "Cancel",
    addCategoryButton: "Add category",
    saving: "Saving…",
    rename: "Rename",
    deleting: "Deleting…",
    delete: "Delete",
    searchItemName: "Search item name",
    sortMenuOrder: "Sort: menu order",
    sortName: "Sort: name",
    sortLowestPrice: "Sort: lowest price",
    sortHighestPrice: "Sort: highest price",
    noItemsMatch: "No menu items match this filter.",
    noPhoto: "No photo",
    note: "note",
    notes: "notes",
    noDescription: "No description yet.",
    categoryInactive: "Category currently inactive",
    waitingCategory: "Waiting for category assignment",
    edit: "Edit",
    markUnavailable: "Mark unavailable",
    markAvailable: "Mark available",
    removing: "Removing…",
    newItem: "New item",
    editItem: "Edit item",
    addNewMenuItem: "Add a new menu item",
    updateMenuItem: "Update menu item",
    close: "Close",
    name: "Name",
    translatableName: "Translatable name",
    translatableNameHelp:
      "If disabled, the item name stays the same in every language. If enabled, you can save an Italian and an English version.",
    italianName: "Italian name",
    englishName: "English name",
    useSuggestedTranslation: "Use suggested translation",
    nameTranslationInfo:
      "A suggested translation is filled in automatically and can then be adjusted by the venue.",
    category: "Category",
    noCategoryForNow: "No category for now",
    description: "Description",
    price: "Price",
    imageUrl: "Image URL",
    imageUrlPlaceholder: "https://... or leave empty",
    uploadPhoto: "Upload photo",
    availableInCustomerMenu: "Available in the customer menu",
    preview: "Preview",
    itemName: "Item name",
    descriptionPreview: "Description preview",
    itemNotes: "Notes",
    itemNotesHelp: "Choose which notes the customer can see only for this item.",
    addSingleNote: "+ Single note",
    addNoteWithOptions: "+ Note with options",
    noCustomerNotes: "No customer notes yet for this item.",
    noteLabel: "Note label",
    singleNote: "Single note",
    noteWithOptions: "Note with options",
    options: "Options",
    addOption: "+ Add option",
    optionLabel: "Option label",
    remove: "Remove",
    addItem: "Add item",
    saveChanges: "Save changes",
    availableBadge: "Available",
    unavailableBadge: "Unavailable",
    filterCategoryHelp: "Category bar aligned with the customer menu",
    ingredients: "Ingredients",
    ingredientsHelp: "Name and grams per portion.",
    noIngredients: "No ingredients configured.",
    ingredientName: "Ingredient",
    gramsPerPortion: "g / portion",
    addIngredient: "Add ingredient",
    ingredientsRequired: "Add at least one ingredient with grams per portion.",
    ingredientRowIncomplete:
      "Complete each ingredient with a name and grams per portion greater than zero.",
  },
} as const;

function buildTempId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
}

function createEmptyEditor(categoryId: string | null): MenuEditorState {
  return {
    mode: "create",
    itemId: null,
    name: "",
    translatableName: false,
    italianName: "",
    englishName: "",
    description: "",
    price: "",
    categoryId: categoryId ?? "",
    imageUrl: "",
    active: true,
    customerNotes: [],
    ingredients: [],
  };
}

function priceInputFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function parsePriceToCents(value: string, invalidPriceMessage: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(invalidPriceMessage);
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(invalidPriceMessage);
  }

  return Math.round(amount * 100);
}

function sanitizeIngredientRows(
  rows: DishRadarMenuEditorIngredientRow[],
  messages: {
    required: string;
    invalidRow: string;
  }
) {
  const normalized = rows
    .map((row) => ({
      ingredientId: row.ingredientId,
      name: row.name.trim().replace(/\s+/g, " "),
      quantity: Math.round(Number(row.quantity || 0) * 100) / 100,
    }))
    .filter((row) => row.name.length > 0 || row.quantity > 0);

  if (normalized.length === 0) {
    throw new Error(messages.required);
  }

  for (const row of normalized) {
    if (row.name.length < 2 || row.quantity <= 0) {
      throw new Error(messages.invalidRow);
    }
  }

  return normalized;
}

function buildEditorFromItem(item: MenuItemRow): MenuEditorState {
  const translations = normalizeProductNameTranslations(item.nameTranslations);
  const translatableName = hasLocalizedMenuItemNames(item.nameTranslations);
  return {
    mode: "edit",
    itemId: item.id,
    name: item.name,
    translatableName,
    italianName: translations.it ?? item.name,
    englishName: translations.en ?? item.name,
    description: item.description,
    price: priceInputFromCents(item.price),
    categoryId: item.categoryId ?? "",
    imageUrl: item.imageUrl ?? "",
    active: item.active,
    customerNotes: item.customerNotes,
    ingredients: item.ingredients,
  };
}

function sanitizeCustomerNotesConfig(
  customerNotes: MenuCustomerNoteConfig[],
  missingOptionMessage: (label: string) => string
): MenuCustomerNoteConfig[] {
  return customerNotes
    .map((noteConfig) => {
      const label = noteConfig.label.trim().replace(/\s+/g, " ");
      if (label.length < 2) return null;

      const options = noteConfig.options
        .map((option) => {
          const optionLabel = option.label.trim().replace(/\s+/g, " ");
          if (optionLabel.length < 2) return null;
          return {
            id: option.id,
            label: optionLabel,
          };
        })
        .filter(
          (
            option
          ): option is {
            id: string;
            label: string;
          } => option != null
        );

      if (noteConfig.kind === "choice" && options.length === 0) {
        throw new Error(missingOptionMessage(label));
      }

      return {
        id: noteConfig.id,
        label,
        kind: noteConfig.kind,
        options: noteConfig.kind === "choice" ? options : [],
      } satisfies MenuCustomerNoteConfig;
    })
    .filter((noteConfig): noteConfig is MenuCustomerNoteConfig => noteConfig != null);
}

function buildNameTranslationSuggestion(args: {
  name: string;
  language: StaffUiLanguage;
}) {
  const sourceName = args.name.trim();
  if (!sourceName) {
    return {
      italianName: "",
      englishName: "",
    };
  }

  if (args.language === "en") {
    return {
      englishName: sourceName,
      italianName: suggestMenuItemNameTranslation({
        name: sourceName,
        fromLanguage: "en",
        toLanguage: "it",
      }),
    };
  }

  return {
    italianName: sourceName,
    englishName: suggestMenuItemNameTranslation({
      name: sourceName,
      fromLanguage: "it",
      toLanguage: "en",
    }),
  };
}

function buildEditorNamePayload(editor: MenuEditorState, language: StaffUiLanguage) {
  if (!editor.translatableName) {
    return {
      name: editor.name.trim(),
      nameTranslations: null,
    };
  }

  const italianName = editor.italianName.trim();
  const englishName = editor.englishName.trim();
  const fallbackName =
    language === "en"
      ? englishName || italianName || editor.name.trim()
      : italianName || englishName || editor.name.trim();

  return {
    name: fallbackName,
    nameTranslations: {
      ...(italianName ? { it: italianName } : {}),
      ...(englishName ? { en: englishName } : {}),
    },
  };
}

export function StaffMenuPanel({
  restaurantName,
  language,
  initialCategories = [],
  initialItems = [],
  initialDataLoaded = false,
}: {
  restaurantName: string;
  language: StaffUiLanguage;
  initialCategories?: MenuCategoryRow[];
  initialItems?: MenuItemRow[];
  initialDataLoaded?: boolean;
}) {
  const router = useRouter();
  const copy = MENU_PANEL_COPY[language];
  const locale = language === "en" ? "en-US" : "it-IT";
  const [categories, setCategories] = useState<MenuCategoryRow[]>(initialCategories);
  const [items, setItems] = useState<MenuItemRow[]>(initialItems);
  const [loading, setLoading] = useState(!initialDataLoaded);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<
    "default" | "name_asc" | "price_asc" | "price_desc"
  >("default");
  const [editor, setEditor] = useState<MenuEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(
    null
  );
  const [categoryRenameValue, setCategoryRenameValue] = useState("");
  const [categoryBusyId, setCategoryBusyId] = useState<string | null>(null);
  const getDisplayItemName = useCallback(
    (item: Pick<MenuItemRow, "name" | "nameTranslations">) =>
      getLocalizedMenuItemName({
        baseName: item.name,
        translations: item.nameTranslations,
        language,
      }),
    [language]
  );
  const formatPrice = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      }).format(cents / 100),
    [locale]
  );

  const resetFeedback = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    try {
      const result = await fetchJsonWithRetry<{
        categories?: StaffMenuCategoryRow[];
        items?: StaffMenuItemRow[];
        error?: string;
      }>("/api/staff/menu", undefined, { attempts: 3 });
      if (result.status === 401) {
        router.push("/staff/login");
        return;
      }

      if (!result.ok) {
        throw new Error(result.errorMessage ?? result.data?.error ?? copy.loadMenu);
      }

      setCategories(result.data?.categories ?? []);
      setItems(result.data?.items ?? []);
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      setError(copy.loadEditor);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [copy.loadEditor, copy.loadMenu, router]);

  useEffect(() => {
    if (initialDataLoaded) {
      setLoading(false);
      return;
    }
    void load();
  }, [initialDataLoaded, load]);

  const itemCountsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = item.categoryId ?? UNCATEGORIZED_CATEGORY_ID;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const uncategorizedCount = itemCountsByCategory.get(UNCATEGORIZED_CATEGORY_ID) ?? 0;
  const selectedCategory =
    categoryFilter === "all" || categoryFilter === UNCATEGORIZED_CATEGORY_ID
      ? null
      : categories.find((category) => category.id === categoryFilter) ?? null;
  const editorPreviewName = useMemo(() => {
    if (!editor) return "";
    if (!editor.translatableName) return editor.name.trim();
    return language === "en"
      ? editor.englishName.trim() || editor.italianName.trim() || editor.name.trim()
      : editor.italianName.trim() || editor.englishName.trim() || editor.name.trim();
  }, [editor, language]);
  const customerFacingCategories = useMemo<MenuCategory[]>(
    () =>
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        products: [],
      })),
    [categories]
  );
  const sortLocale = language === "en" ? "en" : "it";

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const next = items.filter((item) => {
      const displayName = getDisplayItemName(item);
      const categoryLabel = item.isUncategorized ? copy.uncategorized : item.categoryName;
      const matchesCategory =
        categoryFilter === "all"
          ? true
          : categoryFilter === UNCATEGORIZED_CATEGORY_ID
            ? item.categoryId == null
            : item.categoryId === categoryFilter;
      const matchesSearch =
        q.length === 0
          ? true
          : displayName.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            categoryLabel.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });

    return next.sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return getDisplayItemName(a).localeCompare(getDisplayItemName(b), sortLocale);
        case "price_asc":
          return a.price - b.price;
        case "price_desc":
          return b.price - a.price;
        default:
          return (
            a.categorySortOrder - b.categorySortOrder ||
            a.sortOrder - b.sortOrder ||
            getDisplayItemName(a).localeCompare(getDisplayItemName(b), sortLocale)
          );
      }
    });
  }, [categoryFilter, copy.uncategorized, getDisplayItemName, items, search, sortBy, sortLocale]);

  async function submitEditor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;

    setSaving(true);
    resetFeedback();

    try {
      const namePayload = buildEditorNamePayload(editor, language);
      const ingredients = sanitizeIngredientRows(editor.ingredients, {
        required: copy.ingredientsRequired,
        invalidRow: copy.ingredientRowIncomplete,
      });
      const payload = {
        name: namePayload.name,
        nameTranslations: namePayload.nameTranslations,
        description: editor.description.trim(),
        price: parsePriceToCents(editor.price, copy.invalidPrice),
        categoryId: editor.categoryId || null,
        imageUrl: editor.imageUrl.trim() || null,
        active: editor.active,
        customerNotesConfig: sanitizeCustomerNotesConfig(
          editor.customerNotes,
          copy.noteOptionRequired
        ),
        ingredients: ingredients.map((ingredient) => ({
          ingredientId: ingredient.ingredientId,
          name: ingredient.name,
          quantity: ingredient.quantity,
        })),
      };

      const res = await fetch(
        editor.mode === "create" ? "/api/staff/menu" : `/api/staff/menu/${editor.itemId}`,
        {
          method: editor.mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? copy.saveItem);
      }

      setMessage(editor.mode === "create" ? copy.itemAdded : copy.itemUpdated);
      setEditor(null);
      await load();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : copy.saveItem);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(item: MenuItemRow) {
    setTogglingId(item.id);
    resetFeedback();

    try {
      const res = await fetch(`/api/staff/menu/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? copy.updateAvailability);
      }

      setMessage(item.active ? copy.markedUnavailable : copy.markedAvailable);
      await load();
    } catch (toggleError) {
      console.error(toggleError);
      setError(
        toggleError instanceof Error ? toggleError.message : copy.updateAvailability
      );
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteItem(item: MenuItemRow) {
    const confirmed = window.confirm(copy.confirmDeleteItem);
    if (!confirmed) return;

    setDeletingId(item.id);
    resetFeedback();

    try {
      const res = await fetch(`/api/staff/menu/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? copy.removeItemFallback);
      }

      setMessage(copy.itemRemoved);
      await load();
    } catch (deleteError) {
      console.error(deleteError);
      setError(deleteError instanceof Error ? deleteError.message : copy.removeItem);
    } finally {
      setDeletingId(null);
    }
  }

  async function onSelectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(copy.selectImage);
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error(copy.readImage));
      };
      reader.onerror = () => reject(new Error(copy.readImage));
      reader.readAsDataURL(file);
    });

    setEditor((current) =>
      current
        ? {
            ...current,
            imageUrl: dataUrl,
          }
        : current
    );
  }

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;

    setCategorySaving(true);
    resetFeedback();

    try {
      const res = await fetch("/api/staff/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? copy.addCategory);
      }

      setAddingCategory(false);
      setNewCategoryName("");
      setMessage(copy.categoryAdded);
      await load();
    } catch (categoryError) {
      console.error(categoryError);
      setError(categoryError instanceof Error ? categoryError.message : copy.addCategory);
    } finally {
      setCategorySaving(false);
    }
  }

  async function renameCategory(categoryId: string) {
    const name = categoryRenameValue.trim();
    if (!name) return;

    setCategoryBusyId(categoryId);
    resetFeedback();

    try {
      const res = await fetch(`/api/staff/menu/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? copy.renameCategory);
      }

      setRenamingCategoryId(null);
      setCategoryRenameValue("");
      setMessage(copy.categoryRenamed);
      await load();
    } catch (categoryError) {
      console.error(categoryError);
      setError(
        categoryError instanceof Error ? categoryError.message : copy.renameCategory
      );
    } finally {
      setCategoryBusyId(null);
    }
  }

  async function deleteCategory(category: MenuCategoryRow) {
    const linkedItems = itemCountsByCategory.get(category.id) ?? 0;
    const confirmed = window.confirm(
      linkedItems > 0
        ? copy.confirmDeleteCategoryWithItems(category.name, linkedItems)
        : copy.confirmDeleteCategory(category.name)
    );
    if (!confirmed) return;

    setCategoryBusyId(category.id);
    resetFeedback();

    try {
      const res = await fetch(`/api/staff/menu/categories/${category.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? copy.deleteCategory);
      }

      if (categoryFilter === category.id) {
        setCategoryFilter(UNCATEGORIZED_CATEGORY_ID);
      }

      setMessage(
        data.uncategorizedItems
          ? copy.categoryDeletedWithItems
          : copy.categoryDeleted
      );
      await load();
    } catch (categoryError) {
      console.error(categoryError);
      setError(categoryError instanceof Error ? categoryError.message : copy.deleteCategory);
    } finally {
      setCategoryBusyId(null);
    }
  }

  function updateEditor(
    updater: (current: MenuEditorState) => MenuEditorState
  ) {
    setEditor((current) => (current ? updater(current) : current));
  }

  function addCustomerNote(kind: "single" | "choice") {
    updateEditor((current) => ({
      ...current,
      customerNotes: [
        ...current.customerNotes,
        {
          id: buildTempId("note"),
          label: "",
          kind,
          options:
            kind === "choice"
              ? [
                  {
                    id: buildTempId("option"),
                    label: "",
                  },
                ]
              : [],
        },
      ],
    }));
  }

  function updateCustomerNote(
    noteId: string,
    updater: (noteConfig: MenuCustomerNoteConfig) => MenuCustomerNoteConfig
  ) {
    updateEditor((current) => ({
      ...current,
      customerNotes: current.customerNotes.map((noteConfig) =>
        noteConfig.id === noteId ? updater(noteConfig) : noteConfig
      ),
    }));
  }

  function deleteCustomerNote(noteId: string) {
    updateEditor((current) => ({
      ...current,
      customerNotes: current.customerNotes.filter(
        (noteConfig) => noteConfig.id !== noteId
      ),
    }));
  }

  function addCustomerNoteOption(noteId: string) {
    updateCustomerNote(noteId, (noteConfig) => ({
      ...noteConfig,
      options: [
        ...noteConfig.options,
        {
          id: buildTempId("option"),
          label: "",
        },
      ],
    }));
  }

  function updateCustomerNoteOption(
    noteId: string,
    optionId: string,
    label: string
  ) {
    updateCustomerNote(noteId, (noteConfig) => ({
      ...noteConfig,
      options: noteConfig.options.map((option) =>
        option.id === optionId ? { ...option, label } : option
      ),
    }));
  }

  function deleteCustomerNoteOption(noteId: string, optionId: string) {
    updateCustomerNote(noteId, (noteConfig) => ({
      ...noteConfig,
      options: noteConfig.options.filter((option) => option.id !== optionId),
    }));
  }

  function addIngredientRow() {
    updateEditor((current) => ({
      ...current,
      ingredients: [
        ...current.ingredients,
        {
          ingredientId: null,
          name: "",
          quantity: 0,
        },
      ],
    }));
  }

  function updateIngredientRow(
    rowIndex: number,
    updater: (
      row: DishRadarMenuEditorIngredientRow
    ) => DishRadarMenuEditorIngredientRow
  ) {
    updateEditor((current) => ({
      ...current,
      ingredients: current.ingredients.map((row, index) =>
        index === rowIndex ? updater(row) : row
      ),
    }));
  }

  function removeIngredientRow(rowIndex: number) {
    updateEditor((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, index) => index !== rowIndex),
    }));
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
        <p className="text-sm text-muted">{copy.loading}</p>
      </section>
    );
  }

  return (
    <>
      <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {copy.menu} · {restaurantName}
            </h2>
          </div>

          <button
            type="button"
            onClick={() =>
              setEditor(
                createEmptyEditor(
                  categoryFilter === "all"
                    ? categories[0]?.id ?? null
                    : categoryFilter === UNCATEGORIZED_CATEGORY_ID
                      ? null
                      : categoryFilter
                )
              )
            }
            className="rounded-full bg-bordeaux px-4 py-2 text-sm font-medium text-white hover:bg-bordeaux-dark"
          >
            {copy.addNewItem}
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-bordeaux/20 bg-white px-4 py-3 text-sm text-bordeaux">
            {error}
          </p>
        ) : null}

        <div className="mt-5 rounded-xl border border-hairline bg-canvas px-3 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="min-w-0 xl:w-[12rem]">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                {copy.categoriesTitle}
              </p>
            </div>

            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setRenamingCategoryId(null);
                setCategoryRenameValue("");
              }}
              className="min-w-0 flex-1 rounded-md border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
            >
              <option value="all">{copy.allProducts}</option>
              <option value={UNCATEGORIZED_CATEGORY_ID}>
                {copy.uncategorized} ({uncategorizedCount})
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({itemCountsByCategory.get(category.id) ?? 0})
                </option>
              ))}
            </select>

            {addingCategory ? (
              <form
                onSubmit={addCategory}
                className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
              >
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder={copy.newCategory}
                  className="min-w-0 flex-1 rounded-md border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={categorySaving || newCategoryName.trim().length < 2}
                    className="rounded-full bg-bordeaux px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {categorySaving ? copy.adding : copy.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingCategory(false);
                      setNewCategoryName("");
                    }}
                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
                  >
                    {copy.cancel}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCategory(true)}
                className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
              >
                {copy.addCategoryButton}
              </button>
            )}

            {selectedCategory ? (
              renamingCategoryId === selectedCategory.id ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                  <input
                    value={categoryRenameValue}
                    onChange={(event) => setCategoryRenameValue(event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => renameCategory(selectedCategory.id)}
                      disabled={
                        categoryBusyId === selectedCategory.id ||
                        categoryRenameValue.trim().length < 2
                      }
                      className="rounded-full bg-bordeaux px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {categoryBusyId === selectedCategory.id ? copy.saving : copy.save}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingCategoryId(null);
                        setCategoryRenameValue("");
                      }}
                      className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
                    >
                      {copy.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingCategoryId(selectedCategory.id);
                      setCategoryRenameValue(selectedCategory.name);
                    }}
                    className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                  >
                    {copy.rename}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCategory(selectedCategory)}
                    disabled={categoryBusyId === selectedCategory.id}
                    className="rounded-full border border-bordeaux/20 bg-white px-3 py-1.5 text-xs font-medium text-bordeaux disabled:opacity-40"
                  >
                    {categoryBusyId === selectedCategory.id ? copy.deleting : copy.delete}
                  </button>
                </div>
              )
            ) : null}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-hairline bg-white px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={
                categoryFilter === "all"
                  ? "shrink-0 rounded-full bg-bordeaux px-4 py-2 text-xs font-medium tracking-wide text-white"
                  : "shrink-0 rounded-full border border-hairline bg-canvas-elevated px-4 py-2 text-xs font-medium tracking-wide text-ink shadow-[var(--shadow-soft)] transition hover:border-bordeaux/25"
              }
            >
              {copy.allProducts}
            </button>
            <CategoryTabs
              categories={customerFacingCategories}
              activeId={
                categoryFilter !== "all" && categoryFilter !== UNCATEGORIZED_CATEGORY_ID
                  ? categoryFilter
                  : null
              }
              onSelect={(id) => setCategoryFilter(id)}
            />
            <button
              type="button"
              onClick={() => setCategoryFilter(UNCATEGORIZED_CATEGORY_ID)}
              className={
                categoryFilter === UNCATEGORIZED_CATEGORY_ID
                  ? "shrink-0 rounded-full bg-bordeaux px-4 py-2 text-xs font-medium tracking-wide text-white"
                  : "shrink-0 rounded-full border border-hairline bg-canvas-elevated px-4 py-2 text-xs font-medium tracking-wide text-ink shadow-[var(--shadow-soft)] transition hover:border-bordeaux/25"
              }
            >
              {copy.uncategorized}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[1.35rem] border border-hairline bg-canvas p-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.searchItemName}
              className="flex-1 rounded-md border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
            />
            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as
                    | "default"
                    | "name_asc"
                    | "price_asc"
                    | "price_desc"
                )
              }
              className="rounded-md border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
            >
              <option value="default">{copy.sortMenuOrder}</option>
              <option value="name_asc">{copy.sortName}</option>
              <option value="price_asc">{copy.sortLowestPrice}</option>
              <option value="price_desc">{copy.sortHighestPrice}</option>
            </select>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hairline bg-canvas px-4 py-8 text-center text-sm text-muted">
              {copy.noItemsMatch}
            </div>
          ) : (
            filteredItems.map((item) => (
              <article
                key={item.id}
                className={`flex gap-3 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-3 shadow-[var(--shadow-soft)] transition ${
                  item.active ? "opacity-100" : "opacity-80"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setEditor(buildEditorFromItem(item))}
                  className="flex min-w-0 flex-1 gap-4 text-left"
                >
                  <div className="relative h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-md bg-canvas">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="76px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-muted">
                        {copy.noPhoto}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium tracking-tight text-ink">
                        {getDisplayItemName(item)}
                      </h3>
                      <span className="rounded-full border border-hairline bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
                        {item.isUncategorized ? copy.uncategorized : item.categoryName}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${
                          item.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-white text-bordeaux"
                        }`}
                      >
                        {item.active ? copy.availableBadge : copy.unavailableBadge}
                      </span>
                      {item.customerNotes.length > 0 ? (
                        <span className="rounded-full border border-hairline bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
                          {item.customerNotes.length}{" "}
                          {item.customerNotes.length === 1 ? copy.note : copy.notes}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">
                      {item.description || copy.noDescription}
                    </p>
                    {!item.categoryActive ? (
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-bordeaux">
                        {copy.categoryInactive}
                      </p>
                    ) : null}
                    {item.isUncategorized ? (
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                        {copy.waitingCategory}
                      </p>
                    ) : null}
                  </div>
                </button>

                <div className="flex shrink-0 flex-col items-end justify-between gap-3 py-0.5">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatPrice(item.price)}
                  </span>

                  <div className="flex flex-col items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => setEditor(buildEditorFromItem(item))}
                      className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                    >
                      {copy.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAvailability(item)}
                      disabled={togglingId === item.id}
                      className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
                    >
                      {togglingId === item.id
                        ? copy.saving
                        : item.active
                          ? copy.markUnavailable
                          : copy.markAvailable}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem(item)}
                      disabled={deletingId === item.id}
                      className="rounded-full border border-bordeaux/20 bg-white px-3 py-1.5 text-xs font-medium text-bordeaux disabled:opacity-40"
                    >
                      {deletingId === item.id ? copy.removing : copy.delete}
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {editor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bordeaux/30 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-hairline bg-white p-5 shadow-[0_28px_80px_rgba(0,0,0,0.2)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  {editor.mode === "create" ? copy.newItem : copy.editItem}
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink">
                  {editor.mode === "create"
                    ? copy.addNewMenuItem
                    : copy.updateMenuItem}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-full border border-hairline px-3 py-1.5 text-sm text-ink"
              >
                {copy.close}
              </button>
            </div>

            <form className="mt-5 space-y-5" onSubmit={submitEditor}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{copy.name}</span>
                    <StaffInfoBadge text={copy.nameTranslationInfo} />
                  </div>
                  <label className="flex items-center gap-3 rounded-md border border-hairline bg-canvas px-3 py-3 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={editor.translatableName}
                      onChange={(event) =>
                        updateEditor((current) => {
                          if (!event.target.checked) {
                            return {
                              ...current,
                              translatableName: false,
                              name:
                                current.name.trim() ||
                                current.italianName.trim() ||
                                current.englishName.trim(),
                            };
                          }

                          const suggestion = buildNameTranslationSuggestion({
                            name:
                              current.name.trim() ||
                              current.italianName.trim() ||
                              current.englishName.trim(),
                            language,
                          });

                          return {
                            ...current,
                            translatableName: true,
                            italianName:
                              current.italianName.trim() || suggestion.italianName,
                            englishName:
                              current.englishName.trim() || suggestion.englishName,
                          };
                        })
                      }
                    />
                    {copy.translatableName}
                  </label>
                  <p className="text-xs text-muted">{copy.translatableNameHelp}</p>

                  {editor.translatableName ? (
                    <div className="grid gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-ink">
                          {copy.italianName}
                        </span>
                        <input
                          required
                          value={editor.italianName}
                          onChange={(event) =>
                            updateEditor((current) => ({
                              ...current,
                              italianName: event.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-ink">
                          {copy.englishName}
                        </span>
                        <input
                          required
                          value={editor.englishName}
                          onChange={(event) =>
                            updateEditor((current) => ({
                              ...current,
                              englishName: event.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateEditor((current) => {
                            const suggestion = buildNameTranslationSuggestion({
                              name:
                                current.name.trim() ||
                                current.italianName.trim() ||
                                current.englishName.trim(),
                              language,
                            });
                            return {
                              ...current,
                              italianName: suggestion.italianName,
                              englishName: suggestion.englishName,
                            };
                          })
                        }
                        className="w-fit rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                      >
                        {copy.useSuggestedTranslation}
                      </button>
                    </div>
                  ) : (
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">
                        {copy.name}
                      </span>
                      <input
                        required
                        value={editor.name}
                        onChange={(event) =>
                          updateEditor((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                      />
                    </label>
                  )}
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    {copy.category}
                  </span>
                  <select
                    value={editor.categoryId}
                    onChange={(event) =>
                      updateEditor((current) => ({
                        ...current,
                        categoryId: event.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                  >
                    <option value="">{copy.noCategoryForNow}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  {copy.description}
                </span>
                <textarea
                  rows={4}
                  value={editor.description}
                  onChange={(event) =>
                    updateEditor((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      {copy.price}
                    </span>
                    <input
                      required
                      inputMode="decimal"
                      value={editor.price}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          price: event.target.value,
                        }))
                      }
                      placeholder="9.50"
                      className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      {copy.imageUrl}
                    </span>
                    <input
                      value={editor.imageUrl}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          imageUrl: event.target.value,
                        }))
                      }
                      placeholder={copy.imageUrlPlaceholder}
                      className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      {copy.uploadPhoto}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={onSelectImage}
                      className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink"
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-md border border-hairline bg-canvas px-3 py-3 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={editor.active}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          active: event.target.checked,
                        }))
                      }
                    />
                    {copy.availableInCustomerMenu}
                  </label>
                </div>

                <div className="rounded-2xl border border-hairline bg-canvas p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                    {copy.preview}
                  </p>
                  <div className="relative mt-3 h-40 overflow-hidden rounded-xl bg-white">
                    {editor.imageUrl ? (
                      <Image
                        src={editor.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="256px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.16em] text-muted">
                        {copy.noPhoto}
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-ink">
                    {editorPreviewName || copy.itemName}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {editor.description.trim() || copy.descriptionPreview}
                  </p>
                </div>
              </div>

              <details className="rounded-xl border border-hairline bg-canvas px-3 py-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                        {copy.ingredients}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{copy.ingredientsHelp}</p>
                    </div>
                    <span className="rounded-full border border-hairline bg-white px-2.5 py-0.5 text-[11px] font-medium text-muted">
                      {editor.ingredients.filter((row) => row.name.trim().length > 0).length}
                    </span>
                  </div>
                </summary>

                <div className="mt-3 space-y-2">
                  <div className="hidden gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                    <span>{copy.ingredientName}</span>
                    <span>{copy.gramsPerPortion}</span>
                    <span />
                  </div>

                  {editor.ingredients.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-hairline bg-white px-3 py-2.5 text-sm text-muted">
                      {copy.noIngredients}
                    </p>
                  ) : (
                    editor.ingredients.map((ingredient, index) => (
                      <div
                        key={`${ingredient.ingredientId ?? "new"}-${index}`}
                        className="grid gap-2 rounded-lg border border-hairline bg-white px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
                      >
                        <input
                          value={ingredient.name}
                          onChange={(event) =>
                            updateIngredientRow(index, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          placeholder={copy.ingredientName}
                          className="min-w-0 rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={ingredient.quantity}
                          onChange={(event) =>
                            updateIngredientRow(index, (current) => ({
                              ...current,
                              quantity: Number(event.target.value || 0),
                            }))
                          }
                          placeholder="0"
                          className="rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                        />
                        <button
                          type="button"
                          onClick={() => removeIngredientRow(index)}
                          className="rounded-md border border-bordeaux/20 bg-white px-3 py-2 text-xs font-medium text-bordeaux"
                        >
                          {copy.remove}
                        </button>
                      </div>
                    ))
                  )}

                  <button
                    type="button"
                    onClick={addIngredientRow}
                    className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                  >
                    {copy.addIngredient}
                  </button>
                </div>
              </details>

              <div className="rounded-2xl border border-hairline bg-canvas p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                      {copy.itemNotes}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {copy.itemNotesHelp}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addCustomerNote("single")}
                      className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                    >
                      {copy.addSingleNote}
                    </button>
                    <button
                      type="button"
                      onClick={() => addCustomerNote("choice")}
                      className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                    >
                      {copy.addNoteWithOptions}
                    </button>
                  </div>
                </div>

                {editor.customerNotes.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-hairline bg-white px-4 py-4 text-sm text-muted">
                    {copy.noCustomerNotes}
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {editor.customerNotes.map((noteConfig) => (
                      <div
                        key={noteConfig.id}
                        className="rounded-xl border border-hairline bg-white px-3 py-3"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row">
                          <input
                            value={noteConfig.label}
                            onChange={(event) =>
                              updateCustomerNote(noteConfig.id, (currentNote) => ({
                                ...currentNote,
                                label: event.target.value,
                              }))
                            }
                            placeholder={copy.noteLabel}
                            className="min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                          />
                          <select
                            value={noteConfig.kind}
                            onChange={(event) =>
                              updateCustomerNote(noteConfig.id, (currentNote) => ({
                                ...currentNote,
                                kind:
                                  event.target.value === "choice" ? "choice" : "single",
                                options:
                                  event.target.value === "choice"
                                    ? currentNote.options.length > 0
                                      ? currentNote.options
                                      : [
                                          {
                                            id: buildTempId("option"),
                                            label: "",
                                          },
                                        ]
                                    : [],
                              }))
                            }
                            className="rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                          >
                            <option value="single">{copy.singleNote}</option>
                            <option value="choice">{copy.noteWithOptions}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => deleteCustomerNote(noteConfig.id)}
                            className="rounded-full border border-bordeaux/20 bg-white px-3 py-1.5 text-xs font-medium text-bordeaux"
                          >
                            {copy.delete}
                          </button>
                        </div>

                        {noteConfig.kind === "choice" ? (
                          <div className="mt-3 rounded-xl border border-hairline bg-canvas px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                                {copy.options}
                              </p>
                              <button
                                type="button"
                                onClick={() => addCustomerNoteOption(noteConfig.id)}
                                className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                              >
                                {copy.addOption}
                              </button>
                            </div>
                            <div className="mt-3 space-y-2">
                              {noteConfig.options.map((option) => (
                                <div
                                  key={option.id}
                                  className="flex flex-col gap-2 sm:flex-row"
                                >
                                  <input
                                    value={option.label}
                                    onChange={(event) =>
                                      updateCustomerNoteOption(
                                        noteConfig.id,
                                        option.id,
                                        event.target.value
                                      )
                                    }
                                    placeholder={copy.optionLabel}
                                    className="min-w-0 flex-1 rounded-md border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteCustomerNoteOption(noteConfig.id, option.id)
                                    }
                                    className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                                  >
                                    {copy.remove}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditor(null)}
                  className="rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink"
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-bordeaux px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {saving
                    ? editor.mode === "create"
                      ? copy.adding
                      : copy.saving
                    : editor.mode === "create"
                      ? copy.addItem
                      : copy.saveChanges}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
