export type MatchKind = "exact" | "near";

const IMPORTANT_TOKEN = /^(?:\d{1,4}|\d{1,4}(?:gb|tb)|wifi|wi-fi|cellular|lte|5g|a\d{1,2}|m\d|pro|max|plus|ultra|mini)$/i;
const WEAK_TOKEN = /^(?:\d{1,4}|\d{1,4}(?:gb|tb)|wifi|wi-fi|cellular|lte|5g|pro|max|plus|ultra|mini|air|new|шинэ)$/i;
const MANUFACTURER_TOKEN = /^(?:apple|samsung|xiaomi|huawei|honor|lenovo|asus|acer|dell|hp|sony|nintendo|canon|nikon|dyson|lg)$/i;
const FAMILY_TOKEN = /^(?:iphone|ipad|macbook|airpods|watch|galaxy|redmi|poco|pad|tab|note|book|buds|playstation|switch)$/i;
/** A title carrying one of these that the query does not is a different variant (iPhone 15 vs 15 Pro), never "exact". */
const VARIANT_TOKEN = /^(?:pro|max|plus|ultra|mini|air|fe|lite|neo|se|edge|fold|flip|ti|super|xt)$/i;
/** A whole computer whose title merely contains the part you asked for ("Dell G15 i9 … RTX 4060") is not that part. */
const CATEGORY_TOKEN = /^(?:i[3579]|ryzen|core|notebook|laptop|ноутбук|зөөврийн|desktop|суурин|workstation|nuc|allinone)$/i;

export function productTokens(value: string) {
  return value.toLowerCase().replace(/wi[\s-]?fi/g, "wifi").match(/[a-zа-яөүё0-9]+/giu)?.filter((token) => token.length > 1 || /^\d+$/.test(token)) ?? [];
}

export function compareProductTitle(query: string, title: string): { match: MatchKind; confidence: number } | null {
  const wanted = [...new Set(productTokens(query))];
  const actual = new Set(productTokens(title));
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
