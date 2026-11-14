"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { summarizeLeads, type CollectedLead } from "../../lib/facebook-collect";
import { LeadRow, LeadsHead } from "./leads-inbox";
import { kicker, surface } from "./styles";
import { money } from "./types";

/** Second-hand asking prices for the queried product, from the user's own collected posts. Never mixed into the store median. */
export function SecondHandBand({ leads, query }: { leads: CollectedLead[]; query: string }) {
  const summary = useMemo(() => summarizeLeads(leads, query), [leads, query]);
  const band = [
    { label: "ХАМГИЙН ХЯМД", value: summary.low },
    { label: "2-Р ГАР ДУНДАЖ", value: summary.median },
    { label: "ХАМГИЙН ӨНДӨР", value: summary.high },
  ];
  return (
    <Card className={`${surface} mt-6`}>
      <section aria-labelledby="second-hand-title">
        <LeadsHead
          label="FACEBOOK 2-Р ГАР · ТАНЫ ЦУГЛУУЛСАН · ДЭЛГҮҮРИЙН ДУНДАЖИД ОРООГҮЙ"
          title="Ижил барааны 2-р гар үнэ"
          titleId="second-hand-title"
          count={summary.matched.length}
        />
        {summary.matched.length ? (
          <>
            <div className="mt-3 grid divide-y divide-border border-t border-border bg-background/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {band.map((cell) => (
                <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:flex-col sm:gap-1" key={cell.label}>
                  <span className={kicker}>{cell.label}</span>
                  <strong className="text-lg font-semibold tabular-nums">{money(cell.value)}</strong>
                </div>
              ))}
            </div>
            <div className="divide-y divide-border border-t border-border">
              {summary.matched.map((lead) => (
                <LeadRow lead={lead} key={lead.url} />
              ))}
            </div>
          </>
        ) : (
          <p className="px-4 pt-2 pb-4 text-[13px] leading-relaxed text-muted-foreground">
            Цуглуулсан {leads.length} зарын дотор энэ бараатай тохирох, үнэтэй пост олдсонгүй.
          </p>
        )}
      </section>
    </Card>
  );
}
