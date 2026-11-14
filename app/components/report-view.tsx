import type { Dispatch, SetStateAction } from "react";
import { ArrowRight, ChevronDown, ExternalLink, Printer, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CollectedLead } from "../../lib/facebook-collect";
import { ListingRow } from "./listing-row";
import { SecondHandBand } from "./second-hand-band";
import { FacebookLeads, SourceList } from "./source-list";
import { kicker, linkButton, surface } from "./styles";
import { BrandMark } from "./top-bar";
import { money, relativeTime, type Report, type SourceStats } from "./types";
import { VerdictCard } from "./verdict-card";

type ReportViewProps = {
  report: Report;
  reportId: string;
  sourceStats: SourceStats;
  copied: boolean;
  shareReport: () => Promise<void>;
  showNear: boolean;
  setShowNear: Dispatch<SetStateAction<boolean>>;
  leads: CollectedLead[];
  reset: () => void;
};

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className={`${surface} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 sm:flex sm:flex-col sm:items-start sm:gap-1 sm:py-4`}>
      <span className={kicker}>{label}</span>
      <strong className="row-span-2 text-xl font-semibold tabular-nums sm:text-2xl">{value}</strong>
      <small className="truncate text-xs text-muted-foreground sm:max-w-full">{note}</small>
    </Card>
  );
}

export function ReportView({ report, reportId, sourceStats, copied, shareReport, showNear, setShowNear, leads, reset }: ReportViewProps) {
  return (
    <section className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:py-10 print:p-5" id="report">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-primary">Зах зээлийн тайлан · {relativeTime(report.checkedAt)}</div>
          <h2 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-balance sm:text-[34px] lg:text-[40px]">{report.query}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground tabular-nums">
            {sourceStats.checked} эх сурвалж шалгасан · {sourceStats.reached} хариу өгсөн · {sourceStats.unreadable} автоматаар уншигдаагүй · {sourceStats.blocked} хаалттай
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
          {report.listingUrl && (
            <a className={`${linkButton} h-10`} href={report.listingUrl} target="_blank" rel="noreferrer">
              Эх зар <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          )}
          <Button
            className="h-10 bg-card px-3 disabled:pointer-events-auto disabled:cursor-not-allowed"
            variant="outline"
            onClick={shareReport}
            disabled={!reportId}
            title={reportId ? undefined : "Энэ тайланг хуваалцахаар хадгалж чадсангүй"}
          >
            <Share2 aria-hidden="true" />
            {copied ? "Холбоос хууллаа ✓" : reportId ? "Тайлан хуваалцах" : "Хуваалцах боломжгүй"}
          </Button>
          <Button className="size-10 bg-card" variant="outline" size="icon" onClick={() => window.print()} aria-label="Тайлан хэвлэх">
            <Printer aria-hidden="true" />
          </Button>
        </div>
      </header>

      <VerdictCard report={report} />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatTile label="ХАМГИЙН ХЯМД" value={money(report.low)} note={report.exact[0]?.seller ?? "Яг ижил бараа олдсонгүй"} />
        <StatTile label="ЗАХ ЗЭЭЛИЙН ДУНДАЖ" value={money(report.median)} note={`Яг ижил ${report.exact.length} бодит санал`} />
        <StatTile label="ХАМГИЙН ӨНДӨР" value={money(report.high)} note="Зөвхөн яг ижил үзүүлэлтээр" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className={kicker}>БОДИТ ҮНИЙН ХАРЬЦУУЛАЛТ</span>
              <h3 className="mt-0.5 text-lg font-semibold">Яг ижил бараа</h3>
            </div>
            <Badge className="h-6 px-2.5 tabular-nums" variant="secondary">{report.exact.length}</Badge>
          </div>
          {report.exact.length ? (
            <Card className={`${surface} mt-3 divide-y divide-border`}>
              {report.exact.map((item, index) => (
                <ListingRow item={item} key={`${item.url}-${index}`} rank={index + 1} cheapest={index === 0} />
              ))}
            </Card>
          ) : (
            <Card className={`${surface} mt-3 flex-row items-start gap-4 p-4 sm:p-5`}>
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">?</div>
              <div>
                <h3 className="text-base font-semibold">Баталгаатай, яг ижил бараа олдсонгүй</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Зарим дэлгүүр бараагаа скриптийн цаана нуух эсвэл автомат хандалтыг хаах боломжтой. Аль эх сурвалж хариу өгснийг баруун талын жагсаалтаас харна уу. Загварын нэрийг товчлох эсвэл доорх Facebook сэжмүүдийг нээгээрэй.
                </p>
              </div>
            </Card>
          )}

          {!!report.near.length && (
            <Card className={`${surface} mt-6`}>
              <button
                className="group flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
                onClick={() => setShowNear((value) => !value)}
                aria-expanded={showNear}
                aria-controls="near-match-results"
              >
                <span>
                  <b className="font-semibold">Төстэй бараа</b> · үнийн дүгнэлтэд ороогүй
                </span>
                <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                  {report.near.length} <ChevronDown className="size-5 transition-transform group-aria-expanded:rotate-180" aria-hidden="true" />
                </span>
              </button>
              {showNear && (
                <div className="divide-y divide-border border-t border-border" id="near-match-results">
                  {report.near.map((item, index) => (
                    <ListingRow item={item} key={`${item.url}-${index}`} rank={index + 1} />
                  ))}
                </div>
              )}
            </Card>
          )}

          {!!leads.length && <SecondHandBand leads={leads} query={report.query} />}

          {!!report.facebookLeads?.length && <FacebookLeads leads={report.facebookLeads} />}
        </div>

        <SourceList sources={report.sources} />
      </div>

      <footer className="mt-10 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <b className="font-semibold">Үнэ Тандагч</b>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {reportId ? `Тайлан ${reportId} · ` : "Хадгалаагүй тайлан · "}{new Date(report.checkedAt).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" })} цагт үүсгэв
        </p>
        <Button className="h-9 self-start px-0 sm:self-auto print:hidden" variant="link" onClick={reset}>
          Өөр бараа шалгах <ArrowRight aria-hidden="true" />
        </Button>
      </footer>
    </section>
  );
}
