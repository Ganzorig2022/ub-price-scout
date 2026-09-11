import { cleanText, fetchJson, priceFromText } from "./shared.ts";
import { SourceError, type RawCandidate, type SourceDefinition } from "./types.ts";

/**
 * bestcomputers.mn's search page is not filtered server-side, but its search box
 * calls `/search/a?term=` which returns JSON when asked like an XHR.
 */
type BestItem = { id?: number | string; value?: string; price_text?: string };

export function candidatesFromBest(items: BestItem[]): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const item of items) {
    if (!item.value || !item.id) continue;
    out.push({ title: cleanText(item.value), price: item.price_text ? priceFromText(item.price_text) : null, url: `https://bestcomputers.mn/products/${item.id}`, stock: "unknown" });
  }
  return out;
}

export const BEST_COMPUTERS: SourceDefinition = {
  seller: "Best Computers",
  method: "api",
  searchUrl: (q) => `https://bestcomputers.mn/index.php?route=product/search&search=${encodeURIComponent(q)}`,
  async search(query) {
    const data = await fetchJson<BestItem[]>(`https://bestcomputers.mn/search/a?term=${encodeURIComponent(query)}`, {
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json, text/javascript" },
    });
    if (data === null) return [];
    // The autocomplete answers a bare array ([] for no hits); anything else means the endpoint changed.
    if (!Array.isArray(data)) throw new SourceError("unreadable", "autocomplete did not return an array");
    return candidatesFromBest(data);
  },
};
