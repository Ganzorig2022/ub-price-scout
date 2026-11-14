/** Shared class strings, so the same element looks the same in every card. */

/** Card surface: white, 14px radius, hairline border, very light shadow. */
export const surface = "gap-0 rounded-xl border border-border bg-card py-0 shadow-soft ring-0";

/** Field label: 13px, normal case. */
export const fieldLabel = "text-[13px] font-medium text-foreground";

/**
 * Quiet line above a title. The source strings are written in capitals; this shows them in sentence case
 * (lowercase, first letter capital) without touching the text itself.
 */
export const kicker = "block text-[13px] leading-snug text-muted-foreground lowercase first-letter:uppercase";

/** Small state dot, coloured by the caller. */
export const dot = "inline-block size-2 shrink-0 rounded-full";

/** Small outlined link that looks like a button. */
export const linkButton =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium whitespace-nowrap text-foreground no-underline transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
