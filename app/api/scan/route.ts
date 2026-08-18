import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { scans } from "../../../db/schema";

export const dynamic = "force-dynamic";

type MatchKind = "exact" | "near";

type Listing = {
  seller: string;
  title: string;
  price: number;
  url: string;
  match: MatchKind;
  stock: "in_stock" | "out_of_stock" | "unknown";
  confidence: number;
  checkedAt: string;
  note?: string;
};

type SourceResult = {
  seller: string;
  searchUrl: string;
  state: "found" | "no_match" | "blocked" | "timed_out";
  listings: Listing[];
};

type SourceDefinition = { seller: string; host: string; url: (query: string) => string; sitemaps?: string[] };

const SOURCES: SourceDefinition[] = [
  { seller: "Best Computers", host: "bestcomputers.mn", url: (q: string) => `https://bestcomputers.mn/index.php?route=product/search&search=${q}` },
  { seller: "iTStore", host: "itstore.mn", url: (q: string) => `https://itstore.mn/search?q=${q}`, sitemaps: ["https://itstore.mn/sitemap/products.xml?page=1", "https://itstore.mn/sitemap/products.xml?page=2", "https://itstore.mn/sitemap/products.xml?page=3"] },
  { seller: "SEGU", host: "segu.mn", url: (q: string) => `https://segu.mn/search?q=${q}` },
  { seller: "PC Mall", host: "pcmall.cody.mn", url: (q: string) => `https://pcmall.cody.mn/search?query=${q}` },
  { seller: "iPick", host: "ipick.mn", url: (q: string) => `https://ipick.mn/search?query=${q}` },
  { seller: "TurboTech", host: "turbotech.mn", url: (q: string) => `https://turbotech.mn/mn/search?q=${q}` },
  { seller: "Arina", host: "arina.mn", url: (q: string) => `https://arina.mn/search?q=${q}` },
  { seller: "BedRock", host: "bedrock.mn", url: (q: string) => `https://bedrock.mn/search?q=${q}` },
  { seller: "Unegui", host: "www.unegui.mn", url: (q: string) => `https://www.unegui.mn/kompyuter-busad/?q=${q}` },
] as const;

const IMPORTANT_TOKEN = /^(?:\d{2,4}(?:gb|tb)|wifi|wi-fi|cellular|lte|5g|a\d{1,2}|m\d|pro|max|plus|ultra|mini)$/i;
const PRICE_RE = /(?:₮|MNT|Үнэ[:\s]*)\s*([\d,. ]{5,15})|([\d,. ]{5,15})\s*(?:₮|MNT|төг(?:рөг)?)/gi;

function cleanText(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;|&#34;/gi, '"').replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return value.toLowerCase().replace(/wi[\s-]?fi/g, "wifi").match(/[a-zа-яөүё0-9]+/giu)?.filter((token) => token.length > 1) ?? [];
}

function compareTitle(query: string, title: string): { match: MatchKind; confidence: number } | null {
  const wanted = [...new Set(tokens(query))];
  const actual = new Set(tokens(title));
  if (!wanted.length) return null;
  const hit = wanted.filter((token) => actual.has(token)).length;
  const ratio = hit / wanted.length;
  const important = wanted.filter((token) => IMPORTANT_TOKEN.test(token));
  const importantHit = important.filter((token) => actual.has(token)).length;
  const exact = ratio >= 0.72 && importantHit === important.length;
  if (!exact && ratio < 0.42) return null;
  return { match: exact ? "exact" : "near", confidence: Math.round(Math.min(0.98, ratio * 0.86 + (exact ? 0.1 : 0)) * 100) };
}

function priceFrom(value: string) {
  PRICE_RE.lastIndex = 0;
  const match = PRICE_RE.exec(value);
  if (!match) return null;
  const amount = Number((match[1] ?? match[2]).replace(/[^\d]/g, ""));
  return amount >= 10_000 && amount <= 500_000_000 ? amount : null;
}

function absoluteUrl(href: string, base: string) {
  try {
    const baseUrl = new URL(base);
    const resolved = new URL(href, baseUrl);
    const sameRetailer = resolved.hostname === baseUrl.hostname || resolved.hostname.endsWith(`.${baseUrl.hostname}`) || baseUrl.hostname.endsWith(`.${resolved.hostname}`);
    return resolved.protocol === "https:" && sameRetailer ? resolved.toString() : baseUrl.toString();
  } catch { return base; }
}

