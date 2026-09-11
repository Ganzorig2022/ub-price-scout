import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScriptModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function request(path = "/", init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, init ?? { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the product scanner", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /УБ Үнэ Тандагч/);
  assert.match(html, /Авахаасаа өмнө/);
  assert.match(html, /Facebook зар/);
  assert.match(html, /Дэлгэцийн зураг уншуулах/);
  assert.match(html, /Текстээс мэдээлэл ялгах/);
  assert.match(html, /Facebook → Share \(Хуваалцах\) → УБ Үнэ Тандагч/);
  assert.match(html, /<html lang="mn"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("extracts a Facebook post draft without uploading an image", async () => {
  const response = await request("/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "text", text: "Redmi Pad 2 Pro 8GB 256GB\nЦоо шинэ\nҮнэ: 1.9 сая₮\nУтас: 99112233" }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.draft.query, /Redmi Pad 2 Pro/i);
  assert.equal(payload.draft.targetPrice, 1_900_000);
  assert.ok(payload.draft.confidence >= 70);
  assert.equal(payload.source, "pasted_text");
});

test("does not confuse generic model tokens with product identity", async () => {
  const { compareProductTitle } = await importTypeScriptModule("../lib/matching.ts");
  assert.equal(compareProductTitle("Redmi Pad 2 Pro", 'MacBook Neo A18 Pro 13" LL/A 2,850,000 ₮'), null);
  assert.equal(compareProductTitle("Apple iPad Pro", "Apple MacBook Pro 14"), null);
  assert.equal(compareProductTitle("Samsung Galaxy Tab S9", "Samsung Galaxy S9"), null);
  assert.equal(compareProductTitle("Apple iPad A16 256GB Wi-Fi", "Apple iPad 11 A16 Wi-Fi 256GB")?.match, "exact");
  assert.equal(compareProductTitle("Redmi Pad 2 Pro", "Redmi Note 2 Pro 8GB 256GB"), null);
});

test("keeps Facebook merchant searches as unverified manual leads", async () => {
  const { facebookMerchantLeads } = await importTypeScriptModule("../lib/facebook-leads.ts");
  const leads = facebookMerchantLeads("redmi pad 2 pro");
  const bedrock = leads.find((lead) => lead.seller === "BedRock");
  assert.equal(bedrock?.status, "manual_lead");
  assert.match(bedrock?.pageUrl ?? "", /facebook\.com\/TheBedRockmn/);
  assert.match(new URL(bedrock?.searchUrl ?? "https://example.com").searchParams.get("q") ?? "", /redmi pad 2 pro BedRock/i);
});

test("accepts Facebook text and links from the PWA share target", async () => {
  const { extractSharedPayload } = await importTypeScriptModule("../lib/intake.ts");
  const shared = extractSharedPayload({ text: "Redmi Pad 2 Pro 8GB 256GB — 1.9 сая₮", url: "https://www.facebook.com/photo?fbid=123" });
  assert.match(shared?.draft.query ?? "", /Redmi Pad 2 Pro/i);
  assert.doesNotMatch(shared?.draft.query ?? "", /сая|1\.9/i);
  assert.equal(shared?.draft.targetPrice, 1_900_000);
  assert.equal(shared?.listingUrl, "https://www.facebook.com/photo?fbid=123");
});

test("receives PWA shares by POST without putting ad data in the URL", async () => {
  const hostile = "Redmi Pad 2 Pro 8GB 256GB — 1.9 сая₮</script><script>alert(1)</script>";
  const response = await request("/share", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text: hostile, url: "https://www.facebook.com/photo?fbid=123" }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'nonce-/);
  const html = await response.text();
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /location\.replace\("\/"\)/);
  assert.doesNotMatch(html, /<\/script><script>alert/);
});

test("rejects non-Facebook and local listing URLs", async () => {
  for (const listingUrl of ["https://example.com/post", "http://localhost:3000/post", "https://127.0.0.1/post"]) {
    const response = await request("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "url", listingUrl }),
    });
    assert.equal(response.status, 400);
  }
});

test("rejects oversized intake bodies without relying on Content-Length", async () => {
  const response = await request("/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "text", text: "x".repeat(30_000) }),
  });
  assert.equal(response.status, 413);
});

test("ships persistence, PWA sharing, and a bounded source registry", async () => {
  const [hosting, initialMigration, limitMigration, route, intakeRoute, shared, manifestText] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_huge_grey_gargoyle.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_past_psynapse.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/intake/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/sources/shared.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);
  const { SOURCES } = await import("../lib/sources/index.ts");
  assert.match(hosting, /"d1": "DB"/);
  assert.match(initialMigration, /CREATE TABLE `scans`/);
  assert.match(initialMigration, /idx_scans_created_at/);
  assert.match(limitMigration, /CREATE TABLE `scan_limits`/);
  assert.match(route, /scanAll\(payload\.query\)/);
  assert.match(shared, /AbortSignal\.timeout\(options\.timeoutMs \?\? 7000\)/);
  assert.ok(SOURCES.some((s) => s.seller === "Best Computers") && SOURCES.some((s) => s.seller === "Unegui"));
  assert.match(intakeRoute, /draft\.confidence < 70/);
  assert.match(intakeRoute, /consumeHourlyBudget\(request, "facebook-intake", \d+, \d+\)/);
  assert.match(intakeRoute, /MAX_REQUEST_BYTES/);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.share_target.action, "/share");
  assert.equal(manifest.share_target.method, "POST");
  assert.equal(manifest.share_target.enctype, "application/x-www-form-urlencoded");
  assert.equal(manifest.share_target.params.url, "url");
});
