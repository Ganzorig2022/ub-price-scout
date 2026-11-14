import type { Dispatch, FormEvent, SetStateAction } from "react";
import { ArrowRight, LoaderCircle, Share2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fieldLabel, kicker, surface } from "./styles";
import type { IntakeMode } from "./types";

type IntakeFormProps = {
  mode: IntakeMode;
  changeMode: (next: IntakeMode) => void;
  postText: string;
  setPostText: Dispatch<SetStateAction<string>>;
  listingUrl: string;
  setListingUrl: Dispatch<SetStateAction<string>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  targetPrice: string;
  setTargetPrice: Dispatch<SetStateAction<string>>;
  draftReady: boolean;
  setDraftReady: Dispatch<SetStateAction<boolean>>;
  draftConfidence: number;
  extracting: boolean;
  ocrProgress: number;
  loading: boolean;
  error: string;
  canInstall: boolean;
  installApp: () => Promise<void>;
  extractFromText: () => void;
  extractFromUrl: () => Promise<void>;
  readScreenshot: (file: File | undefined) => Promise<void>;
  submit: (event: FormEvent) => Promise<void>;
  onExample: () => void;
};

const softButton = "h-11 bg-primary-soft px-4 text-primary hover:bg-primary-soft/70";
const tabTrigger = "h-full px-1 text-xs leading-tight whitespace-normal min-[380px]:text-[13px] sm:text-sm data-active:shadow-soft";
const inputBox = "h-11 bg-card px-3 text-base md:text-base";

/** Screenshot picker. The file input sits inside the label, so a click on the label opens the picker. */
function UploadButton({
  idleText,
  extracting,
  ocrProgress,
  readScreenshot,
}: Pick<IntakeFormProps, "extracting" | "ocrProgress" | "readScreenshot"> & { idleText: string }) {
  return (
    <label
      className={cn(
        buttonVariants({ variant: "outline" }),
        "h-11 bg-card px-4 has-[input:disabled]:cursor-wait has-[input:disabled]:opacity-60 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
      )}
    >
      <Upload aria-hidden="true" />
      {extracting && ocrProgress ? `Уншиж байна ${ocrProgress}%` : idleText}
      <input
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void readScreenshot(file); }}
        disabled={extracting}
      />
    </label>
  );
}

