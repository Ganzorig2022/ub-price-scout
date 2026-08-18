import { extractIntakeDraft, facebookListingUrl } from "../../../lib/intake";
import { consumeHourlyBudget } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 1_000_000;
const MAX_REQUEST_BYTES = 25_000;
type IntakeBody = { kind?: unknown; text?: unknown; listingUrl?: unknown };

async function limitedRequestText(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) throw new Error("too_large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("too_large");
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

async function limitedText(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_HTML_BYTES) throw new Error("too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("too_large");
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? "";
}

function metadata(html: string, name: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = attribute(tag, "property") || attribute(tag, "name");
    if (key.toLowerCase() === name.toLowerCase()) return decodeHtml(attribute(tag, "content"));
  }
  return "";
}

async function fetchFacebookMetadata(initialUrl: URL) {
  let url = initialUrl;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "mn-MN,mn;q=0.9,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (compatible; UBPriceScout/1.0; public listing preview)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(6_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("redirect_missing");
      const next = facebookListingUrl(new URL(location, url).toString());
      if (!next) throw new Error("redirect_rejected");
      url = next;
      continue;
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) throw new Error("blocked");
    if (!response.ok) throw new Error("unavailable");
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("unsupported_content");
    const html = await limitedText(response);
    const title = metadata(html, "og:title") || decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const description = metadata(html, "og:description") || metadata(html, "description");
    const combined = [title, description].filter(Boolean).join("\n").trim();
    if (!combined || /(?:log in|login|facebook – log in|content isn't available|нэвтэрнэ үү)/i.test(combined)) throw new Error("login_required");
    return { text: combined.slice(0, 8_000), resolvedUrl: url.toString() };
  }
  throw new Error("too_many_redirects");
}

export async function POST(request: Request) {
  let rawBody = "";
  try { rawBody = await limitedRequestText(request); }
  catch { return Response.json({ error: "Зарын мэдээлэл хэт урт байна." }, { status: 413 }); }
  let body: IntakeBody | null = null;
  try { body = JSON.parse(rawBody) as IntakeBody; } catch { body = null; }
  if (!body || (body.kind !== "text" && body.kind !== "url")) {
    return Response.json({ error: "Зарын мэдээллийн төрлийг зөв сонгоно уу." }, { status: 400 });
  }

  if (body.kind === "text") {
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 10_000) : "";
    if (text.length < 3) return Response.json({ error: "Facebook зарын текстийг оруулна уу." }, { status: 400 });
    return Response.json({ draft: extractIntakeDraft(text), source: "pasted_text" });
  }

  const url = facebookListingUrl(body.listingUrl);
  if (!url) return Response.json({ error: "Зөвхөн нийтэд нээлттэй Facebook https холбоос оруулна уу." }, { status: 400 });
  const limit = await consumeHourlyBudget(request, "global-hourly-facebook-intake-budget", 120);
  if (limit === "limited") return Response.json({ error: "Facebook холбоос унших цагийн хязгаар дууслаа. Зарын текст эсвэл дэлгэцийн зураг ашиглана уу." }, { status: 429, headers: { "retry-after": "3600" } });
  if (limit === "unavailable") return Response.json({ error: "Аюулгүйн хязгаар шинэчлэгдэж байна. Зарын текст эсвэл дэлгэцийн зураг ашиглана уу." }, { status: 503, headers: { "retry-after": "120" } });
  try {
    const result = await fetchFacebookMetadata(url);
    const draft = extractIntakeDraft(result.text);
    if (draft.confidence < 70 || /^(?:facebook|facebook watch)$/i.test(draft.query)) throw new Error("login_required");
    return Response.json({ draft, source: "public_metadata", listingUrl: result.resolvedUrl, preview: result.text.slice(0, 500) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unavailable";
    const blocked = ["blocked", "login_required", "unavailable"].includes(reason);
    return Response.json({
      error: blocked
        ? "Facebook энэ зарыг автоматаар уншуулахгүй байна. Зарын текстийг хуулж оруулах эсвэл дэлгэцийн зургаас уншуулна уу."
        : "Facebook холбоосыг аюулгүйгээр уншиж чадсангүй. Зарын текст эсвэл дэлгэцийн зураг ашиглана уу.",
      reason,
    }, { status: blocked ? 422 : 400 });
  }
}
