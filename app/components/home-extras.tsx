import { LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { surface } from "./styles";

const STEPS = [
  { index: "01", title: "Тодорхойлно", text: "Загвар, багтаамж, холболт болон төлөвөөр нь яг ижил барааг танина." },
  { index: "02", title: "Харьцуулна", text: "Зөвхөн ижил үзүүлэлттэй саналуудыг бодит үнийн хүрээнд оруулж, төстэйг нь тусад нь харуулна." },
  { index: "03", title: "Дүгнэнэ", text: "Тодорхой үнэлгээ, эх сурвалжийн холбоос болон шалгасан хугацааг ил тод харуулна." },
];

/** The three "how it works" steps: one row from tablet width up, three short lines on a phone. */
export function HowItWorks() {
  return (
    <section className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-3" aria-label="Хэрхэн ажиллах вэ">
      {STEPS.map((step) => (
        <div className="flex gap-3 sm:flex-col sm:gap-2" key={step.index}>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary tabular-nums">
            {step.index}
          </span>
          <div>
            <strong className="text-sm font-semibold">{step.title}</strong>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

const LOADING_SHOPS = ["Best Computers", "iTStore", "PC Mall", "SEGU", "BedRock", "iPick", "x86", "+8 дэлгүүр"];

export function LoadingStage() {
  return (
    <Card className={`${surface} mt-4 items-center px-4 py-8 text-center`}>
      <section className="flex flex-col items-center" aria-live="polite">
        <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold">Онлайн дэлгүүрүүдээр хайж байна…</h2>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
          Дэлгүүрүүдийн хайлтын хуудсыг шалгаж, яг ижил болон төстэй барааг ялгаж байна.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {LOADING_SHOPS.map((shop) => (
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground" key={shop}>
              {shop}
            </span>
          ))}
        </div>
      </section>
    </Card>
  );
}
