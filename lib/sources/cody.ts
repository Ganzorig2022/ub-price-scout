import { fetchJson } from "./shared.ts";
import type { RawCandidate, SourceDefinition } from "./types.ts";

/**
 * Cody (cody.mn) powers many UB storefronts. Their pages search through a shared
 * Elasticsearch host using a read-only "guest" login that every storefront ships
 * to the browser in its public JavaScript bundle. We use the same login the
 * browser uses, nothing more. If Cody rotates it, these stores go "blocked" and
 * the ledger says so — nothing silently pretends to have looked.
 */
const ELASTIC_HOST = "https://elastic.cody.mn";
const GUEST_AUTH = `Basic ${btoa("guest:ShoppyGuest")}`;

type CodyHit = {
  _source: {
    name?: string;
    slug?: string;
    price?: number;
    selling_price?: number;
    total_on_hand?: number;
    can_supply?: boolean;
    published?: boolean;
    currency?: string;
  };
};

type CodyResponse = { hits?: { hits?: CodyHit[] } };

type CodyStore = { seller: string; index: string; searchUrl: (q: string) => string; productUrl: (slug: string) => string };

async function searchIndex(index: string, query: string, operator: "and" | "or") {
  const body = JSON.stringify({
    size: 12,
    _source: ["name", "slug", "price", "selling_price", "total_on_hand", "can_supply", "published", "currency"],
    query: { multi_match: { query, fields: ["name^3", "title_latin"], operator, ...(operator === "or" ? { minimum_should_match: "75%" } : {}) } },
  });
  const data = await fetchJson<CodyResponse>(`${ELASTIC_HOST}/${index}/_search`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", Authorization: GUEST_AUTH },
  });
  return data?.hits?.hits ?? [];
}

export function candidatesFromHits(hits: CodyHit[], productUrl: (slug: string) => string): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (const hit of hits) {
    const source = hit._source ?? {};
    if (!source.name || source.published === false) continue;
    if (source.currency && source.currency !== "MNT") continue;
    const price = source.selling_price ?? source.price ?? null;
    const inStock = source.can_supply === true || (source.total_on_hand ?? 0) > 0;
    const stock = source.can_supply === undefined && source.total_on_hand === undefined ? "unknown" : inStock ? "in_stock" : "out_of_stock";
    out.push({ title: source.name, price: typeof price === "number" ? price : null, url: source.slug ? productUrl(source.slug) : "", stock });
  }
  return out;
}

export function codySource(store: CodyStore): SourceDefinition {
  return {
    seller: store.seller,
    method: "api",
    searchUrl: store.searchUrl,
    async search(query) {
      let hits = await searchIndex(store.index, query, "and");
      if (!hits.length) hits = await searchIndex(store.index, query, "or");
      return candidatesFromHits(hits, store.productUrl);
    },
  };
}

const enc = encodeURIComponent;

export const CODY_STORES: SourceDefinition[] = [
  codySource({ seller: "iTStore", index: "itstore", searchUrl: (q) => `https://itstore.mn/products?q=${enc(q)}&sort=normal`, productUrl: (s) => `https://itstore.mn/products/${enc(s)}` }),
  codySource({ seller: "PC Mall", index: "pcmall", searchUrl: (q) => `https://pcmall.cody.mn/mn/search?query=${enc(q)}`, productUrl: (s) => `https://pcmall.cody.mn/mn/product/${enc(s)}` }),
  codySource({ seller: "TurboTech", index: "turbotech", searchUrl: (q) => `https://turbotech.mn/mn/search?q=${enc(q)}`, productUrl: (s) => `https://turbotech.mn/mn/product/${enc(s)}` }),
  codySource({ seller: "Next Electronics", index: "next", searchUrl: (q) => `https://next.mn/mn/search?q=${enc(q)}`, productUrl: (s) => `https://next.mn/mn/product/${enc(s)}` }),
  codySource({ seller: "Gadget.mn", index: "gadget", searchUrl: (q) => `https://gadget.mn/search?q=${enc(q)}`, productUrl: (s) => `https://gadget.mn/product/${enc(s)}` }),
  codySource({ seller: "CityMall Computer", index: "citycomputer", searchUrl: (q) => `https://citymall.mn/search?q=${enc(q)}`, productUrl: (s) => `https://citymall.mn/product/${enc(s)}` }),
];
