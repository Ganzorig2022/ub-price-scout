export async function consumeHourlyBudget(request: Request, fingerprint: string, maximum: number) {
  try {
    const { env } = await import("cloudflare:workers");
    const bucket = Math.floor(Date.now() / 3_600_000);
    const result = await env.DB.prepare(`
      INSERT INTO scan_limits (fingerprint, bucket, count)
      VALUES (?, ?, 1)
      ON CONFLICT(fingerprint) DO UPDATE SET
        bucket = excluded.bucket,
        count = CASE WHEN scan_limits.bucket = excluded.bucket THEN scan_limits.count + 1 ELSE 1 END
      RETURNING count
    `).bind(fingerprint, bucket).first<{ count: number }>();
    return (result?.count ?? 1) <= maximum ? "allowed" : "limited";
  } catch {
    return new URL(request.url).hostname === "localhost" ? "allowed" : "unavailable";
  }
}
