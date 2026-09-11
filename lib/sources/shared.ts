import { SourceError } from "./types.ts";

export const USER_AGENT = "Mozilla/5.0 (compatible; UBPriceScout/1.0; public price research)";
export const MIN_PRICE = 10_000;
export const MAX_PRICE = 500_000_000;

const PRICE_RE = /(?:₮|MNT|Үнэ[:\s]*)\s*([\d,. ]{5,15})|([\d,. ]{5,15})\s*(?:₮|MNT|төг(?:рөг)?)/gi;

export function plausiblePrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_PRICE && value <= MAX_PRICE;
}

/** "5,999,900₮" / "587900.00" / 4099900 → 5999900 / 587900 / 4099900, or null. */
export function numericPrice(value: unknown): number | null {
  if (typeof value === "number") return plausiblePrice(value) ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  const compact = value.replace(/[\s,]/g, "");
  if (/^\d+(?:\.\d+)?$/.test(compact)) {
    const parsed = Math.round(Number(compact));
    return plausiblePrice(parsed) ? parsed : null;
  }
  return priceFromText(value);
}

/** Find a MNT price inside free text such as "Үнэ: 1,899,900 ₮". */
export function priceFromText(value: string): number | null {
  PRICE_RE.lastIndex = 0;
  const match = PRICE_RE.exec(value);
  if (!match) return null;
  const amount = Number((match[1] ?? match[2]).replace(/[^\d]/g, ""));
  return plausiblePrice(amount) ? amount : null;
}

export function cleanText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a product link, refusing anything that leaves the retailer or is not https. */
export function absoluteUrl(href: string, base: string) {
  try {
    const baseUrl = new URL(base);
    const resolved = new URL(href, baseUrl);
    const sameRetailer = resolved.hostname === baseUrl.hostname || resolved.hostname.endsWith(`.${baseUrl.hostname}`) || baseUrl.hostname.endsWith(`.${resolved.hostname}`);
    return resolved.protocol === "https:" && sameRetailer ? resolved.toString() : baseUrl.toString();
  } catch {
    return base;
  }
}

type FetchOptions = { headers?: Record<string, string>; method?: "GET" | "POST"; body?: string; timeoutMs?: number; maxBytes?: number };

/**
 * fetch with a timeout and a size cap, translating HTTP failures into SourceError states
 * so every adapter reports "blocked" / "timed_out" the same way.
 */
export async function fetchText(url: string, options: FetchOptions = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.8", ...options.headers },
      body: options.body,
      redirect: "follow",
      signal: AbortSignal.timeout(options.timeoutMs ?? 7000),
    });
  } catch (error) {
    throw new SourceError(error instanceof Error && error.name === "TimeoutError" ? "timed_out" : "blocked");
  }
  if (response.status === 404) return { text: "", url: response.url || url, notFound: true };
  if (!response.ok) throw new SourceError("blocked", `HTTP ${response.status}`);
  const text = (await response.text()).slice(0, options.maxBytes ?? 900_000);
  return { text, url: response.url || url, notFound: false };
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T | null> {
  const { text, notFound } = await fetchText(url, { ...options, headers: { Accept: "application/json", ...options.headers } });
  if (notFound || !text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError("unreadable", "response was not JSON");
  }
}
