import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { dot } from "./styles";
import { money, type Listing } from "./types";

const STOCK_DOT = { in_stock: "bg-state-ok", out_of_stock: "bg-state-bad", unknown: "bg-state-unknown" } as const;
const rowClass = "grid grid-cols-[1.75rem_minmax(0,1fr)_auto_1rem] items-center gap-x-3 gap-y-0.5 px-4 py-3.5 text-foreground no-underline";

/** One store offer. `cheapest` marks the first exact match (the list is already sorted by price). */
export function ListingRow({ item, rank, cheapest = false }: { item: Listing; rank: number; cheapest?: boolean }) {
  let safeUrl: string | null = null;
  try { const parsed = new URL(item.url); safeUrl = parsed.protocol === "https:" ? parsed.toString() : null; } catch { safeUrl = null; }
  const content = (
    <>
      <span className="text-xs text-muted-foreground tabular-nums max-sm:row-start-1">{String(rank).padStart(2, "0")}</span>
      <div className="flex min-w-0 flex-col gap-0.5 max-sm:contents">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 max-sm:col-start-2 max-sm:row-start-1">
          <b className="text-[15px] font-semibold">{item.seller}</b>
          {cheapest && <Badge className="bg-primary-soft text-primary">Хамгийн хямд</Badge>}
        </span>
        <span className="line-clamp-2 text-[13px] text-muted-foreground max-sm:col-span-3 max-sm:col-start-2 max-sm:row-start-2">{item.title}</span>
        <small className="flex items-center gap-1.5 text-xs text-muted-foreground max-sm:col-span-3 max-sm:col-start-2 max-sm:row-start-3">
          <i className={`${dot} ${STOCK_DOT[item.stock]}`} /> {item.stock === "in_stock" ? "Үлдэгдэлтэй" : item.stock === "out_of_stock" ? "Дууссан" : "Үлдэгдэл тодорхойгүй"} · {item.confidence}% тохирол
        </small>
      </div>
      <strong className="text-base font-semibold whitespace-nowrap tabular-nums max-sm:col-start-3 max-sm:row-start-1 sm:text-lg">{money(item.price)}</strong>
      <span className="text-muted-foreground max-sm:col-start-4 max-sm:row-start-1">{safeUrl ? <ExternalLink className="size-4" aria-hidden="true" /> : ""}</span>
    </>
  );
  return safeUrl ? (
    <a className={`${rowClass} transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none`} href={safeUrl} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <div className={rowClass}>{content}</div>
  );
}
