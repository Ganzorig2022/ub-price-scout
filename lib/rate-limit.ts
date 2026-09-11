/**
 * Hourly budgets kept in the `scan_limits` D1 table.
 *
 * Two counters per scope: one for the calling client (hashed IP) and one global
 * ceiling. Before this was a single global counter, so one visitor could lock
 * everyone out for an hour.
 *
 * The client key is a salted SHA-256 of the IP, never the raw address, and rows
 * older than the previous hour are pruned on every call so the table stays small.
 * The salt stops casual reading of the table; against a full IPv4 rainbow table it
 * only helps when LIMIT_SALT is set as a Workers secret. Only Cloudflare's own
 * cf-connecting-ip header is trusted; anything the client can write is ignored.
 */
const HOUR_MS = 3_600_000;
const KEY_SALT = "ub-price-scout-limits-v1";

export type BudgetState = "allowed" | "limited" | "unavailable";

/** Stable, non-reversible client id for one request. Falls back to a shared key when no IP is known. */
export async function clientFingerprint(request: Request, salt = KEY_SALT): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  if (!ip) return "anonymous";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hourBucket(now = Date.now()) {
  return Math.floor(now / HOUR_MS);
}

const UPSERT = `
  INSERT INTO scan_limits (fingerprint, bucket, count)
  VALUES (?, ?, 1)
  ON CONFLICT(fingerprint) DO UPDATE SET
    bucket = excluded.bucket,
    count = CASE WHEN scan_limits.bucket = excluded.bucket THEN scan_limits.count + 1 ELSE 1 END
  RETURNING count`;

/**
 * Spend one unit of `scope` for this client. "limited" when either the client's
 * own hourly allowance or the global ceiling is exhausted.
 */
export async function consumeHourlyBudget(request: Request, scope: string, perClientMax: number, globalMax: number): Promise<BudgetState> {
  try {
    const { env } = await import("cloudflare:workers");
    const bucket = hourBucket();
    const client = await clientFingerprint(request, (env as { LIMIT_SALT?: string }).LIMIT_SALT || KEY_SALT);
    const [, clientRow, globalRow] = await env.DB.batch([
      env.DB.prepare("DELETE FROM scan_limits WHERE bucket < ?").bind(bucket - 1),
      env.DB.prepare(UPSERT).bind(`${scope}:client:${client}`, bucket),
      env.DB.prepare(UPSERT).bind(`${scope}:global`, bucket),
    ]);
    const clientCount = (clientRow.results?.[0] as { count?: number } | undefined)?.count;
    const globalCount = (globalRow.results?.[0] as { count?: number } | undefined)?.count;
    // A missing RETURNING row is an anomaly, never a free pass: fail closed as "unavailable".
    if (typeof clientCount !== "number" || typeof globalCount !== "number") throw new Error("rate limit upsert returned no count");
    return clientCount <= perClientMax && globalCount <= globalMax ? "allowed" : "limited";
  } catch (error) {
    const local = new URL(request.url).hostname === "localhost";
    console.error("rate limit unavailable", { scope, local, error: error instanceof Error ? error.message : String(error) });
    return local ? "allowed" : "unavailable";
  }
}