export function IntakeForm(props: IntakeFormProps) {
  const { mode, changeMode, extracting, ocrProgress, readScreenshot, loading, error } = props;
  return (
    <Card className={`${surface} mt-5 overflow-visible p-3 sm:p-5`}>
      <form className="flex flex-col gap-4" onSubmit={props.submit}>
        <Tabs value={mode} onValueChange={(value) => changeMode(value as IntakeMode)}>
          <TabsList className="h-11! w-full" aria-label="Оруулах мэдээллийн төрөл">
            <TabsTrigger className={tabTrigger} value="facebook_text">Facebook зар</TabsTrigger>
            <TabsTrigger className={tabTrigger} value="facebook_link">Зарын холбоос</TabsTrigger>
            <TabsTrigger className={tabTrigger} value="details">Бараагаа бичих</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "facebook_text" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabel} htmlFor="post-text">Facebook зарын текст</label>
              <Textarea
                id="post-text"
                className="min-h-32 bg-card px-3 py-2.5 text-base leading-relaxed md:text-base"
                value={props.postText}
                onChange={(event) => { props.setPostText(event.target.value); props.setDraftReady(false); }}
                placeholder={'Жишээ:\nRedmi Pad 2 Pro 8/256GB\nЦоо шинэ, үнэ 1.9 сая₮'}
                rows={5}
              />
            </div>
            <div className="grid gap-2 sm:flex">
              <Button className={softButton} type="button" onClick={props.extractFromText} disabled={extracting}>
                Текстээс мэдээлэл ялгах
              </Button>
              <UploadButton idleText="Дэлгэцийн зураг уншуулах" extracting={extracting} ocrProgress={ocrProgress} readScreenshot={readScreenshot} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Дэлгэцийн зураг таны төхөөрөмжөөс гарахгүй. Текст танилт хөтөч дотор ажиллана.
            </p>
          </div>
        )}

        {mode === "facebook_link" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabel} htmlFor="listing-url">Нийтэд нээлттэй Facebook холбоос</label>
              <Input
                id="listing-url"
                className={inputBox}
                inputMode="url"
                value={props.listingUrl}
                onChange={(event) => { props.setListingUrl(event.target.value); props.setDraftReady(false); }}
                placeholder="https://facebook.com/…"
              />
            </div>
            <div className="grid gap-2 sm:flex">
              <Button className={softButton} type="button" onClick={() => void props.extractFromUrl()} disabled={extracting}>
                {extracting ? "Уншиж байна…" : "Холбоосоос мэдээлэл авах"}
              </Button>
              <UploadButton idleText="Дэлгэцийн зураг ашиглах" extracting={extracting} ocrProgress={ocrProgress} readScreenshot={readScreenshot} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Facebook хаалттай бол зарын текст эсвэл дэлгэцийн зураг ашиглаарай.
            </p>
          </div>
        )}

        {mode !== "details" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted px-3 py-2.5">
            <Share2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
              <span className={kicker}>ШУУД ХУВААЛЦАХ</span>
              <b className="text-[13px] font-semibold">Facebook → Share (Хуваалцах) → УБ Үнэ Тандагч</b>
              <small className="text-xs leading-relaxed text-muted-foreground">
                Аппыг төхөөрөмждөө суулгасны дараа постын текст, холбоос шууд энд орж ирнэ.
              </small>
            </div>
            {props.canInstall && (
              <Button className="h-9 px-3" type="button" variant="outline" onClick={() => void props.installApp()}>
                Апп суулгах
              </Button>
            )}
          </div>
        )}

        {(mode === "details" || props.draftReady) && (
          <div className={cn("flex flex-col gap-3", mode !== "details" && "rounded-lg border border-border bg-background p-3")}>
            {mode !== "details" && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className={kicker}>ТАНЬСАН МЭДЭЭЛЭЛ</span>
                  <b className="text-sm font-semibold">Шалгаад засварлана уу</b>
                </div>
                <Badge className="h-6 bg-primary-soft px-2.5 text-primary tabular-nums">
                  <strong className="font-semibold">{props.draftConfidence}%</strong>
                </Badge>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabel} htmlFor="product-query">Барааны нэр ба гол үзүүлэлт</label>
              <Input
                id="product-query"
                className={inputBox}
                value={props.query}
                onChange={(event) => props.setQuery(event.target.value)}
                placeholder="Xiaomi Redmi Pad 2 Pro 8GB 256GB"
                autoComplete="off"
              />
            </div>
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex flex-col gap-1.5">
                <label className={fieldLabel} htmlFor="asking-price">
                  Зарын үнэ <span className="font-normal text-muted-foreground">заавал биш</span>
                </label>
                <div className="relative">
                  <Input
                    id="asking-price"
                    className={`${inputBox} pr-9 tabular-nums`}
                    inputMode="numeric"
                    value={props.targetPrice}
                    onChange={(event) => props.setTargetPrice(event.target.value)}
                    placeholder="1,900,000"
                  />
                  <b className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-medium text-muted-foreground">₮</b>
                </div>
              </div>
              <Button className="h-auto min-h-11 px-5 py-2 text-[15px] whitespace-normal" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden="true" /> Дэлгүүрүүдийг шалгаж байна…
                  </>
                ) : (
                  <>
                    УБ-ын үнийг хайх <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
          <span>Жишээгээр үзэх</span>
          <button
            className="rounded font-medium text-primary underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            type="button"
            onClick={props.onExample}
          >
            iPad A16 · 256GB · Wi‑Fi
          </button>
        </div>
      </form>
    </Card>
  );
}
