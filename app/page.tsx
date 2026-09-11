"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { extractIntakeDraft, extractSharedIntake, extractSharedPayload, facebookListingUrl, type IntakeDraft } from "../lib/intake";

type Listing = { seller: string; title: string; price: number; url: string; match: "exact" | "near"; stock: "in_stock" | "out_of_stock" | "unknown"; confidence: number; checkedAt: string; note?: string };
type Source = { seller: string; searchUrl: string; state: "found" | "no_match" | "blocked" | "timed_out" | "unreadable"; listings: Listing[]; attemptedQueries?: string[] };
type FacebookLead = { seller: string; pageUrl: string; searchUrl: string; status: "manual_lead" };
type Report = { query: string; targetPrice: number | null; listingUrl: string | null; verdict: "great" | "fair" | "high" | "insufficient"; median: number | null; low: number | null; high: number | null; exact: Listing[]; near: Listing[]; sources: Source[]; facebookLeads?: FacebookLead[]; checkedAt: string };
type IntakeMode = "details" | "facebook_text" | "facebook_link";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

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
  const [mode, setMode] = useState<IntakeMode>("facebook_text");
  const [query, setQuery] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [postText, setPostText] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftConfidence, setDraftConfidence] = useState(0);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportId, setReportId] = useState("");
  const [copied, setCopied] = useState(false);
  const [showNear, setShowNear] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let storedPayload: unknown = null;
    try {
      const stored = window.sessionStorage.getItem("ub-price-scout-share");
      window.sessionStorage.removeItem("ub-price-scout-share");
      if (stored) storedPayload = JSON.parse(stored);
    } catch {
      storedPayload = null;
    }
    const shared = extractSharedPayload(storedPayload) ?? extractSharedIntake(window.location.search);
    if (shared) {
      window.history.replaceState({}, "", window.location.pathname);
      const frame = requestAnimationFrame(() => {
        setMode(shared.listingUrl ? "facebook_link" : "facebook_text");
        setListingUrl(shared.listingUrl);
        setPostText(shared.postText);
        setQuery(shared.draft.query);
        setTargetPrice(shared.draft.targetPrice ? String(shared.draft.targetPrice) : "");
        setDraftConfidence(shared.draft.confidence);
        setDraftReady(true);
        setError(shared.draft.query ? "" : "Хуваалцсан зараас барааны нэрийг ялгаж чадсангүй. Доорх талбарт гараар оруулна уу.");
      });
      return () => cancelAnimationFrame(frame);
    }
    const id = params.get("report");
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

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const handleInstallPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  const sourceStats = useMemo(() => {
    if (!report) return { checked: 0, reached: 0, blocked: 0, unreadable: 0 };
    return {
      checked: report.sources.length,
      reached: report.sources.filter((source) => source.state === "found" || source.state === "no_match").length,
      blocked: report.sources.filter((source) => source.state === "blocked" || source.state === "timed_out").length,
      unreadable: report.sources.filter((source) => source.state === "unreadable").length,
    };
  }, [report]);

  function changeMode(next: IntakeMode) {
    setMode(next); setError(""); setDraftReady(next === "details"); setDraftConfidence(0); setOcrProgress(0);
    if (next !== "facebook_link") setListingUrl("");
  }

  function applyDraft(draft: IntakeDraft, url?: string) {
    setQuery(draft.query);
    setTargetPrice(draft.targetPrice ? String(draft.targetPrice) : "");
    setDraftConfidence(draft.confidence);
    setDraftReady(true);
    if (url) setListingUrl(url);
    setError(draft.query ? "" : "Барааны нэрийг автоматаар ялгаж чадсангүй. Доорх талбарт гараар оруулна уу.");
  }

  function extractFromText() {
    if (postText.trim().length < 3) { setError("Facebook зарын текстийг оруулна уу."); return; }
    applyDraft(extractIntakeDraft(postText));
  }

  async function extractFromUrl() {
    setExtracting(true); setError("");
    try {
      const response = await fetch("/api/intake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "url", listingUrl }) });
      const payload = await readJson<{ draft?: IntakeDraft; listingUrl?: string; error?: string }>(response, "Facebook холбоосын хариуг уншиж чадсангүй.");
      if (!response.ok || !payload.draft) throw new Error(payload.error ?? "Facebook зарыг уншиж чадсангүй.");
      applyDraft(payload.draft, payload.listingUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Facebook зарыг уншиж чадсангүй."); }
    finally { setExtracting(false); }
  }

  async function readScreenshot(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10_000_000) { setError("10MB-аас бага хэмжээтэй зураг сонгоно уу."); return; }
    setExtracting(true); setError(""); setOcrProgress(1);
    const workerState: { current: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null } = { current: null };
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      const workerPromise = createWorker(["mon", "eng"], undefined, { logger: (message) => { if (typeof message.progress === "number") setOcrProgress(Math.max(1, Math.round(message.progress * 100))); } })
        .then(async (created) => {
          if (timedOut) { await created.terminate(); throw new Error("Зураг таних хугацаа хэтэрлээ. Дахин оролдоно уу."); }
          workerState.current = created;
          return created;
        });
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => { timedOut = true; reject(new Error("Зураг таних хугацаа хэтэрлээ. Дахин оролдоно уу.")); }, 45_000);
      });
      const result = await Promise.race([workerPromise.then((created) => created.recognize(file)), timeout]);
      const text = result.data.text.trim();
      if (!text) throw new Error("Зургаас текст таньж чадсангүй. Зарын текстийг хуулж оруулна уу.");
      setPostText(text);
      applyDraft(extractIntakeDraft(text));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Дэлгэцийн зургаас текст уншиж чадсангүй."); }
    finally { if (timeoutId) clearTimeout(timeoutId); if (workerState.current) await workerState.current.terminate().catch(() => undefined); setExtracting(false); setOcrProgress(0); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3) {
      setError("Барааны загвар болон гол үзүүлэлтүүдийг оруулна уу.");
      return;
    }
    if (mode === "facebook_link") {
      if (!facebookListingUrl(listingUrl)) { setError("Нийтэд нээлттэй Facebook https холбоосыг бүтнээр нь оруулна уу."); return; }
    }
    setLoading(true); setError(""); setReport(null); setCopied(false);
    try {
      const numericPrice = Number(targetPrice.replace(/[^\d]/g, ""));
      const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: cleanQuery, targetPrice: numericPrice > 0 ? numericPrice : null, listingUrl: mode === "facebook_link" ? listingUrl.trim() : null }) });
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

  async function installApp() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      setError("Апп суулгах хүсэлтийг нээж чадсангүй. Хөтчийн цэснээс суулгана уу.");
    } finally {
      setInstallPrompt(null);
    }
  }

  function reset() {
    setReport(null); setReportId(""); setError(""); setShowNear(false); setDraftReady(mode === "details");
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
        <p className="hero-copy">Facebook зарын текст, холбоос эсвэл дэлгэцийн зургаас барааг таньж, Монголын онлайн дэлгүүрүүдийн бодит үнэтэй харьцуулна.</p>

        <form className="search-card" onSubmit={submit}>
          <div className="input-tabs" aria-label="Оруулах мэдээллийн төрөл">
            <button type="button" aria-pressed={mode === "facebook_text"} onClick={() => changeMode("facebook_text")}>Facebook зар</button>
            <button type="button" aria-pressed={mode === "facebook_link"} onClick={() => changeMode("facebook_link")}>Зарын холбоос</button>
            <button type="button" aria-pressed={mode === "details"} onClick={() => changeMode("details")}>Бараагаа бичих</button>
          </div>
          {mode === "facebook_text" && <div className="social-intake"><div className="field"><label htmlFor="post-text">Facebook зарын текст</label><textarea id="post-text" value={postText} onChange={(event) => { setPostText(event.target.value); setDraftReady(false); }} placeholder={'Жишээ:\nRedmi Pad 2 Pro 8/256GB\nЦоо шинэ, үнэ 1.9 сая₮'} rows={5} /></div><div className="intake-actions"><button className="extract-button" type="button" onClick={extractFromText} disabled={extracting}>Текстээс мэдээлэл ялгах</button><label className="upload-button">{extracting && ocrProgress ? `Уншиж байна ${ocrProgress}%` : "Дэлгэцийн зураг уншуулах"}<input type="file" accept="image/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void readScreenshot(file); }} disabled={extracting} /></label></div><p className="privacy-note">Дэлгэцийн зураг таны төхөөрөмжөөс гарахгүй. Текст танилт хөтөч дотор ажиллана.</p></div>}
          {mode === "facebook_link" && <div className="social-intake"><div className="field"><label htmlFor="listing-url">Нийтэд нээлттэй Facebook холбоос</label><input id="listing-url" inputMode="url" value={listingUrl} onChange={(event) => { setListingUrl(event.target.value); setDraftReady(false); }} placeholder="https://facebook.com/…" /></div><div className="intake-actions"><button className="extract-button" type="button" onClick={() => void extractFromUrl()} disabled={extracting}>{extracting ? "Уншиж байна…" : "Холбоосоос мэдээлэл авах"}</button><label className="upload-button">{extracting && ocrProgress ? `Уншиж байна ${ocrProgress}%` : "Дэлгэцийн зураг ашиглах"}<input type="file" accept="image/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void readScreenshot(file); }} disabled={extracting} /></label></div><p className="privacy-note">Facebook хаалттай бол зарын текст эсвэл дэлгэцийн зураг ашиглаарай.</p></div>}
          {mode !== "details" && <div className="share-target-tip"><span>ШУУД ХУВААЛЦАХ</span><div><b>Facebook → Share (Хуваалцах) → УБ Үнэ Тандагч</b><small>Аппыг төхөөрөмждөө суулгасны дараа постын текст, холбоос шууд энд орж ирнэ.</small></div>{installPrompt && <button type="button" onClick={() => void installApp()}>Апп суулгах</button>}</div>}
          {(mode === "details" || draftReady) && <div className={mode === "details" ? "confirmation-fields" : "draft-panel"}>{mode !== "details" && <div className="draft-head"><div><span>ТАНЬСАН МЭДЭЭЛЭЛ</span><b>Шалгаад засварлана уу</b></div><strong>{draftConfidence}%</strong></div>}<div className="field"><label htmlFor="product-query">Барааны нэр ба гол үзүүлэлт</label><input id="product-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Xiaomi Redmi Pad 2 Pro 8GB 256GB" autoComplete="off" /></div><div className="price-and-action"><div className="field price-field"><label htmlFor="asking-price">Зарын үнэ <span>заавал биш</span></label><div className="money-input"><input id="asking-price" inputMode="numeric" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} placeholder="1,900,000" /><b>₮</b></div></div><button className="scan-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Дэлгүүрүүдийг шалгаж байна…</> : <>УБ-ын үнийг хайх <span>→</span></>}</button></div></div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="example-row"><span>Жишээгээр үзэх</span><button type="button" onClick={() => { changeMode("details"); setQuery(EXAMPLE); setTargetPrice("1900000"); }}>iPad A16 · 256GB · Wi‑Fi</button></div>
        </form>

        <div className="source-strip" aria-label="Хайлт юуг шалгах вэ"><span>FACEBOOK → ЗАХ ЗЭЭЛ</span><b>Загвар</b><b>Багтаамж</b><b>Зарын үнэ</b><b>Үлдэгдэл</b><b>НӨАТ</b></div>
      </section>}

      {!report && !loading && <section className="preview-panel" aria-label="Хэрхэн ажиллах вэ">
        <div><span className="index">01</span><strong>Тодорхойлно</strong><p>Загвар, багтаамж, холболт болон төлөвөөр нь яг ижил барааг танина.</p></div>
        <div><span className="index">02</span><strong>Харьцуулна</strong><p>Зөвхөн ижил үзүүлэлттэй саналуудыг бодит үнийн хүрээнд оруулж, төстэйг нь тусад нь харуулна.</p></div>
        <div><span className="index">03</span><strong>Дүгнэнэ</strong><p>Тодорхой үнэлгээ, эх сурвалжийн холбоос болон шалгасан хугацааг ил тод харуулна.</p></div>
      </section>}

      {loading && !report && <section className="loading-stage" aria-live="polite"><div className="radar"><span /><span /><i /></div><h2>Онлайн дэлгүүрүүдээр хайж байна…</h2><p>Дэлгүүрүүдийн хайлтын хуудсыг шалгаж, яг ижил болон төстэй барааг ялгаж байна.</p><div className="loading-sources"><span>Best Computers</span><span>iTStore</span><span>PC Mall</span><span>SEGU</span><span>BedRock</span><span>iPick</span><span>x86</span><span>+8 дэлгүүр</span></div></section>}

      {report && <section className="report" id="report">
        <header className="report-head">
          <div><div className="eyebrow">Зах зээлийн тайлан · {relativeTime(report.checkedAt)}</div><h2>{report.query}</h2><p>{sourceStats.checked} эх сурвалж шалгасан · {sourceStats.reached} хариу өгсөн · {sourceStats.unreadable} автоматаар уншигдаагүй · {sourceStats.blocked} хаалттай</p></div>
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
            {report.exact.length ? <div className="listing-table">{report.exact.map((item, index) => <ListingRow item={item} key={`${item.url}-${index}`} rank={index + 1} />)}</div> : <div className="empty-state"><div className="empty-mark">?</div><div><h3>Баталгаатай, яг ижил бараа олдсонгүй</h3><p>Зарим дэлгүүр бараагаа скриптийн цаана нуух эсвэл автомат хандалтыг хаах боломжтой. Аль эх сурвалж хариу өгснийг баруун талын жагсаалтаас харна уу. Загварын нэрийг товчлох эсвэл доорх Facebook сэжмүүдийг нээгээрэй.</p></div></div>}

            {!!report.near.length && <div className="near-section"><button className="near-toggle" onClick={() => setShowNear((value) => !value)} aria-expanded={showNear} aria-controls="near-match-results"><span><b>Төстэй бараа</b> · үнийн дүгнэлтэд ороогүй</span><span>{report.near.length} {showNear ? "−" : "+"}</span></button>{showNear && <div className="listing-table near-list" id="near-match-results">{report.near.map((item, index) => <ListingRow item={item} key={`${item.url}-${index}`} rank={index + 1} />)}</div>}</div>}

            {!!report.facebookLeads?.length && <section className="facebook-leads" aria-labelledby="facebook-leads-title"><div className="facebook-leads-head"><div><span>FACEBOOK СЭЖИМ · ГАРААР ШАЛГАНА</span><h3 id="facebook-leads-title">Facebook худалдааны постууд</h3></div><b>{report.facebookLeads.length}</b></div><p>Facebook хайлтын үр дүнг таны нэвтэрсэн төхөөрөмж дээр нээнэ. Эдгээр нь автоматаар баталгаажсан үнэ биш бөгөөд зах зээлийн дундажт ороогүй.</p><div className="facebook-lead-list">{report.facebookLeads.map((lead) => <div className="facebook-lead-row" key={lead.seller}><div><i /> <b>{lead.seller}</b><small>Баталгаажаагүй Facebook сэжим</small></div><div><a href={lead.searchUrl} target="_blank" rel="noreferrer">Пост хайх ↗</a><a href={lead.pageUrl} target="_blank" rel="noreferrer">Хуудас</a></div></div>)}</div></section>}
          </div>

          <aside className="source-ledger">
            <div className="section-title"><div><span>ЭХ СУРВАЛЖИЙН БҮРТГЭЛ</span><h3>Шалгасан дэлгүүрүүд</h3></div></div>
            <div className="ledger-list">{report.sources.map((source) => <a href={source.searchUrl} target="_blank" rel="noreferrer" key={source.seller}><span className={`source-dot state-${source.state}`} /><div><b>{source.seller}</b><small>{source.state === "found" ? `${source.listings.length} боломжит бараа` : source.state === "no_match" ? "Хариу өгсөн · бараа олдоогүй" : source.state === "unreadable" ? `Каталог автоматаар уншигдсангүй${source.attemptedQueries && source.attemptedQueries.length > 1 ? " · 2 хайлт" : ""}` : source.state === "timed_out" ? "Хугацаа хэтэрсэн" : "Хандалт хязгаарлагдсан"}</small></div><span>↗</span></a>)}</div>
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
