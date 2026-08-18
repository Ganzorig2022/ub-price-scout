import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("ships persistence and a bounded source registry", async () => {
  const [hosting, initialMigration, limitMigration, route, intakeRoute] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_huge_grey_gargoyle.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_past_psynapse.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/intake/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(initialMigration, /CREATE TABLE `scans`/);
  assert.match(initialMigration, /idx_scans_created_at/);
  assert.match(limitMigration, /CREATE TABLE `scan_limits`/);
  assert.match(route, /Best Computers/);
  assert.match(route, /Unegui/);
  assert.match(route, /AbortSignal\.timeout\(7000\)/);
  assert.match(route, /importantHit === important\.length/);
  assert.match(route, /queryVariants\(query\)/);
  assert.match(route, /"unreadable"/);
  assert.match(intakeRoute, /draft\.confidence < 70/);
  assert.match(intakeRoute, /global-hourly-facebook-intake-budget/);
  assert.match(intakeRoute, /MAX_REQUEST_BYTES/);
});
