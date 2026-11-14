"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { bookmarkletHref, readOrCreateCollectorToken } from "../../lib/facebook-collect";
import { dot, kicker, surface } from "./styles";

/**
 * Bookmarklet install card, folded by default. React refuses `javascript:` hrefs in JSX, so the link is set
 * after mount from our own constant. The panel is `keepMounted`, so the link is in the DOM while folded.
 */
export function Collector() {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    let token = "";
    try { token = readOrCreateCollectorToken(window.localStorage); } catch { token = ""; }
    link.current?.setAttribute("href", bookmarkletHref(window.location.origin, token));
  }, []);
  return (
    <Card className={`${surface} mt-4`}>
      <section aria-labelledby="collector-title">
        <Collapsible>
          <h3 className="text-[15px] font-semibold" id="collector-title">
            <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset">
              <i className={`${dot} bg-facebook`} />
              <span className="min-w-0 flex-1">
                <span className={`${kicker} font-normal`}>FACEBOOK ГРУПП · 2-Р ГАР</span>
                Группийн заруудыг нэг товчоор энд авчир
              </span>
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" aria-hidden="true" />
            </CollapsibleTrigger>
          </h3>
          <CollapsibleContent keepMounted>
            <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Facebook группийн хайлт, feed эсвэл Marketplace жагсаалтыг нээгээд доорх товчийг дарна. Дэлгэц дээр харагдаж буй постуудын текст, үнэ, холбоос энд ирнэ. Ажиллах бүрд та өөрөө дарна; апп Facebook руу өөрөө ханддаггүй.
              </p>
              <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-foreground">
                <li>Доорх товчийг хөтчийнхөө хавчуурга (bookmarks) мөр рүү чирнэ. Утсан дээр: хавчуурга болгож хадгалаад нэрийг нь хаягийн мөрөнд бичиж нээнэ.</li>
                <li>Facebook дээр группийн хайлтын үр дүн эсвэл Marketplace-ийн жагсаалтыг нээнэ.</li>
                <li>Хавчуургыг дарна — цуглуулсан зарууд шинэ таб дээр энд нээгдэнэ.</li>
              </ol>
              <a
                ref={link}
                href="#collector-title"
                className="inline-flex cursor-grab flex-wrap items-center gap-x-2 self-start rounded-lg border border-primary/25 bg-primary-soft px-4 py-2.5 text-sm font-semibold text-primary no-underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
                title="Хавчуурга мөр рүү чирнэ үү. Энд дарвал зөвхөн Facebook дээр ажиллана гэсэн мэдэгдэл гарна."
                draggable
              >
                УБ Үнэ Тандагч ← FB
                <small className="text-xs font-normal text-muted-foreground">чирж хавчуурга болго</small>
              </a>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </section>
    </Card>
  );
}
