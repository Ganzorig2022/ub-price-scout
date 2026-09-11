import { absoluteUrl, fetchJson } from "./shared.ts";
import { SourceError, type RawCandidate, type SourceDefinition } from "./types.ts";

/** WooCommerce Store API — public, read-only, JSON. Used by x86.mn and utech.mn. */
type WooProduct = {
  name?: string;
  permalink?: string;
  is_in_stock?: boolean;
  prices?: { price?: string; currency_code?: string; currency_minor_unit?: number };
};

export function candidatesFromWoo(products: WooProduct[], base: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const product of products) {
    if (!product.name || !product.prices?.price) continue;
    if (product.prices.currency_code && product.prices.currency_code !== "MNT") continue;
    const minor = product.prices.currency_minor_unit ?? 0;
    const price = Math.round(Number(product.prices.price) / 10 ** minor);
    // permalink comes from the store's JSON; pin it to the store's own https host like every other adapter.
    out.push({ title: product.name, price: Number.isFinite(price) ? price : null, url: absoluteUrl(product.permalink ?? "", base), stock: product.is_in_stock === undefined ? "unknown" : product.is_in_stock ? "in_stock" : "out_of_stock" });
  }
  return out;
}

export function wooSource(seller: string, base: string): SourceDefinition {
  return {
    seller,
    method: "api",
    searchUrl: (q) => `${base}/?s=${encodeURIComponent(q)}&post_type=product`,
    async search(query) {
      const data = await fetchJson<WooProduct[]>(`${base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(query)}&per_page=12`);
      if (data === null) return [];
      // The Store API answers a bare array; an object here is an error envelope or a changed API.
      if (!Array.isArray(data)) throw new SourceError("unreadable", "Store API did not return a product array");
      return candidatesFromWoo(data, base);
    },
  };
}

export const WOO_STORES: SourceDefinition[] = [
  wooSource("x86", "https://x86.mn"),
  wooSource("uTech", "https://utech.mn"),
];
