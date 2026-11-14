import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { dot, kicker, linkButton, surface } from "./styles";
import type { FacebookLead, Source } from "./types";

const STATE_DOT = {
  found: "bg-state-ok",
  no_match: "bg-state-unknown",
  blocked: "bg-state-bad",
  timed_out: "bg-state-warn",
  unreadable: "bg-state-violet",
} as const;

/** Every shop the scan tried, with a state dot and a link to the shop's own search page. */
export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <aside className="min-w-0">
      <div>
        <span className={kicker}>ЭХ СУРВАЛЖИЙН БҮРТГЭЛ</span>
        <h3 className="mt-0.5 text-lg font-semibold">Шалгасан дэлгүүрүүд</h3>
      </div>
      <Card className={`${surface} mt-3`}>
        <div className="-mb-px grid sm:grid-cols-2 lg:grid-cols-1">
          {sources.map((source) => (
            <a
              className="grid grid-cols-[0.5rem_minmax(0,1fr)_1rem] items-center gap-3 border-b border-border px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              href={source.searchUrl}
              target="_blank"
              rel="noreferrer"
              key={source.seller}
            >
              <span className={`${dot} ${STATE_DOT[source.state]}`} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <b className="truncate text-sm font-medium">{source.seller}</b>
                <small className="text-xs text-muted-foreground">
                  {source.state === "found" ? `${source.listings.length} боломжит бараа` : source.state === "no_match" ? "Хариу өгсөн · бараа олдоогүй" : source.state === "unreadable" ? `Каталог автоматаар уншигдсангүй${source.attemptedQueries && source.attemptedQueries.length > 1 ? " · 2 хайлт" : ""}` : source.state === "timed_out" ? "Хугацаа хэтэрсэн" : "Хандалт хязгаарлагдсан"}
                </small>
              </div>
              <span className="text-muted-foreground">
                <ExternalLink className="size-4" aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </Card>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Эдгээр үнэ нь судалгааны баримт болохоос худалдан авах зөвлөмж биш. Эцсийн үнэ, НӨАТ-ын баримт, баталгаа болон үлдэгдлийг худалдагчаас заавал лавлаарай.
      </p>
    </aside>
  );
}

/** Facebook seller pages to check by hand. Not verified prices, and not part of the market median. */
export function FacebookLeads({ leads }: { leads: FacebookLead[] }) {
  return (
    <Card className={`${surface} mt-6`}>
      <section aria-labelledby="facebook-leads-title">
        <div className="flex items-center justify-between gap-4 px-4 pt-4">
          <div className="min-w-0">
            <span className={kicker}>FACEBOOK СЭЖИМ · ГАРААР ШАЛГАНА</span>
            <h3 className="mt-0.5 text-base font-semibold" id="facebook-leads-title">Facebook худалдааны постууд</h3>
          </div>
          <Badge className="h-6 bg-facebook/10 px-2.5 text-facebook tabular-nums">
            <b className="font-semibold">{leads.length}</b>
          </Badge>
        </div>
        <p className="px-4 pt-2 pb-3 text-[13px] leading-relaxed text-muted-foreground">
          Facebook хайлтын үр дүнг таны нэвтэрсэн төхөөрөмж дээр нээнэ. Эдгээр нь автоматаар баталгаажсан үнэ биш бөгөөд зах зээлийн дундажт ороогүй.
        </p>
        <div className="divide-y divide-border border-t border-border">
          {leads.map((lead) => (
            <div className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" key={lead.seller}>
              <div className="grid grid-cols-[0.5rem_minmax(0,1fr)] items-center gap-x-2.5">
                <i className={`${dot} bg-facebook`} /> <b className="text-sm font-medium">{lead.seller}</b>
                <small className="col-start-2 text-xs text-muted-foreground">Баталгаажаагүй Facebook сэжим</small>
              </div>
              <div className="flex gap-2">
                <a className={`${linkButton} flex-1 sm:flex-none`} href={lead.searchUrl} target="_blank" rel="noreferrer">
                  Пост хайх <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
                <a className={`${linkButton} flex-1 sm:flex-none`} href={lead.pageUrl} target="_blank" rel="noreferrer">
                  Хуудас
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Card>
  );
}
