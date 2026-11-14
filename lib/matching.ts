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
 * A memory pair as sellers write it: "12/256GB", "8+256", "8GB/256", "12 GB / 256 GB", "16 / 1 TB" (RAM, then storage).
 * The first number has at most two digits and no digit, letter or dot before it, so "128/256GB" and "13.6/256" are not pairs.
 */
const MEMORY_PAIR = /(?<![a-zа-яөүё0-9.])(\d{1,2})\s*(gb)?\s*[/+]\s*(\d{1,4})\s*(gb|tb)?(?![a-zа-яөүё0-9])/g;
/** With no unit on the storage side, only these sizes make a pair. "12/25" stays a date. */
const STORAGE_GB = new Set(["32", "64", "128", "256", "512", "1024"]);
/** With no unit on the RAM side, only these sizes make a pair. "1/64" stays a toy car scale. */
const RAM_GB = new Set(["2", "3", "4", "6", "8", "12", "16", "18", "24", "32"]);

type ProductText = {
  tokens: string[];
  /** Numbers written in a pair without a unit. Each one also counts as that many GB. */
  loose: Set<string>;
  /** How many different memory pairs the text lists. More than one = a title for several variants. */
  variants: number;
  /** Bare numbers outside the pairs: the candidates for a model number ("13" in "Redmi 13 12/128"). */
  numbers: string[];
  /** True when a pair starts with a unitless number and nothing else in the text can be the model number ("Redmi 12/128"). */
  unsure: boolean;
};

function words(text: string) {
  return text.match(/[a-zа-яөүё0-9]+/giu)?.filter((token) => token.length > 1 || /^\d+$/.test(token)) ?? [];
}

function isPair(ram: string, ramUnit: string | undefined, size: string, sizeUnit: string | undefined) {
  return Boolean(sizeUnit || STORAGE_GB.has(size)) && Boolean(ramUnit || RAM_GB.has(ram));
}

/**
 * Tokens of a product text. A pair becomes two tokens and keeps the units as written ("8/256GB" → "8", "256gb").
 * A pair number without a unit goes into `loose`: "12" in "12/128GB" can be 12 GB of RAM or the model number
 * (iPhone 12), so the comparison accepts either reading.
 */
function tokenize(value: string): ProductText {
  const loose = new Set<string>();
  const variants = new Set<string>();
  let looseRam = false;
  const lower = value
    .toLowerCase()
    .replace(/wi[\s-]?fi/g, "wifi")
    // Cyrillic units: "256гб" → "256gb", "1 тб" → "1 tb".
    .replace(/(\d\s*)([гт])б(?![a-zа-яөүё0-9])/g, (_whole, head: string, letter: string) => `${head}${letter === "г" ? "gb" : "tb"}`);
  const text = lower.replace(MEMORY_PAIR, (whole, ram: string, ramUnit: string | undefined, size: string, sizeUnit: string | undefined) => {
    if (!isPair(ram, ramUnit, size, sizeUnit)) return whole;
    if (!ramUnit) loose.add(ram);
    if (!sizeUnit) loose.add(size);
    looseRam ||= !ramUnit;
    variants.add(`${ram}:${size}${sizeUnit ?? "gb"}`);
    return ` ${ram}${ramUnit ?? ""} ${size}${sizeUnit ?? ""} `;
  });
  const outside = words(lower.replace(MEMORY_PAIR, (whole, ram: string, ramUnit: string | undefined, size: string, sizeUnit: string | undefined) => (isPair(ram, ramUnit, size, sizeUnit) ? " " : whole)));
  const named = outside.some((token) => /\d/.test(token) && !/^(?:\d+(?:gb|tb)|[45]g)$/.test(token));
  return { tokens: words(text), loose, variants: variants.size, numbers: outside.filter((token) => /^\d+$/.test(token)), unsure: looseRam && !named };
}

export function productTokens(value: string) {
  return tokenize(value).tokens;
}

export function compareProductTitle(query: string, title: string): { match: MatchKind; confidence: number } | null {
  const asked = tokenize(query);
  const offered = tokenize(title);
  const wanted = [...new Set(asked.tokens)];
  const actual = new Set(offered.tokens);
  // "8/256" in the title also offers "8gb" and "256gb"; "8/256" in the query is also met by a title's "8gb" and "256gb".
  for (const size of offered.loose) actual.add(`${size}gb`);
  for (const size of asked.loose) if (actual.has(`${size}gb`)) actual.add(size);
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
  // One loose number in the title cannot be the model number and the RAM at once ("Redmi Note 12 12GB" vs "Redmi Note 12/256").
  const usedTwice = [...offered.loose].some((size) => wantedSet.has(size) && wantedSet.has(`${size}gb`) && !offered.tokens.includes(`${size}gb`) && offered.tokens.filter((token) => token === size).length < 2);
  // "Redmi 12/128" can mean the Redmi 12, so a title with its own model number ("Redmi 13 12GB 128GB") is not surely it.
  const otherModel = asked.unsure && offered.numbers.some((token) => !wantedSet.has(token));
  const exact = ratio >= 0.72 && importantHit === important.length && exactIdentity && !extraVariant && !extraCategory && offered.variants < 2 && !usedTwice && !otherModel;
  if (!exact && ratio < 0.42) return null;
  return { match: exact ? "exact" : "near", confidence: Math.round(Math.min(0.98, ratio * 0.86 + (exact ? 0.1 : 0)) * 100) };
}
