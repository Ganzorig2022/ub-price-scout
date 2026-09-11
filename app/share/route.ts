import { MAX_LEADS_JSON_CHARS, MAX_SHARE_BODY_BYTES } from "../../lib/facebook-collect";
import { consumeHourlyBudget } from "../../lib/rate-limit";
import { readLimitedText } from "../../lib/request-body";

export const dynamic = "force-dynamic";

// A Facebook share is a few KB; the group collector bookmarklet can send 40 posts of Cyrillic text (see lib/facebook-collect.ts for the sizing).
const MAX_SHARE_BYTES = MAX_SHARE_BODY_BYTES;
const STORAGE_KEY = "ub-price-scout-share";

/** Keep the collector payload only when it is a JSON array; the page re-validates every row and shows the reason when it is dropped. */
function collectedLeads(params: URLSearchParams): { leads: string; leadsError: "" | "too_large" | "malformed" } {
  const raw = params.get("leads")?.trim() ?? "";
  if (!raw) return { leads: "", leadsError: "" };
  if (raw.length > MAX_LEADS_JSON_CHARS) return { leads: "", leadsError: "too_large" };
  try {
    return Array.isArray(JSON.parse(raw)) ? { leads: raw, leadsError: "" } : { leads: "", leadsError: "malformed" };
  } catch {
    return { leads: "", leadsError: "malformed" };
  }
}

function safeScriptLiteral(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported share format", { status: 415 });
  }
  // Same hourly budget shape as the API routes; a share is cheap, so the allowance is generous.
  const limit = await consumeHourlyBudget(request, "share", 60, 600);
  if (limit === "limited") return new Response("Энэ цагт хэт олон хуваалцлаа. Дараагийн цагт дахин оролдоно уу.", { status: 429, headers: { "retry-after": "3600", "content-type": "text/plain; charset=utf-8" } });
  let body = "";
  try { body = await readLimitedText(request, MAX_SHARE_BYTES); }
  catch { return new Response("Shared content is too large", { status: 413 }); }
  const params = new URLSearchParams(body);
  const payload = {
    title: params.get("title")?.trim().slice(0, 500) ?? "",
    text: params.get("text")?.trim().slice(0, 8_000) ?? "",
    url: params.get("url")?.trim().slice(0, 1_000) ?? "",
    ...collectedLeads(params),
    // Echoed back to the page, which compares it with the token in this browser's localStorage.
    token: params.get("token")?.trim().slice(0, 64) ?? "",
  };
  if (!payload.title && !payload.text && !payload.url && !payload.leads && !payload.leadsError) return Response.redirect(new URL("/", request.url), 303);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const stored = safeScriptLiteral(JSON.stringify(payload));
  const html = `<!doctype html><html lang="mn"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>УБ Үнэ Тандагч</title><body><p>Хуваалцсан зарыг нээж байна…</p><noscript><a href="/">УБ Үнэ Тандагч руу очих</a></noscript><script nonce="${nonce}">sessionStorage.setItem(${safeScriptLiteral(STORAGE_KEY)},${stored});location.replace("/");</script></body></html>`;
  return new Response(html, {
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
