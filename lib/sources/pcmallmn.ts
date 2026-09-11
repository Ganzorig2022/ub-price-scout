import { cleanText, fetchText, numericPrice } from "./shared.ts";
import { SourceError, type RawCandidate, type SourceDefinition } from "./types.ts";

/**
 * pc-mall.mn (a different company from pcmall.cody.mn) is a Next.js app-router
 * site. The search page streams its `products` array inside `self.__next_f.push`
 * as an escaped JSON string; we unescape it and read the objects.
 */
const BASE = "https://pc-mall.mn";
const OBJECT_RE = /\{"id":"(\d{6,})"[^{}]*?"title":"([^"]{3,200})"[^{}]*?"price":"([\d.]+)"[^{}]*?\}/g;

export function candidatesFromPcMallMn(html: string): RawCandidate[] {
  const unescaped = html.replace(/\\"/g, '"');
  const out: RawCandidate[] = [];
  for (const match of unescaped.matchAll(OBJECT_RE)) {
    const segment = match[0];
    const soldOut = /"end_qty":"0"|"is_sold_out":true|"qty":"0"/.test(segment);
    out.push({ title: cleanText(match[2]), price: numericPrice(match[3]), url: `${BASE}/products/${match[1]}`, stock: soldOut ? "out_of_stock" : "unknown" });
    if (out.length >= 12) break;
  }
  return out;
}

export const PCMALL_MN: SourceDefinition = {
  seller: "PC-Mall.mn",
  method: "html",
  searchUrl: (q) => `${BASE}/search?q=${encodeURIComponent(q)}`,
  async search(query) {
    const { text, notFound } = await fetchText(`${BASE}/search?q=${encodeURIComponent(query)}`);
    if (notFound) return [];
    const candidates = candidatesFromPcMallMn(text);
    // The search page always streams a products array (the full catalogue when nothing matches);
    // finding none means the page shape changed.
    if (!candidates.length) throw new SourceError("unreadable", "no streamed products recognised");
    return candidates;
  },
};
