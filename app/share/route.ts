import { readLimitedText } from "../../lib/request-body";

export const dynamic = "force-dynamic";

const MAX_SHARE_BYTES = 25_000;
const STORAGE_KEY = "ub-price-scout-share";

function safeScriptLiteral(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported share format", { status: 415 });
  }
  let body = "";
  try { body = await readLimitedText(request, MAX_SHARE_BYTES); }
  catch { return new Response("Shared content is too large", { status: 413 }); }
  const params = new URLSearchParams(body);
  const payload = {
    title: params.get("title")?.trim().slice(0, 500) ?? "",
    text: params.get("text")?.trim().slice(0, 8_000) ?? "",
    url: params.get("url")?.trim().slice(0, 1_000) ?? "",
  };
  if (!payload.title && !payload.text && !payload.url) return Response.redirect(new URL("/", request.url), 303);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const stored = safeScriptLiteral(JSON.stringify(payload));
  const html = `<!doctype html><html lang="mn"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>УБ Үнэ Тандагч</title><body><p>Хуваалцсан зарыг нээж байна…</p><noscript><a href="/">УБ Үнэ Тандагч руу очих</a></noscript><script nonce="${nonce}">sessionStorage.setItem(${safeScriptLiteral(STORAGE_KEY)},${stored});location.replace("/");</script></body></html>`;
  return new Response(html, {
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'`,
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
