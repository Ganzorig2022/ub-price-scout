import { absoluteUrl, cleanText, fetchText, numericPrice, plausiblePrice, priceFromText } from "./shared.ts";
import { SourceError, type RawCandidate, type SourceDefinition } from "./types.ts";

/**
 * Best-effort reader for stores with no known data path: JSON-LD, then
 * `__NEXT_DATA__`, then plain anchors with a price next to them. Kept for
 * Arina (search page renders no cards) and Unegui (Cloudflare 403). Both are
 * expected to end as "unreadable"/"blocked"; the ledger link still helps a human.
 */
function candidateFromObject(value: unknown, base: string): RawCandidate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const title = String(item.name ?? item.title ?? item.productName ?? "").trim();
  if (!title) return null;
  const offer = (item.offers && typeof item.offers === "object" ? item.offers : item) as Record<string, unknown>;
  const currency = String(offer.priceCurrency ?? item.priceCurrency ?? item.currency ?? "").toUpperCase();
  if (currency && currency !== "MNT") return null;
  const price = numericPrice(offer.price ?? offer.lowPrice ?? item.price ?? item.salePrice);
  if (!price) return null;
  const availability = String(offer.availability ?? item.availability ?? "").toLowerCase();
  const stock = availability.includes("outofstock") || availability.includes("sold") ? "out_of_stock" : availability.includes("instock") ? "in_stock" : "unknown";
  return { title: cleanText(title), price, url: absoluteUrl(String(item.url ?? offer.url ?? base), base), stock };
}

function walk(value: unknown, base: string, found: RawCandidate[], depth = 0) {
  if (depth > 10 || found.length >= 12 || !value) return;
  if (Array.isArray(value)) { for (const item of value) walk(item, base, found, depth + 1); return; }
  if (typeof value !== "object") return;
  const candidate = candidateFromObject(value, base);
  if (candidate) found.push(candidate);
  for (const child of Object.values(value as Record<string, unknown>)) walk(child, base, found, depth + 1);
}

export function candidatesFromHtml(html: string, base: string): RawCandidate[] {
  const found: RawCandidate[] = [];
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(block[1]), base, found); } catch { /* malformed publisher data */ }
  }
  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (nextData) {
    try { walk(JSON.parse(nextData), base, found); } catch { /* malformed application data */ }
  }
  if (!found.length) {
    for (const anchor of html.matchAll(/<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
      const title = cleanText(anchor[3]);
      const price = priceFromText(cleanText(anchor[0]));
      if (title.length >= 3 && plausiblePrice(price)) found.push({ title, price, url: absoluteUrl(anchor[2], base), stock: "unknown", note: "Хайлтын үр дүнгээс үнийг уншив" });
      if (found.length >= 12) break;
    }
  }
  return found;
}

export function htmlSource(seller: string, base: string, searchUrl: (q: string) => string): SourceDefinition {
  return {
    seller,
    method: "html",
    searchUrl,
    async search(query) {
      const { text, url, notFound } = await fetchText(searchUrl(query));
      if (notFound) return [];
      const candidates = candidatesFromHtml(text, url || base);
      // With no known data path, an empty page is indistinguishable from an unreadable one.
      if (!candidates.length) throw new SourceError("unreadable", "no product data recognised");
      return candidates;
    },
  };
}

export const HTML_STORES: SourceDefinition[] = [
  htmlSource("Arina", "https://arina.mn", (q) => `https://arina.mn/search?txt=${encodeURIComponent(q)}`),
  htmlSource("Unegui", "https://www.unegui.mn", (q) => `https://www.unegui.mn/kompyuter-busad/?q=${encodeURIComponent(q)}`),
];
