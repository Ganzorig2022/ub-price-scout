import { Button } from "@/components/ui/button";
import { dot } from "./styles";

export function BrandMark() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground">
      УБ
    </span>
  );
}

export function TopBar({ hasReport, onReset }: { hasReport: boolean; onReset: () => void }) {
  return (
    <nav className="border-b border-border bg-card print:hidden" aria-label="Үндсэн цэс">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-3 px-4">
        <button
          className="flex items-center gap-2.5 rounded-lg font-semibold text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={onReset}
          aria-label="УБ Үнэ Тандагч нүүр"
        >
          <BrandMark />
          <span>Үнэ Тандагч</span>
        </button>
        <div className="flex items-center gap-3">
          <span className={`items-center gap-2 text-[13px] text-muted-foreground ${hasReport ? "hidden sm:flex" : "flex"}`}>
            <i className={`${dot} bg-state-ok`} /> Дэлгүүрийн бодит үнэ
          </span>
          {hasReport && (
            <Button variant="outline" className="h-9 px-3" onClick={onReset}>
              Шинэ хайлт
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
