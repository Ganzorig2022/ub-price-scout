// Parser tests over real responses captured from each store on 2026-09-11.
// If a store changes its page or API, the matching fixture test goes red — re-capture and fix the adapter.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("Cody Elasticsearch hits → candidates (iTStore, PC Mall, TurboTech, Next, Gadget, CityMall)", async () => {
  const { candidatesFromHits, CODY_STORES } = await import("../lib/sources/cody.ts");
  const data = JSON.parse(await fixture("cody-itstore-iphone15.json"));
  const candidates = candidatesFromHits(data.hits.hits, (slug) => `https://itstore.mn/products/${slug}`);
  assert.ok(candidates.length >= 3, "expected at least three iPhone 15 hits");
  const blue = candidates.find((c) => /Blue/.test(c.title));
  assert.equal(blue.price, 4153900);
  assert.equal(blue.stock, "out_of_stock");
  assert.equal(blue.url, "https://itstore.mn/products/apple-iphone-15-128gb-blue");
  assert.equal(CODY_STORES.length, 6);
  assert.deepEqual(CODY_STORES.map((s) => s.method), Array(6).fill("api"));
});

test("Cody: unpublished and non-MNT hits are dropped, in-stock detected", async () => {
  const { candidatesFromHits } = await import("../lib/sources/cody.ts");
  const hits = [
    { _source: { name: "A", price: 100000, published: false, slug: "a" } },
    { _source: { name: "B", price: 100000, currency: "USD", slug: "b" } },
    { _source: { name: "C", price: 100000, selling_price: 90000, can_supply: true, total_on_hand: 2, slug: "c" } },
  ];
  const out = candidatesFromHits(hits, (s) => s);
  assert.deepEqual(out.map((c) => [c.title, c.price, c.stock]), [["C", 90000, "in_stock"]]);
});

test("Zochil __NEXT_DATA__ → candidates (SEGU, BedRock)", async () => {
  const { candidatesFromNextData, ZOCHIL_STORES } = await import("../lib/sources/zochil.ts");
  const candidates = candidatesFromNextData(await fixture("zochil-segu-redmi.html"), "https://segu.mn");
  assert.equal(candidates[0].title, "Redmi 15C 8GB+256GB Midnight Black");
  assert.equal(candidates[0].price, 587900);
  assert.equal(candidates[0].stock, "in_stock");
  assert.equal(candidates[0].url, "https://segu.mn/products/812715");
  assert.match(ZOCHIL_STORES[0].searchUrl("Redmi Pad"), /segu\.mn\/search\?name=Redmi%20Pad/);
  assert.throws(() => candidatesFromNextData("<html></html>", "https://segu.mn"), { name: "SourceError", state: "unreadable" });
});

test("WooCommerce Store API → candidates (x86, uTech)", async () => {
  const { candidatesFromWoo } = await import("../lib/sources/woocommerce.ts");
  const candidates = candidatesFromWoo(JSON.parse(await fixture("woo-x86-rtx4060.json")), "https://x86.mn");
  const ti = candidates.find((c) => /4060 Ti/.test(c.title));
  assert.equal(ti.price, 1350000);
  assert.equal(ti.stock, "out_of_stock");
  assert.equal(ti.url, "https://x86.mn/product/pny-xlrb-rtx-4060-ti-8gb/");
  assert.equal(candidates[0].stock, "in_stock");
  // A permalink pointing off-site is pinned back to the store, never rendered as a trusted link elsewhere.
  const spoofed = candidatesFromWoo([{ name: "RTX 4060", permalink: "https://evil.example/phish", is_in_stock: true, prices: { price: "1000000", currency_code: "MNT", currency_minor_unit: 0 } }], "https://x86.mn");
  assert.equal(spoofed[0].url, "https://x86.mn/");
});

