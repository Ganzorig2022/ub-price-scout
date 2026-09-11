import assert from "node:assert/strict";
import test from "node:test";

const POSTS = [
  { text: "Redmi Pad 2 Pro 8GB 256GB\nЦоо шинэ, хайрцагтай\nҮнэ: 1.6 сая₮\nУтас: 99112233", url: "https://www.facebook.com/groups/123/posts/456/?__cft__[0]=tracking&__tn__=R" },
  { text: "Redmi Pad 2 Pro 8/256 wifi, 2 сар хэрэглэсэн 1,450,000₮", url: "https://www.facebook.com/permalink.php?story_fbid=789&id=42&comment_id=9" },
  { text: "iPhone 13 128GB зарна 1.3 сая", url: "https://www.facebook.com/groups/123/posts/999/" },
  { text: "Redmi Pad 2 Pro 8GB 256GB\nЦоо шинэ, хайрцагтай\nҮнэ: 1.6 сая₮", url: "https://www.facebook.com/groups/123/posts/456/" },
  { text: "short", url: "https://www.facebook.com/groups/123/posts/1/" },
  { text: "Redmi Pad 2 Pro off-site", url: "https://evil.example/groups/123/posts/2/" },
  { text: 12345, url: "https://www.facebook.com/groups/123/posts/3/" },
];

test("collector: validates rows, strips tracking params, dedupes, extracts price and product", async () => {
  const { parseCollectedLeads } = await import("../lib/facebook-collect.ts");
  const leads = parseCollectedLeads(JSON.stringify(POSTS));
  assert.equal(leads.length, 3, "two Redmi posts (one duplicate), one iPhone; junk rows dropped");
  assert.equal(leads[0].url, "https://www.facebook.com/groups/123/posts/456/");
  assert.equal(leads[0].price, 1_600_000);
  assert.match(leads[0].query, /Redmi Pad 2 Pro/i);
  assert.doesNotMatch(leads[0].query, /99112233|сая/);
  assert.equal(leads[1].url, "https://www.facebook.com/permalink.php?story_fbid=789&id=42");
  assert.equal(leads[1].price, 1_450_000);
  assert.deepEqual(parseCollectedLeads("not json"), []);
  assert.deepEqual(parseCollectedLeads({ text: "x" }), []);
});

test("intake: Cyrillic ad words are stripped from the product line", async () => {
  const { extractProductQuery } = await import("../lib/intake.ts");
  assert.equal(extractProductQuery("Apple iPad 11 A16 256GB Wi-Fi шинэ 1.75 сая, баталгаатай"), "Apple iPad 11 A16 256GB Wi-Fi");
  assert.equal(extractProductQuery("Цоо шинэ Redmi Pad 2 Pro 8GB 256GB хайрцагтай зарна\nҮнэ: 1.6 сая₮"), "Redmi Pad 2 Pro 8GB 256GB");
  assert.equal(extractProductQuery("Samsung Galaxy S24 256GB хэрэглэсэн, яаралтай 2.1 сая"), "Samsung Galaxy S24 256GB");
  // Inside a word these are not ad words.
  assert.match(extractProductQuery("Renewed MacBook Air M2 13"), /Renewed MacBook Air M2 13/);
  // Eight digits glued to capital letters are a product code, not a phone number.
  assert.match(extractProductQuery("SN12345678A model iPhone 13 128GB зарна"), /SN12345678A model iPhone 13 128GB/);
  assert.equal(extractProductQuery("ШИНЭ Samsung Galaxy S24 256GB БАТАЛГААТАЙ"), "Samsung Galaxy S24 256GB");
});

test("share sizing: forty Cyrillic posts at the text cap fit the form body limit", async () => {
  const { MAX_LEADS, MAX_TEXT, MAX_LEADS_JSON_CHARS, MAX_SHARE_BODY_BYTES } = await import("../lib/facebook-collect.ts");
  const post = { text: "Зөөврийн компьютер Улаанбаатар ".repeat(40).slice(0, MAX_TEXT), url: "https://www.facebook.com/groups/1234567890/posts/9876543210987654/" };
  const json = JSON.stringify(Array.from({ length: MAX_LEADS }, () => post));
  assert.ok(json.length <= MAX_LEADS_JSON_CHARS, `json ${json.length} > ${MAX_LEADS_JSON_CHARS}`);
  const body = new URLSearchParams({ leads: json, token: "0123456789abcdef0123456789abcdef" }).toString();
  assert.ok(body.length <= MAX_SHARE_BODY_BYTES, `encoded ${body.length} > ${MAX_SHARE_BODY_BYTES}`);
});

