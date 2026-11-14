import { cn } from "@/lib/utils";
import { PriceRangeBar } from "./price-range-bar";
import { dot, kicker } from "./styles";
import { money, type Report } from "./types";

/** great = green, fair = light green tint, high = warm tint, insufficient = grey. */
const TONE = {
  great: { card: "border-primary/25 bg-primary-soft", word: "text-primary", dot: "bg-state-ok" },
  fair: { card: "border-border bg-primary-soft/50", word: "text-foreground", dot: "bg-state-ok" },
  high: { card: "border-warm/25 bg-warm-soft", word: "text-warm", dot: "bg-warm" },
  insufficient: { card: "border-border bg-muted", word: "text-foreground", dot: "bg-state-unknown" },
} as const;

export function VerdictCard({ report }: { report: Report }) {
  const tone = TONE[report.verdict];
  return (
    <div className={`mt-5 rounded-xl border p-4 sm:p-6 ${tone.card}`}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
        <div>
          <div className={kicker}>ҮНИЙН ДҮГНЭЛТ</div>
          <div className="mt-1 flex items-center gap-2.5">
            <i className={cn(dot, "size-2.5", tone.dot)} />
            <span className={`text-2xl leading-tight font-semibold sm:text-[28px] ${tone.word}`}>
              {report.verdict === "great" ? "Маш сайн үнэ" : report.verdict === "fair" ? "Боломжийн үнэ" : report.verdict === "high" ? "Өндөр үнэ" : "Нэмэлт мэдээлэл хэрэгтэй"}
            </span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed">
            {report.verdict === "great" ? "Энэ зарын үнэ ижил барааны одоогийн дундаж үнээс мэдэгдэхүйц хямд байна." : report.verdict === "fair" ? "Энэ зарын үнэ ижил барааны зах зээлийн боломжийн хүрээнд байна." : report.verdict === "high" ? "Энэ зарын үнэ ижил барааны одоогийн зах зээлийн хүрээнээс өндөр байна." : "Найдвартай, яг ижил барааны үнийн хүрээ олдсонгүй. Доорх эх сурвалжуудыг нээх эсвэл барааны үзүүлэлтийг нарийвчилна уу."}
          </p>
        </div>
        <div className="flex flex-col sm:items-end sm:text-right">
          <span className="text-[13px] text-muted-foreground">Зарын үнэ</span>
          <strong className="text-2xl font-semibold tabular-nums">{money(report.targetPrice)}</strong>
          {report.targetPrice && report.median && (
            <small className="mt-0.5 text-[13px] tabular-nums">
              Дундаж үнээс {Math.abs(Math.round((report.targetPrice / report.median - 1) * 100))}% {report.targetPrice > report.median ? "өндөр" : "хямд"}
            </small>
          )}
        </div>
      </div>
      <PriceRangeBar low={report.low} median={report.median} high={report.high} target={report.targetPrice} />
    </div>
  );
}
