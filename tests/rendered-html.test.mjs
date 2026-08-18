import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the product scanner", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /UB Price Scout/);
  assert.match(html, /Know the street price/);
  assert.match(html, /Scan UB prices/);
  assert.match(html, /Product name and specifications/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships persistence and a bounded source registry", async () => {
  const [hosting, initialMigration, limitMigration, route] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_huge_grey_gargoyle.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_past_psynapse.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(initialMigration, /CREATE TABLE `scans`/);
  assert.match(initialMigration, /idx_scans_created_at/);
  assert.match(limitMigration, /CREATE TABLE `scan_limits`/);
  assert.match(route, /Best Computers/);
  assert.match(route, /Unegui/);
  assert.match(route, /AbortSignal\.timeout\(7000\)/);
  assert.match(route, /importantHit === important\.length/);
});