test("Best Computers autocomplete JSON → candidates", async () => {
  const { candidatesFromBest } = await import("../lib/sources/bestcomputers.ts");
  const candidates = candidatesFromBest(JSON.parse(await fixture("best-iphone15.json")));
  assert.ok(candidates.length >= 3);
  for (const item of candidates) {
    assert.match(item.url, /^https:\/\/bestcomputers\.mn\/products\/\d+$/);
    assert.doesNotMatch(item.title, /<|>/);
  }
  // "9,900 ₮" screen protectors parse to null (below the 10,000₮ floor); a phone parses to its price.
  const phone = candidates.find((c) => /^Apple iPhone 15/.test(c.title));
  assert.ok(phone, "an iPhone 15 row exists in the fixture");
  assert.ok(phone.price >= 1_000_000, `price parsed from price_text: ${phone.price}`);
});

test("iPick server-rendered cards → candidates", async () => {
  const { candidatesFromIpick } = await import("../lib/sources/ipick.ts");
  const candidates = candidatesFromIpick(await fixture("ipick-iphone.html"));
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((c) => c.price), [72800, 72800, 72800]);
  assert.ok(candidates.every((c) => c.url.startsWith("https://ipick.mn/products/") && c.title.length > 3));
  // The captured cards are screen protectors: the registry must drop them for a phone query.
  const { toListings } = await import("../lib/sources/index.ts");
  assert.deepEqual(toListings(candidates, "iPick", "Apple iPhone 15 128GB", "https://ipick.mn/"), []);
});

test("pc-mall.mn streamed products → candidates", async () => {
  const { candidatesFromPcMallMn } = await import("../lib/sources/pcmallmn.ts");
  const candidates = candidatesFromPcMallMn(await fixture("pcmallmn-rtx.html"));
  assert.ok(candidates.length >= 2);
  assert.match(candidates[0].title, /RTX/);
  assert.equal(candidates[0].price, 5999900);
  assert.match(candidates[0].url, /^https:\/\/pc-mall\.mn\/products\/\d+$/);
});

