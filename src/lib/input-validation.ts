// Input rules shared by every form in the app. Pure functions so they can be
// unit tested and reused on the server. Messages are short and human — they say
// what to type, never what the library complained about.

/** Matches the engine's cap on MUSD amounts. */
export const MAX_MUSD = 1_000_000_000;
/** All the bitcoin that will ever exist — anything above is a typo. */
export const MAX_BTC = 21_000_000;
/** Longest password Supabase accepts (bcrypt limit). */
export const MAX_PASSWORD = 72;
export const MIN_PASSWORD = 8;

/**
 * Keep a numeric field numeric while the user types: digits and a single dot,
 * capped decimal places. Letters, spaces, minus signs and pasted currency
 * symbols are dropped instead of being coerced to a number behind the scenes.
 */
export function sanitizeDecimal(raw: string, decimals: number): string {
  // "1,234.50" uses commas as thousands; "1,5" uses one as the decimal point.
  let s = raw;
  if (s.includes(".")) s = s.replace(/,/g, "");
  else if ((s.match(/,/g) ?? []).length === 1) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  s = s.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    s = `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, "")}`;
    if (decimals <= 0) s = s.slice(0, dot);
    else {
      const [whole, fraction = ""] = s.split(".");
      s = `${whole}.${fraction.slice(0, decimals)}`;
    }
  }
  if (s.startsWith(".")) s = `0${s}`;
  return s;
}

/** Number for a sanitized field, or null while it is empty/incomplete. */
export function parseDecimal(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function countDecimals(raw: string): number {
  const dot = raw.indexOf(".");
  return dot === -1 ? 0 : raw.length - dot - 1;
}

export type AmountRule = {
  /** Noun with its article, e.g. "an amount" → "Enter an amount". */
  label?: string;
  /** Max decimal places: 2 for MUSD, 8 for BTC. */
  decimals?: number;
  /** Smallest accepted value; 0 means "anything above zero". */
  min?: number;
  max?: number;
  /** Copy for the max error, e.g. "You only have $42.00 in the vault". */
  maxLabel?: string;
  /** Allow exactly zero (used by the auto-approval limit). */
  allowZero?: boolean;
};

export function amountError(raw: string, rule: AmountRule = {}): string | null {
  const label = rule.label ?? "a value";
  const decimals = rule.decimals ?? 2;
  const value = parseDecimal(raw);
  if (value === null) return raw.trim() ? "Use numbers only" : `Enter ${label}`;
  if (countDecimals(raw) > decimals)
    return `Use at most ${decimals} decimal place${decimals === 1 ? "" : "s"}`;
  if (value === 0 && !rule.allowZero) return "Enter an amount above zero";
  if (value < 0) return "Amounts can't be negative";
  if (rule.min !== undefined && value < rule.min) return `Must be at least ${rule.min}`;
  if (rule.max !== undefined && value > rule.max)
    return rule.maxLabel ?? `That's more than the ${rule.max.toLocaleString("en-US")} maximum`;
  return null;
}

export type TextRule = {
  label?: string;
  min?: number;
  max?: number;
  /** Trim before measuring and storing. Defaults to true. */
  trim?: boolean;
  required?: boolean;
};

export function textError(raw: string, rule: TextRule = {}): string | null {
  const label = rule.label ?? "a value";
  const value = rule.trim === false ? raw : raw.trim();
  if (!value) return rule.required === false ? null : `Enter ${label}`;
  if (rule.min !== undefined && value.length < rule.min)
    return `Use at least ${rule.min} characters`;
  if (rule.max !== undefined && value.length > rule.max)
    return `Keep it under ${rule.max} characters`;
  return null;
}

export function emailError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter your email";
  if (value.length > 255) return "That email address is too long";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "Enter a valid email address";
  return null;
}

export function passwordError(raw: string, opts: { min?: number } = {}): string | null {
  const min = opts.min ?? MIN_PASSWORD;
  if (!raw) return "Enter your password";
  if (raw.length < min) return `Use at least ${min} characters`;
  if (raw.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters`;
  return null;
}

/** Invite codes are printed as KV-XXXXX-XXXXX; be forgiving about case/spaces. */
export function inviteCodeError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter the invite code";
  if (value.length < 4) return "That code is too short";
  if (value.length > 40) return "That code is too long";
  if (!/^[A-Za-z0-9-]+$/.test(value)) return "Use letters, numbers and dashes only";
  return null;
}

export function addressError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter a wallet address";
  if (!value.startsWith("0x")) return "A wallet address starts with 0x";
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return "A wallet address is 0x followed by 40 characters";
  return null;
}

export function ageError(raw: string, opts: { min?: number; max?: number } = {}): string | null {
  const min = opts.min ?? 0;
  const max = opts.max ?? 120;
  const value = raw.trim();
  if (!value) return "Enter an age";
  if (!/^\d{1,3}$/.test(value)) return "Use whole years only";
  const n = Number(value);
  if (n < min) return `Must be ${min} or over`;
  if (n > max) return `Must be ${max} or under`;
  return null;
}

export function dateError(raw: string, opts: { min?: string } = {}): string | null {
  const value = raw.trim();
  if (!value) return "Pick a date";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Use a date like 2028-03-14";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    return "That date doesn't exist";
  if (opts.min && value < opts.min) return "Pick a future date";
  return null;
}

/** Uppercase, trimmed form of an invite code as the user types it. */
export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}
