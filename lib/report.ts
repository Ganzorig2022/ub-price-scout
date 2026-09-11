import { facebookMerchantLeads } from "./facebook-leads.ts";
import type { Listing, SourceResult } from "./sources/types.ts";

export type Verdict = "great" | "fair" | "high" | "insufficient";

/**
 * A price below this share of the exact-match median AND below the absolute cap is treated as a
 * mislabeled accessory, not a bargain. The cap keeps a real 1.4M₮ graphics card from being demoted
 * when laptops that contain it push the median up.
 */
const OUTLIER_FLOOR = 0.4;
const OUTLIER_MAX_PRICE = 500_000;
const OUTLIER_MIN_SAMPLES = 3;

function medianOf(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Split listings into the price band (exact, in stock, not an outlier) and the rest.
 * A 255,920₮ "Macbook Air 13.6 M2" next to four listings around 4.6M₮ is a screen
 * protector with the laptop's name; it must not become "the cheapest offer".
 */
export function splitListings(all: Listing[]) {
  const candidates = all.filter((item) => item.match === "exact" && item.stock !== "out_of_stock");
  const rest = all.filter((item) => !(item.match === "exact" && item.stock !== "out_of_stock"));
  const firstMedian = medianOf(candidates.map((item) => item.price));
  const outlier = (item: Listing) => candidates.length >= OUTLIER_MIN_SAMPLES && firstMedian !== null && item.price < firstMedian * OUTLIER_FLOOR && item.price < OUTLIER_MAX_PRICE;
  const exact = candidates.filter((item) => !outlier(item)).sort((a, b) => a.price - b.price);
  const near = [...rest, ...candidates.filter(outlier).map((item) => ({ ...item, match: "near" as const, note: [item.note, "Үнэ нь ижил барааны дунджаас хэт доогуур тул дагалдах хэрэгсэл байж магадгүй"].filter(Boolean).join(" · ") }))].sort((a, b) => a.price - b.price);
  return { exact, near };
}

export function summarize(query: string, targetPrice: number | null, listingUrl: string | null, sources: SourceResult[]) {
  const { exact, near } = splitListings(sources.flatMap((source) => source.listings));
  const livePrices = exact.map((item) => item.price);
  const median = medianOf(livePrices);
  const low = livePrices.length ? livePrices[0] : null;
  const high = livePrices.length ? livePrices[livePrices.length - 1] : null;
  let verdict: Verdict = "insufficient";
  if (targetPrice && median) verdict = targetPrice <= median * 0.92 ? "great" : targetPrice <= median * 1.08 ? "fair" : "high";
  return { query, targetPrice, listingUrl, verdict, median, low, high, exact, near, sources, facebookLeads: facebookMerchantLeads(query), checkedAt: new Date().toISOString() };
}