test("collector: caps the number of leads", async () => {
  const { parseCollectedLeads, MAX_LEADS } = await import("../lib/facebook-collect.ts");
  const many = Array.from({ length: MAX_LEADS + 10 }, (_, i) => ({ text: `Samsung Galaxy S24 256GB зарна ${i} 2.1 сая`, url: `https://www.facebook.com/groups/1/posts/${i}/` }));
  assert.equal(parseCollectedLeads(many).length, MAX_LEADS);
});

test("collector: summary keeps a second-hand band for the queried product only", async () => {
  const { parseCollectedLeads, summarizeLeads } = await import("../lib/facebook-collect.ts");
  const leads = parseCollectedLeads(POSTS);
  const summary = summarizeLeads(leads, "Redmi Pad 2 Pro 8GB 256GB");
  assert.deepEqual(summary.matched.map((l) => l.price), [1_450_000, 1_600_000]);
  assert.equal(summary.median, 1_525_000);
  assert.equal(summary.low, 1_450_000);
  assert.equal(summary.high, 1_600_000);
  assert.equal(summary.others.length, 1);
  assert.match(summary.others[0].query, /iPhone 13/);
  const none = summarizeLeads(leads, "MacBook Air M2");
  assert.equal(none.median, null);
  assert.equal(none.matched.length, 0);
});

test("bookmarklet: self-contained, form-posts to /share, never fetches", async () => {
  const { BOOKMARKLET_SOURCE, bookmarkletHref } = await import("../lib/facebook-collect.ts");
  assert.doesNotMatch(BOOKMARKLET_SOURCE, /fetch\(|XMLHttpRequest|<script|import\(/);
  assert.match(BOOKMARKLET_SOURCE, /form\.method='POST'/);
  assert.match(BOOKMARKLET_SOURCE, /__APP__\/share/);
  assert.match(BOOKMARKLET_SOURCE, /field\.name='leads'/);
  assert.match(BOOKMARKLET_SOURCE, /\[role=article\]/);
  const href = bookmarkletHref("https://ub-price-scout.ganzo.workers.dev", "0123456789abcdef0123456789abcdef");
  assert.ok(href.startsWith("javascript:"));
  const code = decodeURIComponent(href.slice("javascript:".length));
  assert.match(code, /'https:\/\/ub-price-scout\.ganzo\.workers\.dev\/share'/);
  assert.match(code, /token\.value='0123456789abcdef0123456789abcdef'/);
  assert.doesNotMatch(code, /__APP__|__TOKEN__|\n/);
  // A malformed token is never interpolated into code.
  assert.match(decodeURIComponent(bookmarkletHref("https://x", "';alert(1);'")), /token\.value=''/);
  // It must parse as JavaScript.
  assert.doesNotThrow(() => new Function(code));
});

test("collector token: created once per browser, reused after, always 32 hex chars", async () => {
  const { readOrCreateCollectorToken, COLLECTOR_TOKEN_KEY } = await import("../lib/facebook-collect.ts");
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const first = readOrCreateCollectorToken(storage);
  assert.match(first, /^[a-f0-9]{32}$/);
  assert.equal(readOrCreateCollectorToken(storage), first);
  store.set(COLLECTOR_TOKEN_KEY, "tampered");
  assert.notEqual(readOrCreateCollectorToken(storage), "tampered");
});

test("rate limit: client key is a salted hash, never the raw IP; stable per IP", async () => {
  const { clientFingerprint, hourBucket } = await import("../lib/rate-limit.ts");
  const req = (ip) => new Request("https://x/", { headers: ip ? { "cf-connecting-ip": ip } : {} });
  const a = await clientFingerprint(req("203.0.113.7"));
  const b = await clientFingerprint(req("203.0.113.7"));
  const c = await clientFingerprint(req("203.0.113.8"));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.doesNotMatch(a, /203/);
  assert.equal(await clientFingerprint(req(null)), "anonymous");
  // Client-writable headers are ignored: no cf-connecting-ip means the shared bucket.
  assert.equal(await clientFingerprint(new Request("https://x/", { headers: { "x-forwarded-for": "1.2.3.4" } })), "anonymous");
  assert.notEqual(await clientFingerprint(req("203.0.113.7"), "other-salt"), a);
  assert.equal(hourBucket(3_600_000 * 5 + 10), 5);
});