function listingFromObject(value: unknown, seller: string, base: string, query: string): Listing | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const title = String(item.name ?? item.title ?? item.productName ?? "").trim();
  if (!title) return null;
  const offer = (item.offers && typeof item.offers === "object" ? item.offers : item) as Record<string, unknown>;
  const rawPrice = offer.price ?? offer.lowPrice ?? item.price ?? item.salePrice;
  const numericText = String(rawPrice ?? "").replace(/[,\s]/g, "");
  const directPrice = /^\d+(?:\.\d{1,2})?$/.test(numericText) ? Number(numericText) : null;
  const price = typeof rawPrice === "number" ? rawPrice : directPrice && directPrice >= 10_000 ? directPrice : priceFrom(String(rawPrice ?? ""));
  const comparison = compareTitle(query, title);
  if (!price || !comparison) return null;
  const rawAvailability = String(offer.availability ?? item.availability ?? "").toLowerCase();
  const stock = rawAvailability.includes("outofstock") || rawAvailability.includes("sold") ? "out_of_stock" : rawAvailability.includes("instock") ? "in_stock" : "unknown";
  const rawUrl = String(item.url ?? offer.url ?? item.slug ?? base);
  return { seller, title: cleanText(title).slice(0, 180), price, url: absoluteUrl(rawUrl, base), match: comparison.match, confidence: comparison.confidence, stock, checkedAt: new Date().toISOString() };
}

