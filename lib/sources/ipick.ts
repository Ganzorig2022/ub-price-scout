import { absoluteUrl, cleanText, fetchText, numericPrice } from "./shared.ts";
import { SourceError, type RawCandidate, type SourceDefinition } from "./types.ts";

/**
 * ipick.mn has no server-side search: every `/products?query=…` URL returns the same
 * catalogue page and filtering happens in the browser. The catalogue is small (two pages),
 * so we read it whole and let the matcher do the filtering. Each card is
 * `<a href="/products/…"><h1>title</h1>…<p>2,980,000<span>…`.
 */
const CARD_RE = /<a\b[^>]*href="(\/products\/[^"]+)"[^>]*>\s*<h1[^>]*>([^<]+)<\/h1>[\s\S]{0,400}?<p[^>]*>\s*([\d,. ]{5,15})/gi;
const BASE = "https://ipick.mn";
const CATALOGUE_PAGES = [1, 2];
const MAX_CARDS = 400;

export function candidatesFromIpick(html: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const match of html.matchAll(CARD_RE)) {
    out.push({ title: cleanText(match[2]), price: numericPrice(match[3]), url: absoluteUrl(match[1], BASE), stock: "unknown" });
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

export const IPICK: SourceDefinition = {
  seller: "iPick",
  method: "html",
  searchUrl: (q) => `${BASE}/products?query=${encodeURIComponent(q)}`,
  async search() {
    const pages = await Promise.all(CATALOGUE_PAGES.map((page) => fetchText(`${BASE}/products?page=${page}`)));
    const readable = pages.filter((page) => !page.notFound);
    if (!readable.length) return [];
    const candidates = readable.flatMap((page) => candidatesFromIpick(page.text));
    // A catalogue page with no recognisable card means the markup changed, not that the shop is empty.
    if (!candidates.length) throw new SourceError("unreadable", "no product cards recognised");
    return candidates;
  },
};
