"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Listing = { seller: string; title: string; price: number; url: string; match: "exact" | "near"; stock: "in_stock" | "out_of_stock" | "unknown"; confidence: number; checkedAt: string; note?: string };
type Source = { seller: string; searchUrl: string; state: "found" | "no_match" | "blocked" | "timed_out"; listings: Listing[] };
type Report = { query: string; targetPrice: number | null; listingUrl: string | null; verdict: "great" | "fair" | "high" | "insufficient"; median: number | null; low: number | null; high: number | null; exact: Listing[]; near: Listing[]; sources: Source[]; checkedAt: string };

const EXAMPLE = "Apple iPad 11 A16 256GB Wi-Fi";

const money = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("mn-MN").format(value)}₮`;
const relativeTime = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? "дөнгөж сая" : `${minutes} минутын өмнө`;
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}

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
        const payload = await readJson<{ id: string; report: Report; error?: string }>(response, "Тайлангийн мэдээллийг уншиж чадсангүй. Дахин оролдоно уу.");
        if (!response.ok) throw new Error(payload.error ?? "Энэ тайланг нээж чадсангүй.");
        setReport(payload.report);
        setReportId(payload.id);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Энэ тайланг нээж чадсангүй."))
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
      setError(mode === "link" ? "Дэлгүүрүүдийн үнийг зөв харьцуулахын тулд барааны бүтэн нэрийг оруулна уу." : "Барааны загвар болон гол үзүүлэлтүүдийг оруулна уу.");
      return;
    }
    if (mode === "link") {
      try { const parsed = new URL(listingUrl.trim()); if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(); }
      catch { setError("Нийтэд нээлттэй http эсвэл https холбоосыг бүтнээр нь оруулна уу."); return; }
    }
    setLoading(true); setError(""); setReport(null); setCopied(false);
    try {
      const numericPrice = Number(targetPrice.replace(/[^\d]/g, ""));
      const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: cleanQuery, targetPrice: numericPrice > 0 ? numericPrice : null, listingUrl: listingUrl.trim() || null }) });
      const payload = await readJson<{ id: string | null; persisted: boolean; report: Report; error?: string }>(response, "Серверийн хариуг уншиж чадсангүй. Дахин оролдоно уу.");
      if (!response.ok) throw new Error(payload.error ?? "Үнийн хайлтыг гүйцээж чадсангүй.");
      setReport(payload.report); setReportId(payload.id ?? "");
      if (payload.persisted && payload.id) window.history.replaceState({}, "", `${window.location.pathname}?report=${payload.id}`);
      requestAnimationFrame(() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Үнийн хайлтыг гүйцээж чадсангүй.");
    } finally { setLoading(false); }
  }

  async function shareReport() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Тайланг хуваалцахын тулд хөтчийн хаягийг хуулна уу."); }
  }

  function reset() {
    setReport(null); setReportId(""); setError(""); setShowNear(false);
    window.history.replaceState({}, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main>
      <nav className="topbar" aria-label="Үндсэн цэс">
        <button className="brand reset-button" onClick={reset} aria-label="УБ Үнэ Тандагч нүүр"><span className="brand-mark">УБ</span><span>Үнэ Тандагч</span></button>
        <div className="top-actions"><span className="market-status"><i /> Дэлгүүрийн бодит үнэ</span>{report && <button className="text-button" onClick={reset}>Шинэ хайлт</button>}</div>
      </nav>

      {!report && <section className="hero" id="top">
        <div className="eyebrow">Улаанбаатарын хараат бус үнийн судалгаа</div>
        <h1>Авахаасаа өмнө<br />бодит үнийг мэд.</h1>
        <p className="hero-copy">Нэг хайлтаар Монголын онлайн дэлгүүрүүд дэх ижил үзүүлэлттэй барааны үнэ, үлдэгдэл болон эх сурвалжийн найдвартай байдлыг шалгана.</p>

        <form className="search-card" onSubmit={submit}>
          <div className="input-tabs" aria-label="Оруулах мэдээллийн төрөл">
            <button type="button" aria-pressed={mode === "name"} onClick={() => setMode("name")}>Бараагаа бичих</button>
            <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>Зарын холбоос оруулах</button>
          </div>
          {mode === "link" && <div className="field"><label htmlFor="listing-url">Зарын холбоос</label><input id="listing-url" inputMode="url" value={listingUrl} onChange={(event) => setListingUrl(event.target.value)} placeholder="https://facebook.com/…" /></div>}
          <div className="field"><label htmlFor="product-query">{mode === "link" ? "Барааны дэлгэрэнгүй үзүүлэлт" : "Барааны нэр ба үзүүлэлт"}</label><input id="product-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Apple iPad 11 A16 256GB Wi‑Fi" autoComplete="off" /></div>
          <div className="price-and-action">
            <div className="field price-field"><label htmlFor="asking-price">Зарын үнэ <span>заавал биш</span></label><div className="money-input"><input id="asking-price" inputMode="numeric" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} placeholder="1,900,000" /><b>₮</b></div></div>
            <button className="scan-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Дэлгүүрүүдийг шалгаж байна…</> : <>УБ-ын үнийг хайх <span>→</span></>}</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="example-row"><span>Жишээгээр үзэх</span><button type="button" onClick={() => { setMode("name"); setQuery(EXAMPLE); setTargetPrice("1900000"); }}>iPad A16 · 256GB · Wi‑Fi</button></div>
        </form>

        <div className="source-strip" aria-label="Хайлт юуг шалгах вэ"><span>ШАЛГАХ ҮЗҮҮЛЭЛТ</span><b>Загвар</b><b>Багтаамж</b><b>Холболт</b><b>Үлдэгдэл</b><b>НӨАТ</b></div>
      </section>}

      {!report && !loading && <section className="preview-panel" aria-label="Хэрхэн ажиллах вэ">
        <div><span className="index">01</span><strong>Тодорхойлно</strong><p>Загвар, багтаамж, холболт болон төлөвөөр нь яг ижил барааг танина.</p></div>
        <div><span className="index">02</span><strong>Харьцуулна</strong><p>Зөвхөн ижил үзүүлэлттэй саналуудыг бодит үнийн хүрээнд оруулж, төстэйг нь тусад нь харуулна.</p></div>
        <div><span className="index">03</span><strong>Дүгнэнэ</strong><p>Тодорхой үнэлгээ, эх сурвалжийн холбоос болон шалгасан хугацааг ил тод харуулна.</p></div>
      </section>}

      {loading && !report && <section className="loading-stage" aria-live="polite"><div className="radar"><span /><span /><i /></div><h2>Онлайн дэлгүүрүүдээр хайж байна…</h2><p>Дэлгүүрүүдийн хайлтын хуудсыг шалгаж, яг ижил болон төстэй барааг ялгаж байна.</p><div className="loading-sources"><span>Best Computers</span><span>iTStore</span><span>SEGU</span><span>PC Mall</span><span>iPick</span><span>TurboTech</span><span>+3 дэлгүүр</span></div></section>}

      {report && <section className="report" id="report">
        <header className="report-head">
          <div><div className="eyebrow">Зах зээлийн тайлан · {relativeTime(report.checkedAt)}</div><h2>{report.query}</h2><p>{sourceStats.checked} эх сурвалж шалгасан · {sourceStats.reached} хариу өгсөн · {sourceStats.blocked} хандалт хаалттай эсвэл хугацаа хэтэрсэн</p></div>
          <div className="report-actions">{report.listingUrl && <a href={report.listingUrl} target="_blank" rel="noreferrer">Эх зар ↗</a>}<button onClick={shareReport} disabled={!reportId} title={reportId ? undefined : "Энэ тайланг хуваалцахаар хадгалж чадсангүй"}>{copied ? "Холбоос хууллаа ✓" : reportId ? "Тайлан хуваалцах" : "Хуваалцах боломжгүй"}</button><button className="icon-action" onClick={() => window.print()} aria-label="Тайлан хэвлэх">↗</button></div>
        </header>

        <div className={`verdict-card verdict-${report.verdict}`}>
          <div className="verdict-label">ҮНИЙН ДҮГНЭЛТ</div>
          <div className="verdict-main"><span className="verdict-word">{report.verdict === "great" ? "Маш сайн үнэ" : report.verdict === "fair" ? "Боломжийн үнэ" : report.verdict === "high" ? "Өндөр үнэ" : "Нэмэлт мэдээлэл хэрэгтэй"}</span><p>{report.verdict === "great" ? "Энэ зарын үнэ ижил барааны одоогийн дундаж үнээс мэдэгдэхүйц хямд байна." : report.verdict === "fair" ? "Энэ зарын үнэ ижил барааны зах зээлийн боломжийн хүрээнд байна." : report.verdict === "high" ? "Энэ зарын үнэ ижил барааны одоогийн зах зээлийн хүрээнээс өндөр байна." : "Найдвартай, яг ижил барааны үнийн хүрээ олдсонгүй. Доорх эх сурвалжуудыг нээх эсвэл барааны үзүүлэлтийг нарийвчилна уу."}</p></div>
          <div className="ask-block"><span>Зарын үнэ</span><strong>{money(report.targetPrice)}</strong>{report.targetPrice && report.median && <small>Дундаж үнээс {Math.abs(Math.round((report.targetPrice / report.median - 1) * 100))}% {report.targetPrice > report.median ? "өндөр" : "хямд"}</small>}</div>
        </div>

        <div className="metric-grid">
          <div><span>ХАМГИЙН ХЯМД</span><strong>{money(report.low)}</strong><small>{report.exact[0]?.seller ?? "Яг ижил бараа олдсонгүй"}</small></div>
          <div><span>ЗАХ ЗЭЭЛИЙН ДУНДАЖ</span><strong>{money(report.median)}</strong><small>Яг ижил {report.exact.length} бодит санал</small></div>
          <div><span>ХАМГИЙН ӨНДӨР</span><strong>{money(report.high)}</strong><small>Зөвхөн яг ижил үзүүлэлтээр</small></div>
        </div>

        <div className="results-layout">
          <div className="listings-column">
            <div className="section-title"><div><span>БОДИТ ҮНИЙН ХАРЬЦУУЛАЛТ</span><h3>Яг ижил бараа</h3></div><span className="count-pill">{report.exact.length}</span></div>
            {report.exact.length ? <div className="listing-table">{report.exact.map((item, index) => <ListingRow item={item} key={`${item.url}-${index}`} rank={index + 1} />)}</div> : <div className="empty-state"><div className="empty-mark">?</div><div><h3>Баталгаатай, яг ижил бараа олдсонгүй</h3><p>Зарим дэлгүүр бараагаа скриптийн цаана нуух эсвэл автомат хандалтыг хаах боломжтой. Аль эх сурвалж хариу өгснийг баруун талын жагсаалтаас харна уу. Загварын нэрийг товчлох эсвэл хайлтын холбоосыг шууд нээгээрэй.</p></div></div>}

            {!!report.near.length && <div className="near-section"><button className="near-toggle" onClick={() => setShowNear((value) => !value)} aria-expanded={showNear} aria-controls="near-match-results"><span><b>Төстэй бараа</b> · үнийн дүгнэлтэд ороогүй</span><span>{report.near.length} {showNear ? "−" : "+"}</span></button>{showNear && <div className="listing-table near-list" id="near-match-results">{report.near.map((item, index) => <ListingRow item={item} key={`${item.url}-${index}`} rank={index + 1} />)}</div>}</div>}
          </div>

          <aside className="source-ledger">
            <div className="section-title"><div><span>ЭХ СУРВАЛЖИЙН БҮРТГЭЛ</span><h3>Шалгасан дэлгүүрүүд</h3></div></div>
            <div className="ledger-list">{report.sources.map((source) => <a href={source.searchUrl} target="_blank" rel="noreferrer" key={source.seller}><span className={`source-dot state-${source.state}`} /><div><b>{source.seller}</b><small>{source.state === "found" ? `${source.listings.length} боломжит бараа` : source.state === "no_match" ? "Хариу өгсөн · бараа олдоогүй" : source.state === "timed_out" ? "Хугацаа хэтэрсэн" : "Хандалт хязгаарлагдсан"}</small></div><span>↗</span></a>)}</div>
            <p className="ledger-note">Эдгээр үнэ нь судалгааны баримт болохоос худалдан авах зөвлөмж биш. Эцсийн үнэ, НӨАТ-ын баримт, баталгаа болон үлдэгдлийг худалдагчаас заавал лавлаарай.</p>
          </aside>
        </div>

        <footer className="report-footer"><div><span className="brand-mark">УБ</span><b>Үнэ Тандагч</b></div><p>{reportId ? `Тайлан ${reportId} · ` : "Хадгалаагүй тайлан · "}{new Date(report.checkedAt).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" })} цагт үүсгэв</p><button onClick={reset}>Өөр бараа шалгах →</button></footer>
      </section>}
    </main>
  );
}

function ListingRow({ item, rank }: { item: Listing; rank: number }) {
  let safeUrl: string | null = null;
  try { const parsed = new URL(item.url); safeUrl = parsed.protocol === "https:" ? parsed.toString() : null; } catch { safeUrl = null; }
  const content = <><span className="rank">{String(rank).padStart(2, "0")}</span><div className="listing-copy"><b>{item.seller}</b><span>{item.title}</span><small><i className={`stock stock-${item.stock}`} /> {item.stock === "in_stock" ? "Үлдэгдэлтэй" : item.stock === "out_of_stock" ? "Дууссан" : "Үлдэгдэл тодорхойгүй"} · {item.confidence}% тохирол</small></div><strong className="listing-price">{money(item.price)}</strong><span className="external">{safeUrl ? "↗" : ""}</span></>;
  return safeUrl ? <a className="listing-row" href={safeUrl} target="_blank" rel="noreferrer">{content}</a> : <div className="listing-row">{content}</div>;
}