test("registry: matching filters junk, keeps exact before near, dedupes", async () => {
  const { toListings, SOURCES, SOURCE_NAMES } = await import("../lib/sources/index.ts");
  const raw = [
    { title: "Apple iPhone 15, 128GB, Blue", price: 4153900, url: "https://x/1", stock: "out_of_stock" },
    { title: "Apple iPhone 16 Pro Max 256GB", price: 4979900, url: "https://x/2", stock: "in_stock" },
    { title: "Apple iPhone 15, 128GB, Blue", price: 4153900, url: "https://x/1", stock: "out_of_stock" },
    { title: "UGREEN Screen Protector for iPhone 15 Pro Max", price: 9900, url: "https://x/3", stock: "unknown" },
    { title: "Samsung Galaxy S24", price: 3000000, url: "https://x/4", stock: "unknown" },
  ];
  const listings = toListings(raw, "Test", "Apple iPhone 15 128GB", "https://x/search");
  assert.deepEqual(listings.map((l) => [l.match, l.url]), [["exact", "https://x/1"], ["near", "https://x/2"]]);
  assert.ok(SOURCES.length >= 14, `registry has ${SOURCES.length} sources`);
  assert.equal(new Set(SOURCE_NAMES).size, SOURCE_NAMES.length, "seller names are unique");
  for (const source of SOURCES) assert.match(source.searchUrl("x"), /^https:\/\//);
});

test("matching: a variant the query did not ask for is never exact", async () => {
  const { compareProductTitle } = await import("../lib/matching.ts");
  assert.equal(compareProductTitle("Apple iPhone 15 128GB", "Apple iPhone 15 Pro 128GB, Blue Titanium")?.match, "near");
  assert.equal(compareProductTitle("Apple iPhone 15 128GB", "Apple iPhone 15 128GB, Green")?.match, "exact");
  assert.equal(compareProductTitle("Samsung Galaxy S24 256GB", "Samsung Galaxy S24 FE 256GB")?.match, "near");
  assert.equal(compareProductTitle("MacBook Air M2 13", "Apple MacBook Air 13.6inch M2-Chip 8C 16GB 256GB")?.match, "exact");
  assert.equal(compareProductTitle("RTX 4060", "ASUS Dual GeForce RTX 4060 Ti 8GB")?.match, "near");
  // A laptop or desktop that contains the part is a different product category.
  assert.equal(compareProductTitle("RTX 4060", "Dell G15 5530 i9-13900HX 16GB 1TB SSD Nvidia RTX 4060 8GB")?.match, "near");
  assert.equal(compareProductTitle("RTX 4060", "Ryzen 5 7500F Budget Gaming PC RTX 4060")?.match, "near");
  assert.equal(compareProductTitle("RTX 4060", "Asus Dual NVIDIA Geforce RTX 4060 OC Edition 8GB GDDR6")?.match, "exact");
  assert.equal(compareProductTitle("Dell G15 i9 RTX 4060", "Dell G15 5530 i9-13900HX 16GB 1TB SSD Nvidia RTX 4060 8GB")?.match, "exact");
});

test("registry: accessories titled after a device are dropped unless asked for", async () => {
  const { looksLikeAccessory, toListings } = await import("../lib/sources/index.ts");
  assert.equal(looksLikeAccessory("MacBook Air M2 13", 'Macbook Air 13.6" M2(2022)', "https://gadget.mn/product/ctf-macbook-screen-protector-privacy"), true);
  assert.equal(looksLikeAccessory("MacBook Air M2 13", "Apple MacBook Air 13.6inch M2", "https://pcmall.cody.mn/mn/product/apple-macbook-air"), false);
  assert.equal(looksLikeAccessory("iPhone 15 case", "iPhone 15 Silicone Case", "https://x/case"), false);
  assert.equal(looksLikeAccessory("MacBook Air M2", "Macbook m2 pro air 2022 tseneglegch", "https://unegui.mn/x"), true);
  const listings = toListings([{ title: 'Macbook Air 13.6" M2(2022)', price: 188930, url: "https://gadget.mn/product/ctf-macbook-screen-protector-privacy", stock: "in_stock" }], "Gadget", "MacBook Air M2 13", "https://gadget.mn/");
  assert.deepEqual(listings, []);
});

test("registry: shortened search variants are still scored against the full query", async () => {
  const { scanSource } = await import("../lib/sources/index.ts");
  const seen = [];
  const source = {
    seller: "Fake", method: "api", searchUrl: (q) => `https://fake.example/?q=${encodeURIComponent(q)}`,
    async search(q) { seen.push(q); return q === "Samsung Galaxy S24" ? [{ title: "Samsung Galaxy S24 8GB+128GB", price: 2899900, url: "https://fake.example/p/1", stock: "in_stock" }] : []; },
  };
  const result = await scanSource(source, "Samsung Galaxy S24 256GB");
  assert.ok(seen.length >= 2, `tried variants: ${seen.join(" | ")}`);
  assert.equal(result.state, "found");
  assert.equal(result.listings[0].match, "near", "128GB is not exact for a 256GB query even though the shorter variant found it");
  assert.match(result.searchUrl, /S24%20256GB/, "ledger link keeps the full query");
});

test("report: a price far below the exact-match median is demoted, not made the cheapest offer", async () => {
  const { splitListings, summarize } = await import("../lib/report.ts");
  const row = (seller, price, extra = {}) => ({ seller, title: "Apple MacBook Air 13 M2", price, url: `https://${seller}/p`, match: "exact", stock: "in_stock", confidence: 96, checkedAt: "2026-09-11T00:00:00Z", ...extra });
  const all = [row("gadget", 255920), row("segu", 3429900), row("pcmall", 4599900), row("best", 4799900), row("itstore", 4153900, { stock: "out_of_stock" })];
  const { exact, near } = splitListings(all);
  assert.deepEqual(exact.map((l) => l.price), [3429900, 4599900, 4799900]);
  assert.deepEqual(near.map((l) => [l.price, l.match]), [[255920, "near"], [4153900, "exact"]]);
  const report = summarize("MacBook Air M2 13", 4500000, null, [{ seller: "x", searchUrl: "https://x/", state: "found", listings: all }]);
  assert.equal(report.low, 3429900);
  assert.equal(report.median, 4599900);
  assert.equal(report.verdict, "fair", "4.5M against a 4.6M median is fair; with the 255k outlier kept, the median would have shifted");
  // Two samples only: no median-based demotion, the floor needs three.
  assert.equal(splitListings([row("a", 255920), row("b", 4599900)]).exact.length, 2);
  // A real 1.4M₮ graphics card next to 4.6M–7.8M₮ gaming laptops is not an accessory: above the absolute cap it stays.
  assert.equal(splitListings([row("a", 1400000), row("b", 4599900), row("c", 6099900), row("d", 7759900)]).exact.length, 4);
});

test("adapters: a successful response in an unexpected shape is unreadable, not an empty result", async () => {
  const { candidatesFromIpick } = await import("../lib/sources/ipick.ts");
  const { candidatesFromPcMallMn } = await import("../lib/sources/pcmallmn.ts");
  assert.deepEqual(candidatesFromIpick("<html><body><p>redesigned</p></body></html>"), []);
  assert.deepEqual(candidatesFromPcMallMn("<html><body>redesigned</body></html>"), []);
  // The adapters turn that empty parse into SourceError("unreadable"); the registry surfaces it.
  const { scanSource } = await import("../lib/sources/index.ts");
  const { SourceError } = await import("../lib/sources/types.ts");
  const broken = { seller: "Redesigned", method: "html", searchUrl: () => "https://x/", search: async () => { throw new SourceError("unreadable", "no cards"); } };
  assert.equal((await scanSource(broken, "iphone 15")).state, "unreadable");
});

test("registry: an unreadable variant is never hidden behind an earlier empty variant", async () => {
  const { scanSource } = await import("../lib/sources/index.ts");
  const { SourceError } = await import("../lib/sources/types.ts");
  let calls = 0;
  const source = { seller: "Flaky", method: "html", searchUrl: (q) => `https://x/?q=${q}`, search: async () => { calls += 1; if (calls === 1) return []; throw new SourceError("unreadable", "shape changed"); } };
  const result = await scanSource(source, "Samsung Galaxy S24 256GB");
  assert.equal(calls, 2);
  assert.equal(result.state, "unreadable");
});

test("html fallback: a non-MNT JSON-LD offer is ignored, not taken as a tögrög price", async () => {
  const { candidatesFromHtml } = await import("../lib/sources/html.ts");
  const page = (currency) => `<html><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Apple iPhone 15 128GB", offers: { price: "1299000", priceCurrency: currency, availability: "InStock" } })}</script></html>`;
  assert.deepEqual(candidatesFromHtml(page("USD"), "https://arina.mn"), []);
  assert.equal(candidatesFromHtml(page("MNT"), "https://arina.mn")[0].price, 1299000);
});

test("registry: a store that keeps us waiting past its budget is reported as timed_out", async () => {
  const { scanSource } = await import("../lib/sources/index.ts");
  const slow = { seller: "Slow", method: "api", searchUrl: () => "https://slow.example/", search: () => new Promise((resolve) => setTimeout(() => resolve([]), 500)) };
  const result = await scanSource(slow, "iphone 15", 50);
  assert.equal(result.state, "timed_out");
  assert.deepEqual(result.listings, []);
});

test("registry: a source that throws is reported as blocked, never as found", async () => {
  const { scanSource } = await import("../lib/sources/index.ts");
  const result = await scanSource({ seller: "Broken", method: "api", searchUrl: () => "https://broken.example/", search: async () => { throw new TypeError("fetch failed"); } }, "iphone 15");
  assert.equal(result.state, "blocked");
  assert.deepEqual(result.listings, []);
});
