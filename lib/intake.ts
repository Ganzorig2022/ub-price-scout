export type IntakeDiagnostic =
  | "query_from_text"
  | "price_found"
  | "price_missing"
  | "needs_confirmation";

export type IntakeDraft = {
  query: string;
  targetPrice: number | null;
  confidence: number;
  diagnostics: IntakeDiagnostic[];
};

export type SharedIntake = {
  draft: IntakeDraft;
  listingUrl: string;
  postText: string;
};

type SharedPayload = { title?: unknown; text?: unknown; url?: unknown };

const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.watch"]);
const FACEBOOK_PUBLIC_PARAMS = new Set(["fbid", "set", "story_fbid", "id"]);

export function facebookListingUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 1_000) return null;
  try {
    const url = new URL(raw.trim());
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    if (!FACEBOOK_HOSTS.has(hostname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (!FACEBOOK_PUBLIC_PARAMS.has(key)) url.searchParams.delete(key);
    return url;
  } catch {
    return null;
  }
}

const PRODUCT_BRANDS = /\b(?:apple|iphone|ipad|macbook|samsung|galaxy|xiaomi|redmi|poco|huawei|honor|lenovo|asus|acer|dell|hp|sony|playstation|nintendo|canon|nikon|dyson|lg)\b/i;
const PRODUCT_SPECS = /\b(?:\d{1,4}\s?(?:gb|tb)|wi[\s-]?fi|cellular|lte|5g|pro|max|plus|ultra|mini|air|gen(?:eration)?|inch)\b/i;
const NOISE_LINE = /(?:утас|холбогдох|дугаар|хаяг|байршил|хүргэлт|лизинг|зээл|storepay|qpay|үнэ|price|₮|төгрөг|сая|зарах үнэ)/i;

function plausiblePrice(value: number) {
  return Number.isFinite(value) && value >= 10_000 && value <= 500_000_000;
}

export function extractAskingPrice(text: string): number | null {
  const normalized = text.replace(/\u00a0/g, " ");
  const candidates: Array<{ value: number; score: number; index: number }> = [];

  for (const match of normalized.matchAll(/(\d{1,3}(?:[\s,.]\d{3}){1,3}|\d{5,9})\s*(₮|төг(?:рөг)?|mnt)?/giu)) {
    const value = Number(match[1].replace(/[^\d]/g, ""));
    if (!plausiblePrice(value)) continue;
    const context = normalized.slice(Math.max(0, (match.index ?? 0) - 16), (match.index ?? 0) + match[0].length + 16);
    if (/(?:утас|phone|холбогдох|дугаар)\s*[:：-]?\s*$/i.test(context.slice(0, context.indexOf(match[0])))) continue;
    const score = /(?:үнэ|price|₮|төг|mnt)/i.test(context) ? 4 : 1;
    candidates.push({ value, score, index: match.index ?? 0 });
  }

  for (const match of normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(сая|say|million|мянга|мян|k)(?![a-zа-яөүё])/giu)) {
    const numeric = Number(match[1].replace(",", "."));
    const multiplier = /^(?:сая|say|million)$/i.test(match[2]) ? 1_000_000 : 1_000;
    const value = Math.round(numeric * multiplier);
    if (plausiblePrice(value)) candidates.push({ value, score: 5, index: match.index ?? 0 });
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]?.value ?? null;
}

// `\b` only knows Latin letters, even with the `u` flag, so Cyrillic words need explicit boundaries.
// Both cases are listed: the phone regex below has no `i` flag, and a class must not depend on one.
const WORD = "[a-zA-Zа-яА-ЯөүёӨҮЁ0-9]";
const AD_WORDS = /(?<![a-zA-Zа-яА-ЯөүёӨҮЁ0-9])(?:зарна|зарж байна|худалдана|худалдаалж байна|солино|яаралтай|цоо шинэ|шинэ|хуучин|бэлэн|хямд|баталгаатай|баталгаагүй|хайрцагтай|хайрцаггүй|хэрэглэсэн|гэрээтэй|гэрээгүй|sealed|brand new|new|used)(?![a-zA-Zа-яА-ЯөүёӨҮЁ0-9])/giu;

