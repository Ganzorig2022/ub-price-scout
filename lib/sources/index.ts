import { queryVariants } from "../intake.ts";
import { compareProductTitle } from "../matching.ts";
import { BEST_COMPUTERS } from "./bestcomputers.ts";
import { CODY_STORES } from "./cody.ts";
import { HTML_STORES } from "./html.ts";
import { IPICK } from "./ipick.ts";
import { PCMALL_MN } from "./pcmallmn.ts";
import { plausiblePrice } from "./shared.ts";
import { SourceError, type Listing, type RawCandidate, type SourceDefinition, type SourceResult } from "./types.ts";
import { WOO_STORES } from "./woocommerce.ts";
import { ZOCHIL_STORES } from "./zochil.ts";

export type { Listing, SourceResult } from "./types.ts";

export const SOURCES: SourceDefinition[] = [
  BEST_COMPUTERS,
  ...CODY_STORES,
  ...ZOCHIL_STORES,
  IPICK,
  PCMALL_MN,
  ...WOO_STORES,
  ...HTML_STORES,
];

export const SOURCE_NAMES = SOURCES.map((source) => source.seller);

/**
 * Accessories are often titled after the device they fit ("Macbook Air 13.6 M2" for a
 * screen protector). Unless the query itself asks for one, drop them by title or URL slug.
 */
const ACCESSORY_RE = /\b(?:case|cover|protector|screen|glass|film|tempered|skin|sleeve|bag|stand|strap|band|charger|cable|adapter|dock|hub|mount|holder|keyboard for|pencil|stylus)\b|наалт|гэр|хайрцаг|цэнэглэгч|tseneglegch|кабель|хамгаалалт|бүрээс|оосор|дагалдах/i;

export function looksLikeAccessory(query: string, title: string, url: string) {
  return !ACCESSORY_RE.test(query) && ACCESSORY_RE.test(`${title} ${decodeURIComponent(url).replace(/[-_/]/g, " ")}`);
}

/** Turn raw candidates into matched listings: drop non-matches, accessories, bad prices, and duplicates. */
export function toListings(candidates: RawCandidate[], seller: string, query: string, fallbackUrl: string): Listing[] {
  const unique = new Map<string, Listing>();
  const checkedAt = new Date().toISOString();
  for (const candidate of candidates) {
    if (!plausiblePrice(candidate.price)) continue;
    if (looksLikeAccessory(query, candidate.title, candidate.url)) continue;
    const comparison = compareProductTitle(query, candidate.title);
    if (!comparison) continue;
    const url = candidate.url || fallbackUrl;
    const key = `${url}|${candidate.price}`;
    if (unique.has(key)) continue;
    unique.set(key, { seller, title: candidate.title.slice(0, 180), price: candidate.price, url, match: comparison.match, confidence: comparison.confidence, stock: candidate.stock, checkedAt, note: candidate.note });
  }
  return [...unique.values()].sort((a, b) => (a.match === b.match ? a.price - b.price : a.match === "exact" ? -1 : 1)).slice(0, 8);
}

/**
 * Search the store with `searchQuery` (possibly a shortened variant) but always score
 * titles against the user's full `query`, so "exact" keeps meaning exact.
 * Adapters return [] when the store answered with nothing; they throw
 * SourceError("unreadable") when the page could not be understood.
 */
async function attempt(source: SourceDefinition, searchQuery: string, query: string): Promise<SourceResult> {
  const searchUrl = source.searchUrl(searchQuery);
  try {
    const candidates = await source.search(searchQuery);
    const listings = toListings(candidates, source.seller, query, searchUrl);
    return { seller: source.seller, searchUrl, state: listings.length ? "found" : "no_match", listings };
  } catch (error) {
    const state = error instanceof SourceError ? error.state : "blocked";
    return { seller: source.seller, searchUrl, state, listings: [] };
  }
}

/** Hard wall-clock budget per store, whatever its retries add up to; the whole scan waits for the slowest store. */
const SOURCE_BUDGET_MS = 12_000;

/** Try the query, then shorter variants, until one source gives listings or refuses. Never longer than SOURCE_BUDGET_MS. */
export async function scanSource(source: SourceDefinition, query: string, budgetMs = SOURCE_BUDGET_MS): Promise<SourceResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<SourceResult>((resolve) => {
    timer = setTimeout(() => resolve({ seller: source.seller, searchUrl: source.searchUrl(query), state: "timed_out", listings: [] }), budgetMs);
  });
  try {
    return await Promise.race([scanVariants(source, query), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function scanVariants(source: SourceDefinition, query: string): Promise<SourceResult> {
  const variants = queryVariants(query).slice(0, 2);
  const attemptedQueries: string[] = [];
  let fallback: SourceResult | null = null;
  for (const variant of variants) {
    attemptedQueries.push(variant);
    const result = await attempt(source, variant, query);
    // Prefer the more alarming state across variants: a read failure must never hide behind an earlier empty result.
    if (!fallback || result.state === "unreadable") fallback = result;
    if (result.state === "found" || result.state === "blocked" || result.state === "timed_out") {
      return { ...result, searchUrl: source.searchUrl(query), attemptedQueries };
    }
  }
  return { ...(fallback ?? { seller: source.seller, searchUrl: source.searchUrl(query), state: "unreadable" as const, listings: [] }), searchUrl: source.searchUrl(query), attemptedQueries };
}

export async function scanAll(query: string): Promise<SourceResult[]> {
  return Promise.all(SOURCES.map((source) => scanSource(source, query)));
}
