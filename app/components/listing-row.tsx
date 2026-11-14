import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { dot } from "./styles";
import { money, type Listing } from "./types";

const STOCK_DOT = { in_stock: "bg-state-ok", out_of_stock: "bg-state-bad", unknown: "bg-state-unknown" } as const;
const rowClass = "grid grid-cols-[1.75rem_minmax(0,1fr)_auto_1rem] items-center gap-x-3 px-4 py-3.5 text-foreground no-underline";

/** One store offer. `cheapest` marks the first exact match (the list is already sorted by price). */
export function ListingRow({ item, rank, cheapest = false }: { item: Listing; rank: number; cheapest?: boolean }) {
  let safeUrl: string | null = null;
  try { const parsed = new URL(item.url); safeUrl = parsed.protocol === "https:" ? parsed.toString() : null; } catch { safeUrl = null; }
  const content = (
    <>
      <span className="text-xs text-muted-foreground tabular-nums">{String(rank).padStart(2, "0")}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-[15px] font-semibold">{item.seller}</b>
          {cheapest && <Badge className="bg-primary-soft text-primary">Хамгийн хямд</Badge>}
        </span>
        <span className="truncate text-[13px] text-muted-foreground">{item.title}</span>
        <small className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <i className={`${dot} ${STOCK_DOT[item.stock]}`} /> {item.stock === "in_stock" ? "Үлдэгдэлтэй" : item.stock === "out_of_stock" ? "Дууссан" : "Үлдэгдэл тодорхойгүй"} · {item.confidence}% тохирол
        </small>
      </div>
      <strong className="text-base font-semibold whitespace-nowrap tabular-nums sm:text-lg">{money(item.price)}</strong>
      <span className="text-muted-foreground">{safeUrl ? <ExternalLink className="size-4" aria-hidden="true" /> : ""}</span>
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
