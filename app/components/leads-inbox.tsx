import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CollectedLead } from "../../lib/facebook-collect";
import { kicker, linkButton, surface } from "./styles";
import { money } from "./types";

/** Card head shared by the collected-leads cards: quiet line, title, and a Facebook-blue count. */
export function LeadsHead({ label, title, titleId, count }: { label: string; title: string; titleId: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 pt-4">
      <div className="min-w-0">
        <span className={kicker}>{label}</span>
        <h3 className="mt-0.5 text-base font-semibold" id={titleId}>{title}</h3>
      </div>
      <Badge className="h-6 bg-facebook/10 px-2.5 text-facebook tabular-nums">
        <b className="font-semibold">{count}</b>
      </Badge>
    </div>
  );
}

/** One collected Facebook post. `onApply` adds the "check this product" button. */
export function LeadRow({ lead, onApply }: { lead: CollectedLead; onApply?: (lead: CollectedLead) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="truncate text-sm font-medium">{lead.query || lead.excerpt}</b>
        <small className="truncate text-xs text-muted-foreground">{lead.excerpt}</small>
      </div>
      <strong className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{money(lead.price)}</strong>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        {onApply && (
          <Button className="h-8 bg-primary-soft px-3 text-[13px] text-primary hover:bg-primary-soft/70" type="button" onClick={() => onApply(lead)}>
            Энэ барааг шалгах
          </Button>
        )}
        <a className={linkButton} href={lead.url} target="_blank" rel="noreferrer">
          Пост <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** Posts brought in by the Facebook group bookmarklet. They live in this tab only. */
export function LeadsInbox({ leads, onApply }: { leads: CollectedLead[]; onApply: (lead: CollectedLead) => void }) {
  return (
    <Card className={`${surface} mt-4`}>
      <section aria-labelledby="leads-inbox-title">
        <LeadsHead
          label="FACEBOOK ГРУППЭЭС ЦУГЛУУЛСАН · ЗӨВХӨН ЭНЭ ТАБ ДЭЭР"
          title="Цуглуулсан зарууд"
          titleId="leads-inbox-title"
          count={leads.length}
        />
        <p className="px-4 pt-2 pb-3 text-[13px] leading-relaxed text-muted-foreground">
          Эдгээр зар таны хөтчөөс ирсэн бөгөөд серверт хадгалагдахгүй. Нэгийг нь сонгоод дэлгүүрийн үнэтэй харьцуулна уу; хайлтын дараа ижил барааны 2-р гар үнийн хүрээг тусад нь харуулна.
        </p>
        <div className="divide-y divide-border border-t border-border">
          {leads.map((lead) => (
            <LeadRow lead={lead} onApply={onApply} key={lead.url} />
          ))}
        </div>
      </section>
    </Card>
  );
}
