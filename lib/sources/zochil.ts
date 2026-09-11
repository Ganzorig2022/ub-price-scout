import { fetchText, numericPrice } from "./shared.ts";
import { SourceError, type RawCandidate, type SourceDefinition } from "./types.ts";

/**
 * Zochil storefronts (segu.mn, bedrock.mn) are Next.js pages. The search page
 * only filters when the parameter is `name=`; the results are embedded in
 * `__NEXT_DATA__` as `props.pageProps.products`.
 */
type ZochilProduct = {
  id?: number | string;
  name?: string;
  price?: string | number | null;
  sale_price?: string | number | null;
  stock?: number | null;
  status?: string;
};

export function candidatesFromNextData(html: string, base: string): RawCandidate[] {
  const raw = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!raw) throw new SourceError("unreadable", "no __NEXT_DATA__");
  let products: ZochilProduct[] = [];
  try {
    const data = JSON.parse(raw) as { props?: { pageProps?: { products?: ZochilProduct[] } } };
    products = data.props?.pageProps?.products ?? [];
  } catch {
    throw new SourceError("unreadable", "malformed __NEXT_DATA__");
  }
  const out: RawCandidate[] = [];
  for (const product of products) {
    if (!product.name || (product.status && product.status !== "enabled")) continue;
    const price = numericPrice(product.sale_price) ?? numericPrice(product.price);
    const stock = product.stock === null || product.stock === undefined ? "unknown" : product.stock > 0 ? "in_stock" : "out_of_stock";
    out.push({ title: product.name, price, url: product.id ? `${base}/products/${product.id}` : base, stock });
  }
  return out;
}

export function zochilSource(seller: string, base: string): SourceDefinition {
  const searchUrl = (q: string) => `${base}/search?name=${encodeURIComponent(q)}`;
  return {
    seller,
    method: "html",
    searchUrl,
    async search(query) {
      // `name=` is a phrase filter: "iPhone 15" finds nothing unless a name contains it verbatim.
      // Retry with the query cut from the end ("Redmi Pad 2 Pro" → "Redmi Pad" → "Redmi"); the matcher filters the rest.
      const words = query.split(/\s+/).filter(Boolean);
      const prefixes = [...new Set([words.join(" "), words.slice(0, 2).join(" "), words[0] ?? ""])].filter((p) => p.length >= 3).slice(0, 3);
      for (const prefix of prefixes) {
        const { text, notFound } = await fetchText(searchUrl(prefix));
        if (notFound) continue;
        const candidates = candidatesFromNextData(text, base);
        if (candidates.length) return candidates;
      }
      return [];
    },
  };
}

export const ZOCHIL_STORES: SourceDefinition[] = [
  zochilSource("SEGU", "https://segu.mn"),
  zochilSource("BedRock", "https://bedrock.mn"),
];
