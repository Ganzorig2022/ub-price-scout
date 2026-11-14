export type MatchKind = "exact" | "near";

const IMPORTANT_TOKEN = /^(?:\d{1,4}|\d{1,4}(?:gb|tb)|wifi|wi-fi|cellular|lte|5g|a\d{1,2}|m\d|pro|max|plus|ultra|mini)$/i;
const WEAK_TOKEN = /^(?:\d{1,4}|\d{1,4}(?:gb|tb)|wifi|wi-fi|cellular|lte|5g|pro|max|plus|ultra|mini|air|new|шинэ)$/i;
const MANUFACTURER_TOKEN = /^(?:apple|samsung|xiaomi|huawei|honor|lenovo|asus|acer|dell|hp|sony|nintendo|canon|nikon|dyson|lg)$/i;
const FAMILY_TOKEN = /^(?:iphone|ipad|macbook|airpods|watch|galaxy|redmi|poco|pad|tab|note|book|buds|playstation|switch)$/i;
/** A title carrying one of these that the query does not is a different variant (iPhone 15 vs 15 Pro), never "exact". */
const VARIANT_TOKEN = /^(?:pro|max|plus|ultra|mini|air|fe|lite|neo|se|edge|fold|flip|ti|super|xt)$/i;
/** A whole computer whose title merely contains the part you asked for ("Dell G15 i9 … RTX 4060") is not that part. */
const CATEGORY_TOKEN = /^(?:i[3579]|ryzen|core|notebook|laptop|ноутбук|зөөврийн|desktop|суурин|workstation|nuc|allinone)$/i;

/**
 * A memory pair as sellers write it: "12/256GB", "8+256", "8GB/256", "16 / 1 TB" (RAM, then storage).
 * The first number has at most two digits and no digit, letter or dot before it, so "128/256GB" and "13.6/256" are not pairs.
 */
const MEMORY_PAIR = /(?<![a-z0-9.])(\d{1,2})(gb)?\s*[/+]\s*(\d{1,4})\s*(gb|tb)?(?![a-z0-9])/g;
/** With no unit on the storage side, only these sizes make a pair. "12/25" stays a date. */
const STORAGE_GB = new Set(["32", "64", "128", "256", "512", "1024"]);

/**
 * Tokens of a product text. In a pair the storage side always gets its unit ("8/256" → "8", "256gb").
 * A first number without a unit stays bare and goes into `loose`: in "12/128GB" it can be 12 GB of RAM
 * or the model number (iPhone 12), so the comparison accepts either reading.
 */
function tokenize(value: string): { tokens: string[]; loose: Set<string> } {
  const loose = new Set<string>();
  const text = value.toLowerCase().replace(/wi[\s-]?fi/g, "wifi").replace(MEMORY_PAIR, (whole, ram: string, ramUnit: string | undefined, size: string, sizeUnit: string | undefined) => {
    if (!sizeUnit && !STORAGE_GB.has(size)) return whole;
    if (!ramUnit) loose.add(ram);
    return `${ram}${ramUnit ?? ""} ${size}${sizeUnit ?? "gb"}`;
  });
  return { tokens: text.match(/[a-zа-яөүё0-9]+/giu)?.filter((token) => token.length > 1 || /^\d+$/.test(token)) ?? [], loose };
}

export function productTokens(value: string) {
  return tokenize(value).tokens;
}

export function compareProductTitle(query: string, title: string): { match: MatchKind; confidence: number } | null {
  const asked = tokenize(query);
  const offered = tokenize(title);
  const wanted = [...new Set(asked.tokens)];
  const actual = new Set(offered.tokens);
  // "12/256GB" in the title also offers "12gb"; "12/256GB" in the query is also met by a title's "12gb".
  for (const ram of offered.loose) actual.add(`${ram}gb`);
  for (const ram of asked.loose) if (actual.has(`${ram}gb`)) actual.add(ram);
  if (!wanted.length) return null;
  const identity = wanted.filter((token) => !WEAK_TOKEN.test(token));
  if (!identity.length) return null;
  const identityHit = identity.filter((token) => actual.has(token)).length;
  if (!identityHit) return null;
  const wantedManufacturers = identity.filter((token) => MANUFACTURER_TOKEN.test(token));
  const actualManufacturers = [...actual].filter((token) => MANUFACTURER_TOKEN.test(token));
  if (wantedManufacturers.length && actualManufacturers.length && !wantedManufacturers.some((token) => actual.has(token))) return null;
  const requestedFamilies = identity.filter((token) => FAMILY_TOKEN.test(token));
  if (requestedFamilies.some((token) => !actual.has(token))) return null;
  const familyIdentity = identity.filter((token) => !MANUFACTURER_TOKEN.test(token));
  const familyIdentityHit = familyIdentity.filter((token) => actual.has(token)).length;
  const hit = wanted.filter((token) => actual.has(token)).length;
  const ratio = hit / wanted.length;
  const important = wanted.filter((token) => IMPORTANT_TOKEN.test(token));
  const importantHit = important.filter((token) => actual.has(token)).length;
  const exactIdentity = familyIdentity.length ? familyIdentityHit === familyIdentity.length : identityHit === identity.length;
  const wantedSet = new Set(wanted);
  const extraVariant = [...actual].some((token) => VARIANT_TOKEN.test(token) && !wantedSet.has(token));
  const extraCategory = !wanted.some((token) => CATEGORY_TOKEN.test(token)) && [...actual].some((token) => CATEGORY_TOKEN.test(token));
  const exact = ratio >= 0.72 && importantHit === important.length && exactIdentity && !extraVariant && !extraCategory;
  if (!exact && ratio < 0.42) return null;
  return { match: exact ? "exact" : "near", confidence: Math.round(Math.min(0.98, ratio * 0.86 + (exact ? 0.1 : 0)) * 100) };
}
