import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { scans } from "../../../db/schema";
import { facebookListingUrl } from "../../../lib/intake";
import { consumeHourlyBudget } from "../../../lib/rate-limit";
import { summarize } from "../../../lib/report";
import { scanAll } from "../../../lib/sources";

export const dynamic = "force-dynamic";

function validPayload(value: unknown): { query: string; targetPrice: number | null; listingUrl: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const query = typeof raw.query === "string" ? raw.query.trim().slice(0, 180) : "";
  const targetPrice = typeof raw.targetPrice === "number" && Number.isFinite(raw.targetPrice) && raw.targetPrice > 0 ? Math.round(raw.targetPrice) : null;
  let listingUrl: string | null = null;
  if (typeof raw.listingUrl === "string" && raw.listingUrl.trim()) {
    const parsed = facebookListingUrl(raw.listingUrl);
    if (!parsed) return null;
    listingUrl = parsed.toString();
  }
  return query.length >= 3 ? { query, targetPrice, listingUrl } : null;
}

export async function POST(request: Request) {
  const payload = validPayload(await request.json().catch(() => null));
  if (!payload) return Response.json({ error: "Барааг тодорхойлсон гурваас доошгүй тэмдэгт оруулна уу." }, { status: 400 });
  // 20 scans an hour per visitor, 400 an hour for the whole site (each scan fans out to 15 stores).
  const limit = await consumeHourlyBudget(request, "scan", 20, 400);
  if (limit === "limited") return Response.json({ error: "Таны энэ цагийн бодит үнийн хайлтын хязгаар дууслаа. Хадгалсан тайлан болон дэлгүүрийн холбоосууд нээлттэй хэвээр байна. Дараагийн цагт дахин оролдоно уу." }, { status: 429, headers: { "retry-after": "3600" } });
  if (limit === "unavailable") return Response.json({ error: "Аюулгүйн хязгаар шинэчлэгдэж байгаа тул бодит үнийн хайлт түр боломжгүй байна. Удахгүй дахин оролдоно уу." }, { status: 503, headers: { "retry-after": "120" } });
  const results = await scanAll(payload.query);
  const report = summarize(payload.query, payload.targetPrice, payload.listingUrl, results);
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  let persisted = true;
  try {
    await getDb().insert(scans).values({ id, query: payload.query, targetPrice: payload.targetPrice, report: JSON.stringify(report), createdAt: Date.now() });
  } catch (error) {
    // The report still goes back to the caller; the server log keeps the reason.
    console.error("scan report not persisted", { id, query: payload.query, error: error instanceof Error ? error.message : String(error) });
    persisted = false;
  }
  return Response.json({ id: persisted ? id : null, persisted, report });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.slice(0, 32);
  if (!id) return Response.json({ error: "Тайлангийн дугаар дутуу байна." }, { status: 400 });
  try {
    const row = await getDb().select().from(scans).where(eq(scans.id, id)).limit(1);
    if (!row[0]) return Response.json({ error: "Тайлан олдсонгүй." }, { status: 404 });
    return Response.json({ id: row[0].id, report: JSON.parse(row[0].report) });
  } catch {
    return Response.json({ error: "Хадгалсан тайлангууд түр хугацаанд нээгдэхгүй байна." }, { status: 503 });
  }
}
