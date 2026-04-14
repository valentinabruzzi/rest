import type { DashboardRole } from "@/lib/order-stations";

type AccessObject = Record<string, unknown>;

export type StaffRolePins = Record<DashboardRole, string[]>;

export type StaffAccessSettings = {
  rolePins: StaffRolePins;
};

export const EMPTY_STAFF_ROLE_PINS: StaffRolePins = {
  waiter: [],
  bar: [],
  kitchen: [],
  manager: [],
};

function asObject(value: unknown): AccessObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...value } as AccessObject)
    : {};
}

export function normalizeStaffPin(value: string) {
  return value.replace(/\s+/g, "");
}

function sanitizePinList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => (typeof entry === "string" ? normalizeStaffPin(entry) : ""))
    .filter((entry) => /^\d{3,12}$/.test(entry));

  return normalized.filter((entry, index) => normalized.indexOf(entry) === index);
}

export function getRestaurantStaffAccess(settings: unknown): StaffAccessSettings {
  const settingsObject = asObject(settings);
  const staffAccess = asObject(settingsObject.staffAccess);
  const rolePins = asObject(staffAccess.rolePins);

  return {
    rolePins: {
      waiter: sanitizePinList(rolePins.waiter),
      bar: sanitizePinList(rolePins.bar),
      kitchen: sanitizePinList(rolePins.kitchen),
      manager: sanitizePinList(rolePins.manager),
    },
  };
}

export function mergeRestaurantStaffAccess(args: {
  settings: unknown;
  updates: StaffAccessSettings;
}) {
  const nextSettings = asObject(args.settings);
  const nextStaffAccess = asObject(nextSettings.staffAccess);

  nextStaffAccess.rolePins = {
    waiter: sanitizePinList(args.updates.rolePins.waiter),
    bar: sanitizePinList(args.updates.rolePins.bar),
    kitchen: sanitizePinList(args.updates.rolePins.kitchen),
    manager: sanitizePinList(args.updates.rolePins.manager),
  };

  nextSettings.staffAccess = nextStaffAccess;
  return nextSettings;
}

export function isRolePinConfigured(settings: unknown, role: DashboardRole) {
  return getRestaurantStaffAccess(settings).rolePins[role].length > 0;
}

export function isValidRolePin(args: {
  settings: unknown;
  role: DashboardRole;
  pin: string;
}) {
  const normalizedPin = normalizeStaffPin(args.pin);
  if (!/^\d{3,12}$/.test(normalizedPin)) return false;
  return getRestaurantStaffAccess(args.settings).rolePins[args.role].includes(normalizedPin);
}
