"use client";

import { useEffect, useState } from "react";
import type { DashboardRole } from "@/lib/order-stations";
import {
  normalizeStaffPin,
  type StaffRolePins,
} from "@/lib/staff-access";

type StaffUiLanguage = "it" | "en";

type Copy = {
  title: string;
  save: string;
  saving: string;
  saveSuccess: string;
  saveError: string;
  addPin: string;
  remove: string;
  placeholder: string;
  empty: string;
};

const COPY: Record<StaffUiLanguage, Copy> = {
  it: {
    title: "PIN",
    save: "Salva PIN",
    saving: "Salvataggio…",
    saveSuccess: "PIN aggiornati.",
    saveError: "Impossibile salvare i PIN.",
    addPin: "+ PIN",
    remove: "Rimuovi",
    placeholder: "1234",
    empty: "Nessun PIN configurato.",
  },
  en: {
    title: "PIN",
    save: "Save PINs",
    saving: "Saving…",
    saveSuccess: "PINs updated.",
    saveError: "Could not save the PINs.",
    addPin: "+ PIN",
    remove: "Remove",
    placeholder: "1234",
    empty: "No PIN configured yet.",
  },
};

const PIN_FIELDS: Array<{ role: DashboardRole; it: string; en: string }> = [
  { role: "waiter", it: "Cameriere", en: "Waiter" },
  { role: "bar", it: "Bar", en: "Bar" },
  { role: "kitchen", it: "Kitchen", en: "Kitchen" },
  { role: "manager", it: "Responsabile", en: "Manager" },
];

function cloneRolePins(rolePins: StaffRolePins): StaffRolePins {
  return {
    waiter: [...rolePins.waiter],
    bar: [...rolePins.bar],
    kitchen: [...rolePins.kitchen],
    manager: [...rolePins.manager],
  };
}

function ensureVisiblePins(rolePins: StaffRolePins): StaffRolePins {
  return {
    waiter: rolePins.waiter.length > 0 ? rolePins.waiter : [""],
    bar: rolePins.bar.length > 0 ? rolePins.bar : [""],
    kitchen: rolePins.kitchen.length > 0 ? rolePins.kitchen : [""],
    manager: rolePins.manager.length > 0 ? rolePins.manager : [""],
  };
}

export function StaffPinPanel({
  language,
  initialRolePins,
  onSaved,
}: {
  language: StaffUiLanguage;
  initialRolePins: StaffRolePins;
  onSaved?: (nextRolePins: StaffRolePins) => void;
}) {
  const copy = COPY[language];
  const [draft, setDraft] = useState<StaffRolePins>(() =>
    ensureVisiblePins(cloneRolePins(initialRolePins))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(ensureVisiblePins(cloneRolePins(initialRolePins)));
  }, [initialRolePins]);

  function updateRolePins(role: DashboardRole, nextPins: string[]) {
    setDraft((current) => ({
      ...current,
      [role]: nextPins,
    }));
    setError(null);
    setMessage(null);
  }

  async function savePins() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/staff/access", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rolePins: draft,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.rolePins) {
        throw new Error(payload?.error ?? copy.saveError);
      }

      const nextRolePins = cloneRolePins(payload.rolePins as StaffRolePins);
      setDraft(ensureVisiblePins(nextRolePins));
      setMessage(copy.saveSuccess);
      onSaved?.(nextRolePins);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{copy.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void savePins()}
            disabled={saving}
            className="rounded-full bg-bordeaux px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? copy.saving : copy.save}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-bordeaux/20 bg-white px-4 py-3 text-sm text-bordeaux">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {PIN_FIELDS.map((field) => {
          const rolePins = draft[field.role];
          const label = language === "en" ? field.en : field.it;

          return (
            <section
              key={field.role}
              className="rounded-[1.15rem] border border-hairline bg-canvas p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">{label}</h3>
                <button
                  type="button"
                  onClick={() => updateRolePins(field.role, [...rolePins, ""])}
                  className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                >
                  {copy.addPin}
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {rolePins.map((pin, index) => (
                  <div
                    key={`${field.role}-${index}`}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pin}
                      onChange={(event) => {
                        const nextPins = rolePins.map((entry, entryIndex) =>
                          entryIndex === index
                            ? normalizeStaffPin(event.target.value).replace(/\D+/g, "")
                            : entry
                        );
                        updateRolePins(field.role, nextPins);
                      }}
                      placeholder={copy.placeholder}
                      className="rounded-md border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                    />
                    {rolePins.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateRolePins(
                            field.role,
                            rolePins.filter((_, entryIndex) => entryIndex !== index)
                          )
                        }
                        className="rounded-md border border-bordeaux/20 bg-white px-3 py-2 text-xs font-medium text-bordeaux"
                      >
                        {copy.remove}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