function walkProducts(value: unknown, seller: string, base: string, query: string, found: Listing[], depth = 0) {
  if (depth > 10 || found.length >= 10 || !value) return;
  if (Array.isArray(value)) {
    for (const item of value) walkProducts(item, seller, base, query, found, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const listing = listingFromObject(value, seller, base, query);
  if (listing) found.push(listing);
  for (const child of Object.values(value as Record<string, unknown>)) walkProducts(child, seller, base, query, found, depth + 1);
}

function parseListings(html: string, seller: string, base: string, query: string): Listing[] {
  const found: Listing[] = [];
  const jsonBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonBlocks) {
    try { walkProducts(JSON.parse(block[1]), seller, base, query, found); } catch { /* malformed publisher data */ }
  }
  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (nextData) {
    try { walkProducts(JSON.parse(nextData), seller, base, query, found); } catch { /* malformed application data */ }
  }
  if (!found.length) {
    const embedded = html.replace(/\\"/g, '"');
    for (const match of embedded.matchAll(/"name":"([^"<>]{3,180})"/gi)) {
      const title = cleanText(match[1]);
      const comparison = compareTitle(query, title);
      if (!comparison || match.index === undefined) continue;
      const segment = embedded.slice(match.index, match.index + 5000);
      const rawPrice = segment.match(/"sellingPrice":(\d+(?:\.\d+)?)/i)?.[1] ?? segment.match(/"price":(\d+(?:\.\d+)?)/i)?.[1];
      const price = rawPrice ? Number(rawPrice) : null;
      if (!price || price < 10_000 || price > 500_000_000) continue;
      const stock = /"(?:canSupply|inStock)":true/i.test(segment) || /"totalOnHand":(?:[1-9]\d*)/i.test(segment) ? "in_stock" : /"(?:canSupply|inStock)":false/i.test(segment) ? "out_of_stock" : "unknown";
      found.push({ seller, title: title.slice(0, 180), price, url: base, match: comparison.match, confidence: comparison.confidence, stock, checkedAt: new Date().toISOString(), note: "Дэлгүүрийн барааны өгөгдлөөс үнийг уншив" });
      if (found.length >= 8) break;
    }
  }
  if (!found.length) {
    const anchors = html.matchAll(/<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi);
    for (const anchor of anchors) {
      const title = cleanText(anchor[3]);
      const nearby = cleanText(anchor[0]);
      const price = priceFrom(nearby);
      const comparison = compareTitle(query, title);
      if (price && comparison) found.push({ seller, title: title.slice(0, 180), price, url: absoluteUrl(anchor[2], base), match: comparison.match, confidence: Math.min(comparison.confidence, 78), stock: "unknown", checkedAt: new Date().toISOString(), note: "Хайлтын үр дүнгээс үнийг уншив" });
      if (found.length >= 8) break;
    }
  }
  const unique = new Map<string, Listing>();
  for (const item of found) {
    const key = `${item.url}|${item.price}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 6);
}

function candidateLinks(html: string, base: string, host: string, query: string) {
  const candidates = new Map<string, number>();
  const anchors = html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const anchor of anchors) {
    const title = cleanText(anchor[2]);
    const comparison = compareTitle(query, title);
    if (!comparison) continue;
    try {
      const url = new URL(anchor[1], base);
      if (url.protocol !== "https:" || !(url.hostname === host || url.hostname.endsWith(`.${host}`))) continue;
      if (/search|login|cart|category|collection/i.test(url.pathname)) continue;
      const previous = candidates.get(url.toString()) ?? 0;
      candidates.set(url.toString(), Math.max(previous, comparison.confidence));
    } catch { /* publisher emitted an invalid link */ }
  }
  return [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([url]) => url);
}

async function fetchProductPages(links: string[], seller: string, query: string) {
  const pages = await Promise.allSettled(links.slice(0, 1).map(async (url) => {
    const productResponse = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; UBPriceScout/1.0; public price research)", Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(5000) });
    if (!productResponse.ok) return [];
    const productHtml = (await productResponse.text()).slice(0, 1_400_000);
    return parseListings(productHtml, seller, productResponse.url || url, query);
  }));
  return pages.flatMap((page) => page.status === "fulfilled" ? page.value : []).slice(0, 6);
}

async function sitemapCandidates(source: SourceDefinition, query: string) {
  if (!source.sitemaps?.length) return [];
  const maps = await Promise.allSettled(source.sitemaps.map(async (url) => {
    const response = await fetch(url, { headers: { "User-Agent": "UBPriceScout/1.0" }, signal: AbortSignal.timeout(5000) });
    return response.ok ? (await response.text()).slice(0, 1_200_000) : "";
  }));
  const candidates = new Map<string, number>();
  for (const map of maps) {
    if (map.status !== "fulfilled") continue;
    for (const match of map.value.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/gi)) {
      try {
        const url = new URL(match[1].replace(/&amp;/g, "&"));
        if (!(url.hostname === source.host || url.hostname.endsWith(`.${source.host}`))) continue;
        const comparison = compareTitle(query, decodeURIComponent(url.pathname).replace(/[-_/]/g, " "));
        if (comparison) candidates.set(url.toString(), comparison.confidence);
      } catch { /* skip malformed sitemap locations */ }
    }
  }
  return [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([url]) => url);
}

async function scanSource(source: SourceDefinition, query: string): Promise<SourceResult> {
  const searchUrl = source.url(encodeURIComponent(query));
  try {
    const response = await fetch(searchUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; UBPriceScout/1.0; public price research)", Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(7000) });
    if (!response.ok) return { seller: source.seller, searchUrl, state: response.status === 403 || response.status === 429 ? "blocked" : "no_match", listings: [] };
    const html = (await response.text()).slice(0, 900_000);
    let listings = parseListings(html, source.seller, response.url || searchUrl, query);
    if (!listings.length) {
      let links = candidateLinks(html, response.url || searchUrl, source.host, query);
      if (!links.length) links = await sitemapCandidates(source, query);
      listings = await fetchProductPages(links, source.seller, query);
    }
    return { seller: source.seller, searchUrl, state: listings.length ? "found" : "no_match", listings };
  } catch (error) {
    return { seller: source.seller, searchUrl, state: error instanceof Error && error.name === "TimeoutError" ? "timed_out" : "blocked", listings: [] };
  }
}

function summarize(query: string, targetPrice: number | null, listingUrl: string | null, sourceResults: SourceResult[]) {
  const all = sourceResults.flatMap((source) => source.listings);
  const exact = all.filter((item) => item.match === "exact" && item.stock !== "out_of_stock").sort((a, b) => a.price - b.price);
  const near = all.filter((item) => item.match === "near" || item.stock === "out_of_stock").sort((a, b) => a.price - b.price);
  const livePrices = exact.map((item) => item.price);
  const midpoint = Math.floor(livePrices.length / 2);
  const median = !livePrices.length ? null : livePrices.length % 2 ? livePrices[midpoint] : Math.round((livePrices[midpoint - 1] + livePrices[midpoint]) / 2);
  const low = livePrices.length ? livePrices[0] : null;
  const high = livePrices.length ? livePrices[livePrices.length - 1] : null;
  let verdict: "great" | "fair" | "high" | "insufficient" = "insufficient";
  if (targetPrice && median) verdict = targetPrice <= median * 0.92 ? "great" : targetPrice <= median * 1.08 ? "fair" : "high";
  return { query, targetPrice, listingUrl, verdict, median, low, high, exact, near, sources: sourceResults, checkedAt: new Date().toISOString() };
}

function validPayload(value: unknown): { query: string; targetPrice: number | null; listingUrl: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const query = typeof raw.query === "string" ? raw.query.trim().slice(0, 180) : "";
  const targetPrice = typeof raw.targetPrice === "number" && Number.isFinite(raw.targetPrice) && raw.targetPrice > 0 ? Math.round(raw.targetPrice) : null;
  let listingUrl: string | null = null;
  if (typeof raw.listingUrl === "string" && raw.listingUrl.trim()) {
    try { const parsed = new URL(raw.listingUrl.trim().slice(0, 1000)); listingUrl = parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null; } catch { return null; }
  }
  return query.length >= 3 ? { query, targetPrice, listingUrl } : null;
}

async function rateLimit(request: Request) {
  try {
    const fingerprint = "global-hourly-scan-budget";
    const bucket = Math.floor(Date.now() / 3_600_000);
    const result = await env.DB.prepare(`
      INSERT INTO scan_limits (fingerprint, bucket, count)
      VALUES (?, ?, 1)
      ON CONFLICT(fingerprint) DO UPDATE SET
        bucket = excluded.bucket,
        count = CASE WHEN scan_limits.bucket = excluded.bucket THEN scan_limits.count + 1 ELSE 1 END
      RETURNING count
    `).bind(fingerprint, bucket).first<{ count: number }>();
    return (result?.count ?? 1) <= 60 ? "allowed" : "limited";
  } catch {
    return new URL(request.url).hostname === "localhost" ? "allowed" : "unavailable";
  }
}

export async function POST(request: Request) {
  const payload = validPayload(await request.json().catch(() => null));
  if (!payload) return Response.json({ error: "Барааг тодорхойлсон гурваас доошгүй тэмдэгт оруулна уу." }, { status: 400 });
  const limit = await rateLimit(request);
  if (limit === "limited") return Response.json({ error: "Энэ цагийн бодит үнийн хайлтын хязгаар дууслаа. Хадгалсан тайлан болон дэлгүүрийн холбоосууд нээлттэй хэвээр байна. Дараагийн цагт дахин оролдоно уу." }, { status: 429, headers: { "retry-after": "3600" } });
  if (limit === "unavailable") return Response.json({ error: "Аюулгүйн хязгаар шинэчлэгдэж байгаа тул бодит үнийн хайлт түр боломжгүй байна. Удахгүй дахин оролдоно уу." }, { status: 503, headers: { "retry-after": "120" } });
  const results = await Promise.all(SOURCES.map((source) => scanSource(source, payload.query)));
  const report = summarize(payload.query, payload.targetPrice, payload.listingUrl, results);
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  let persisted = true;
  try {
    await getDb().insert(scans).values({ id, query: payload.query, targetPrice: payload.targetPrice, report: JSON.stringify(report), createdAt: Date.now() });
  } catch { persisted = false; }
  return Response.json({ id: persisted ? id : null, persisted, report });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.slice(0, 32);
  if (!id) return Response.json({ error: "Тайлангийн дугаар дутуу байна." }, { status: 400 });
  try {
    const row = await getDb().select().from(scans).where(eq(scans.id, id)).limit(1);
    if (!row[0]) return Response.json({ error: "Тайлан олдсонгүй." }, { status: 404 });
    return Response.json({ id: row[0].id, report: JSON.parse(row[0].report) });
  } catch {
    return Response.json({ error: "Хадгалсан тайлангууд түр хугацаанд нээгдэхгүй байна." }, { status: 503 });
  }
}
