"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Listing = { seller: string; title: string; price: number; url: string; match: "exact" | "near"; stock: "in_stock" | "out_of_stock" | "unknown"; confidence: number; checkedAt: string; note?: string };
type Source = { seller: string; searchUrl: string; state: "found" | "no_match" | "blocked" | "timed_out"; listings: Listing[] };
type Report = { query: string; targetPrice: number | null; listingUrl: string | null; verdict: "great" | "fair" | "high" | "insufficient"; median: number | null; low: number | null; high: number | null; exact: Listing[]; near: Listing[]; sources: Source[]; checkedAt: string };

const EXAMPLE = "Apple iPad 11 A16 256GB Wi-Fi";

const money = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("mn-MN").format(value)}₮`;
const relativeTime = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? "just now" : minutes === 1 ? "1 min ago" : `${minutes} min ago`;
};

export default function Home() {
  const [mode, setMode] = useState<"name" | "link">("name");
  const [query, setQuery] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportId, setReportId] = useState("");
  const [copied, setCopied] = useState(false);
  const [showNear, setShowNear] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    if (!id) return;
    fetch(`/api/scan?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const payload = await response.json() as { id: string; report: Report; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not open this report.");
        setReport(payload.report);
        setReportId(payload.id);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not open this report."))
      .finally(() => setLoading(false));
  }, []);

  const sourceStats = useMemo(() => {
    if (!report) return { checked: 0, reached: 0, blocked: 0 };
    return {
      checked: report.sources.length,
      reached: report.sources.filter((source) => source.state === "found" || source.state === "no_match").length,
      blocked: report.sources.filter((source) => source.state === "blocked" || source.state === "timed_out").length,
    };
  }, [report]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3) {
      setError(mode === "link" ? "Add the exact product name so stores can be compared correctly." : "Describe the product with its model and important specifications.");
      return;
    }
    if (mode === "link") {
      try { const parsed = new URL(listingUrl.trim()); if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(); }
      catch { setError("Paste a complete public http or https listing link."); return; }
    }
    setLoading(true); setError(""); setReport(null); setCopied(false);
    try {
      const numericPrice = Number(targetPrice.replace(/[^\d]/g, ""));
      const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: cleanQuery, targetPrice: numericPrice > 0 ? numericPrice : null, listingUrl: listingUrl.trim() || null }) });
      const payload = await response.json() as { id: string | null; persisted: boolean; report: Report; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The scan could not be completed.");
      setReport(payload.report); setReportId(payload.id ?? "");
      if (payload.persisted && payload.id) window.history.replaceState({}, "", `${window.location.pathname}?report=${payload.id}`);
      requestAnimationFrame(() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The scan could not be completed.");
    } finally { setLoading(false); }
  }

  async function shareReport() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Copy the address from your browser to share this report."); }
  }

  function reset() {
    setReport(null); setReportId(""); setError(""); setShowNear(false);
    window.history.replaceState({}, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main>
      <nav className="topbar" aria-label="Primary navigation">
        <button className="brand reset-button" onClick={reset} aria-label="UB Price Scout home"><span className="brand-mark">UB</span><span>Price Scout</span></button>
        <div className="top-actions"><span className="market-status"><i /> Live retail check</span>{report && <button className="text-button" onClick={reset}>New scan</button>}</div>
      </nav>

      {!report && <section className="hero" id="top">
        <div className="eyebrow">Independent Ulaanbaatar price check</div>
        <h1>Know the street price<br />before you buy.</h1>
        <p className="hero-copy">One scan checks exact specifications, live prices, stock signals and source quality across Mongolia’s most useful online retailers.</p>

        <form className="search-card" onSubmit={submit}>
          <div className="input-tabs" aria-label="Input type">
            <button type="button" aria-pressed={mode === "name"} onClick={() => setMode("name")}>Describe product</button>
            <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>I have a listing link</button>
          </div>
          {mode === "link" && <div className="field"><label htmlFor="listing-url">Listing URL</label><input id="listing-url" inputMode="url" value={listingUrl} onChange={(event) => setListingUrl(event.target.value)} placeholder="https://facebook.com/…" /></div>}
          <div className="field"><label htmlFor="product-query">{mode === "link" ? "Exact product details" : "Product name and specifications"}</label><input id="product-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Apple iPad 11 A16 256GB Wi‑Fi" autoComplete="off" /></div>
          <div className="price-and-action">
            <div className="field price-field"><label htmlFor="asking-price">Seller’s asking price <span>optional</span></label><div className="money-input"><input id="asking-price" inputMode="numeric" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} placeholder="1,900,000" /><b>₮</b></div></div>
            <button className="scan-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Checking stores…</> : <>Scan UB prices <span>→</span></>}</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="example-row"><span>Try an example</span><button type="button" onClick={() => { setMode("name"); setQuery(EXAMPLE); setTargetPrice("1900000"); }}>iPad A16 · 256GB · Wi‑Fi</button></div>
        </form>

        <div className="source-strip" aria-label="What the scan checks"><span>CHECKING</span><b>Exact model</b><b>Storage</b><b>Connectivity</b><b>Stock</b><b>VAT notes</b></div>
      </section>}

      {!report && !loading && <section className="preview-panel" aria-label="How it works">
        <div><span className="index">01</span><strong>Identify</strong><p>Model, capacity, connectivity and condition become the comparison fingerprint.</p></div>
        <div><span className="index">02</span><strong>Compare</strong><p>Only like-for-like offers enter the fair-price range. Near matches stay separate.</p></div>
        <div><span className="index">03</span><strong>Decide</strong><p>A clear verdict, linked evidence and freshness signals—nothing hidden.</p></div>
      </section>}

      {loading && !report && <section className="loading-stage" aria-live="polite"><div className="radar"><span /><span /><i /></div><h2>Walking the digital shelves…</h2><p>Checking retailer search pages and separating exact matches from lookalikes.</p><div className="loading-sources"><span>Best Computers</span><span>iTStore</span><span>SEGU</span><span>PC Mall</span><span>iPick</span><span>TurboTech</span><span>+3 more</span></div></section>}

      {report && <section className="report" id="report">
        <header className="report-head">
          <div><div className="eyebrow">Market report · {relativeTime(report.checkedAt)}</div><h2>{report.query}</h2><p>{sourceStats.checked} sources attempted · {sourceStats.reached} responded · {sourceStats.blocked} blocked or timed out</p></div>
          <div className="report-actions">{report.listingUrl && <a href={report.listingUrl} target="_blank" rel="noreferrer">Original listing ↗</a>}<button onClick={shareReport} disabled={!reportId} title={reportId ? undefined : "This report could not be saved for sharing"}>{copied ? "Link copied ✓" : reportId ? "Share report" : "Sharing unavailable"}</button><button className="icon-action" onClick={() => window.print()} aria-label="Print report">↗</button></div>
        </header>

        <div className={`verdict-card verdict-${report.verdict}`}>
          <div className="verdict-label">THE VERDICT</div>
          <div className="verdict-main"><span className="verdict-word">{report.verdict === "great" ? "Great price" : report.verdict === "fair" ? "Fair price" : report.verdict === "high" ? "Priced high" : "More evidence needed"}</span><p>{report.verdict === "great" ? "This ask is meaningfully below the live exact-match midpoint." : report.verdict === "fair" ? "This ask sits inside a reasonable range for comparable live offers." : report.verdict === "high" ? "The asking price is above the live exact-match market range." : "No reliable live exact-match range was found. Open the checked sources below or refine the product details."}</p></div>
          <div className="ask-block"><span>Your ask</span><strong>{money(report.targetPrice)}</strong>{report.targetPrice && report.median && <small>{report.targetPrice > report.median ? "+" : ""}{Math.round((report.targetPrice / report.median - 1) * 100)}% vs midpoint</small>}</div>
        </div>

        <div className="metric-grid">
          <div><span>LOWEST LIVE</span><strong>{money(report.low)}</strong><small>{report.exact[0]?.seller ?? "No exact match"}</small></div>
          <div><span>MARKET MIDPOINT</span><strong>{money(report.median)}</strong><small>{report.exact.length} live exact {report.exact.length === 1 ? "match" : "matches"}</small></div>
          <div><span>TOP OF RANGE</span><strong>{money(report.high)}</strong><small>Exact specification only</small></div>
        </div>

        <div className="results-layout">
          <div className="listings-column">
            <div className="section-title"><div><span>LIVE COMPARABLES</span><h3>Exact matches</h3></div><span className="count-pill">{report.exact.length}</span></div>
            {report.exact.length ? <div className="listing-table">{report.exact.map((item, index) => <ListingRow item={item} key={`${item.url}-${index}`} rank={index + 1} />)}</div> : <div className="empty-state"><div className="empty-mark">?</div><div><h3>No verified exact match surfaced</h3><p>Retailer pages can hide products behind scripts or block automated requests. The source ledger shows what responded; try a shorter model name or open searches directly.</p></div></div>}

            {!!report.near.length && <div className="near-section"><button className="near-toggle" onClick={() => setShowNear((value) => !value)} aria-expanded={showNear} aria-controls="near-match-results"><span><b>Near matches</b> · excluded from the verdict</span><span>{report.near.length} {showNear ? "−" : "+"}</span></button>{showNear && <div className="listing-table near-list" id="near-match-results">{report.near.map((item, index) => <ListingRow item={item} key={`${item.url}-${index}`} rank={index + 1} />)}</div>}</div>}
          </div>

          <aside className="source-ledger">
            <div className="section-title"><div><span>EVIDENCE LOG</span><h3>Source ledger</h3></div></div>
            <div className="ledger-list">{report.sources.map((source) => <a href={source.searchUrl} target="_blank" rel="noreferrer" key={source.seller}><span className={`source-dot state-${source.state}`} /><div><b>{source.seller}</b><small>{source.state === "found" ? `${source.listings.length} candidate${source.listings.length === 1 ? "" : "s"}` : source.state === "no_match" ? "Reached · no match" : source.state === "timed_out" ? "Timed out" : "Access limited"}</small></div><span>↗</span></a>)}</div>
            <p className="ledger-note">Prices are evidence, not endorsements. Always confirm final price, VAT receipt, warranty and stock with the seller.</p>
          </aside>
        </div>

        <footer className="report-footer"><div><span className="brand-mark">UB</span><b>Price Scout</b></div><p>{reportId ? `Report ${reportId} · ` : "Unsaved report · "}Generated {new Date(report.checkedAt).toLocaleString("en-GB", { timeZone: "Asia/Ulaanbaatar" })} ULAT</p><button onClick={reset}>Check another product →</button></footer>
      </section>}
    </main>
  );
}

function ListingRow({ item, rank }: { item: Listing; rank: number }) {
  let safeUrl: string | null = null;
  try { const parsed = new URL(item.url); safeUrl = parsed.protocol === "https:" ? parsed.toString() : null; } catch { safeUrl = null; }
  const content = <><span className="rank">{String(rank).padStart(2, "0")}</span><div className="listing-copy"><b>{item.seller}</b><span>{item.title}</span><small><i className={`stock stock-${item.stock}`} /> {item.stock === "in_stock" ? "In stock" : item.stock === "out_of_stock" ? "Sold out" : "Stock unconfirmed"} · {item.confidence}% match</small></div><strong className="listing-price">{money(item.price)}</strong><span className="external">{safeUrl ? "↗" : ""}</span></>;
  return safeUrl ? <a className="listing-row" href={safeUrl} target="_blank" rel="noreferrer">{content}</a> : <div className="listing-row">{content}</div>;
}