function cleanCandidate(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(new RegExp(`(?:\\+?976[-\\s]?)?(?<!${WORD})\\d{8}(?!${WORD})`, "gu"), " ")
    .replace(/[#•●▪]/gu, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(AD_WORDS, " ")
    .replace(/(?:үнэ|price)\s*[:：-]?\s*\d[\d\s,.]*(?:₮|төг(?:рөг)?|mnt|сая|say|million|мянга|мян|k)?/giu, " ")
    .replace(/\d[\d\s,.]*(?:₮|төг(?:рөг)?|mnt|сая|say|million)(?![a-zа-яөүё])/giu, " ")
    .replace(/₮/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/^[\s:,.;–—-]+|[\s:,.;–—-]+$/g, "")
    .trim();
}

export function extractProductQuery(text: string): string {
  const lines = text
    .split(/\r?\n|[|]/)
    .map(cleanCandidate)
    .filter((line) => line.length >= 3 && line.length <= 180)
    .filter((line) => !NOISE_LINE.test(line));

  const ranked = lines
    .map((line, index) => ({
      line,
      score:
        (PRODUCT_BRANDS.test(line) ? 6 : 0) +
        (PRODUCT_SPECS.test(line) ? 4 : 0) +
        (/\d/.test(line) ? 2 : 0) +
        (line.split(/\s+/).length <= 12 ? 2 : 0) -
        index * 0.05,
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.line ?? cleanCandidate(text).slice(0, 180);
  return best.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function extractIntakeDraft(text: string): IntakeDraft {
  const query = extractProductQuery(text);
  const targetPrice = extractAskingPrice(text);
  const confidence = Math.min(95, (query ? 45 : 0) + (PRODUCT_BRANDS.test(query) ? 25 : 0) + (PRODUCT_SPECS.test(query) ? 15 : 0) + (targetPrice ? 10 : 0));
  return {
    query,
    targetPrice,
    confidence,
    diagnostics: [
      ...(query ? ["query_from_text" as const] : []),
      targetPrice ? "price_found" : "price_missing",
      "needs_confirmation",
    ],
  };
}

export function extractSharedPayload(value: unknown): SharedIntake | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as SharedPayload;
  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 500) : "";
  const text = typeof payload.text === "string" ? payload.text.trim().slice(0, 8_000) : "";
  const explicitUrl = typeof payload.url === "string" ? payload.url.trim().slice(0, 1_000) : "";
  const combined = [title, text].filter(Boolean).join("\n");
  const embeddedUrl = combined.match(/https:\/\/[^\s<>"']+/i)?.[0] ?? "";
  const listing = facebookListingUrl(explicitUrl) ?? facebookListingUrl(embeddedUrl);
  const postText = [combined, listing?.toString() && !combined.includes(listing.toString()) ? listing.toString() : ""].filter(Boolean).join("\n");
  if (!postText) return null;
  return { draft: extractIntakeDraft(postText), listingUrl: listing?.toString() ?? "", postText };
}

export function extractSharedIntake(search: string): SharedIntake | null {
  const params = new URLSearchParams(search);
  if (params.get("shared") !== "1") return null;
  return extractSharedPayload({ title: params.get("title"), text: params.get("text"), url: params.get("url") });
}

export function queryVariants(query: string): string[] {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const withoutFluff = cleanCandidate(normalized);
  const core = withoutFluff
    .split(/\s+/)
    .filter((token) => !/^(?:\d{1,4}(?:gb|tb)|wifi|wi-fi|cellular|lte|5g|шинэ)$/i.test(token))
    .join(" ");
  const variants = [normalized];
  if (/\b(?:redmi|poco)\b/i.test(withoutFluff) && !/\bxiaomi\b/i.test(withoutFluff)) {
    variants.push(`Xiaomi ${withoutFluff}`);
  }
  variants.push(withoutFluff, core);
  return [...new Set(variants.map((value) => value.trim()).filter((value) => value.length >= 3))].slice(0, 3);
}
