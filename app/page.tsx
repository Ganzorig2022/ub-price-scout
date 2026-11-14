"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { parseCollectedLeads, type CollectedLead } from "../lib/facebook-collect";
import { extractIntakeDraft, extractSharedIntake, extractSharedPayload, facebookListingUrl, type IntakeDraft } from "../lib/intake";
import { Collector } from "./components/collector";
import { HowItWorks, LoadingStage } from "./components/home-extras";
import { IntakeForm } from "./components/intake-form";
import { LeadsInbox } from "./components/leads-inbox";
import { ReportView } from "./components/report-view";
import { TopBar } from "./components/top-bar";
import type { InstallPromptEvent, IntakeMode, Report } from "./components/types";

const EXAMPLE = "Apple iPad 11 A16 256GB Wi-Fi";

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
  const [leads, setLeads] = useState<CollectedLead[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let storedPayload: unknown = null;
    try {
      const stored = window.sessionStorage.getItem("ub-price-scout-share");
      if (stored) storedPayload = JSON.parse(stored);
    } catch {
      storedPayload = null;
    }
    // Removed only once the state update actually runs, so a Strict Mode trial mount (whose frame is cancelled) cannot eat the payload.
    const consumeShared = () => { try { window.sessionStorage.removeItem("ub-price-scout-share"); } catch { /* storage unavailable */ } };
    // Posts collected by the Facebook group bookmarklet arrive through the same share page. They stay in this tab only.
    // Only this browser's own bookmarklet knows the token; a form posted by some other site does not.
    const sharedLeads = storedPayload as { leads?: unknown; token?: unknown; leadsError?: unknown } | null;
    if (sharedLeads?.leadsError) {
      window.history.replaceState({}, "", window.location.pathname);
      const frame = requestAnimationFrame(() => { consumeShared(); setError(sharedLeads.leadsError === "too_large" ? "Цуглуулсан зарын хэмжээ хэт их байна. Цөөн пост харагдах хуудсан дээр дахин оролдоно уу." : "Цуглуулсан зарын өгөгдөл уншигдсангүй. Хавчуургаа дахин чирж суулгаад оролдоно уу."); });
      return () => cancelAnimationFrame(frame);
    }
    if (sharedLeads?.leads) {
      let trusted = false;
      try { trusted = typeof sharedLeads.token === "string" && sharedLeads.token === window.localStorage.getItem("ub-price-scout-collector-token"); } catch { trusted = false; }
      const collected = trusted ? parseCollectedLeads(sharedLeads.leads) : [];
      window.history.replaceState({}, "", window.location.pathname);
      const frame = requestAnimationFrame(() => {
        consumeShared();
        if (collected.length) { setLeads(collected); setMode("details"); setDraftReady(true); }
        else setError(trusted ? "Цуглуулсан постуудаас зар, үнэ, холбоос ялгаж чадсангүй. Группийн хайлтын үр дүн дээр дахин оролдоно уу." : "Цуглуулсан зарын эх сурвалж баталгаажсангүй. Доорх хавчуургыг дахин чирж суулгаад ашиглана уу.");
      });
      return () => cancelAnimationFrame(frame);
    }
    const shared = extractSharedPayload(storedPayload) ?? extractSharedIntake(window.location.search);
    if (shared) {
      window.history.replaceState({}, "", window.location.pathname);
      const frame = requestAnimationFrame(() => {
        consumeShared();
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

  function applyLead(lead: CollectedLead) {
    changeMode("details");
    setQuery(lead.query);
    setTargetPrice(lead.price ? String(lead.price) : "");
    // The input only exists once the mode change has committed.
    requestAnimationFrame(() => document.getElementById("product-query")?.focus());
  }

  function reset() {
    setReport(null); setReportId(""); setError(""); setShowNear(false); setDraftReady(mode === "details");
    window.history.replaceState({}, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen">
      <TopBar hasReport={!!report} onReset={reset} />

      {!report && (
        <section className="mx-auto w-full max-w-[760px] px-4 pt-6 pb-12 sm:pt-10" id="top">
          <div className="text-[13px] font-medium text-primary">Улаанбаатарын хараат бус үнийн судалгаа</div>
          <h1 className="mt-2 text-[28px] leading-[1.15] font-semibold tracking-tight sm:text-[44px]">
            Авахаасаа өмнө<br />бодит үнийг мэд.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Facebook зарын текст, холбоос эсвэл дэлгэцийн зургаас барааг таньж, Монголын онлайн дэлгүүрүүдийн бодит үнэтэй харьцуулна.
          </p>

          <IntakeForm
            mode={mode}
            changeMode={changeMode}
            postText={postText}
            setPostText={setPostText}
            listingUrl={listingUrl}
            setListingUrl={setListingUrl}
            query={query}
            setQuery={setQuery}
            targetPrice={targetPrice}
            setTargetPrice={setTargetPrice}
            draftReady={draftReady}
            setDraftReady={setDraftReady}
            draftConfidence={draftConfidence}
            extracting={extracting}
            ocrProgress={ocrProgress}
            loading={loading}
            error={error}
            canInstall={!!installPrompt}
            installApp={installApp}
            extractFromText={extractFromText}
            extractFromUrl={extractFromUrl}
            readScreenshot={readScreenshot}
            submit={submit}
            onExample={() => { changeMode("details"); setQuery(EXAMPLE); setTargetPrice("1900000"); }}
          />

          {loading && <LoadingStage />}

          {!!leads.length && <LeadsInbox leads={leads} onApply={applyLead} />}

          <Collector />

          {!loading && <HowItWorks />}
        </section>
      )}

      {report && (
        <ReportView
          report={report}
          reportId={reportId}
          sourceStats={sourceStats}
          copied={copied}
          shareReport={shareReport}
          showNear={showNear}
          setShowNear={setShowNear}
          leads={leads}
          reset={reset}
        />
      )}
    </main>
  );
}
