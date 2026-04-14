"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartLine } from "@/types/cart";
import { cartSubtotal } from "@/types/cart";
import { cartLineFingerprint } from "@/lib/cart-fingerprint";
import { normalizeProductCustomerNoteSelections } from "@/lib/product-customer-notes";

type CartContextValue = {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "id">) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeLine: (id: string) => void;
  clear: () => void;
  subtotalCents: number;
  storageKey: string | null;
  setStorageKey: (key: string | null) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ln_${Math.random().toString(36).slice(2)}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [storageKey, setStorageKey] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) {
          setLines(
            parsed.map((line) => ({
              ...line,
              selectedNotes: normalizeProductCustomerNoteSelections(
                (line as CartLine & { quickNotes?: unknown }).selectedNotes ??
                  (line as CartLine & { quickNotes?: unknown }).quickNotes
              ),
            }))
          );
        }
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines, storageKey]);

  const addLine = useCallback((line: Omit<CartLine, "id">) => {
    const fp = cartLineFingerprint(line);
    setLines((prev) => {
      const idx = prev.findIndex((l) => cartLineFingerprint(l) === fp);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + line.quantity,
        };
        return next;
      }
      return [...prev, { ...line, id: newId() }];
    });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setLines((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.id !== id);
      return prev.map((l) => (l.id === id ? { ...l, quantity } : l));
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const subtotalCents = useMemo(() => cartSubtotal(lines), [lines]);

  const value = useMemo(
    () => ({
      lines,
      addLine,
      updateQuantity,
      removeLine,
      clear,
      subtotalCents,
      storageKey,
      setStorageKey,
    }),
    [
      lines,
      addLine,
      updateQuantity,
      removeLine,
      clear,
      subtotalCents,
      storageKey,
    ]
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
