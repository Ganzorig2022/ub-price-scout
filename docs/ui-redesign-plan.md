# UI redesign plan - "Clean and calm"

Branch: `feat/clean-calm-ui`. Started 2026-11-14. Owner picked the look and allowed a UI library.

## Decisions (do not ask again)

- Look: **Clean and calm**. Light neutral background, soft rounded cards, one green accent. No hard black
  shadows, no rotated labels, no acid green blocks.
- Library: **shadcn/ui** on the Tailwind 4 that is already installed, with `lucide-react` icons.
  First step is to prove `npx shadcn@latest init` works in this vinext project. If it does not, build the
  same design with plain Tailwind classes and say so. Do not fight the tool for long.
- Font: **Golos Text** for everything, `subsets: ["cyrillic", "cyrillic-ext", "latin"]`. It has the Mongolian
  letters (ө ү). Drop `Instrument_Serif` (Latin only, so Mongolian headlines fell back to a default serif).
- No dark mode in this change. Set `color-scheme: light`.

## Problems to fix

1. `app/layout.tsx`: display font is Latin only; body font lacks `cyrillic-ext`.
2. About 20 labels are 9-11px uppercase with wide spacing. Minimum text size becomes 12px, labels 13px,
   normal case.
3. Phone: the form must be the first thing on screen. Headline becomes small (about 28-44px).
4. Home page is too long. Fold the bookmarklet card (`Collector`) into a collapsible. Remove the
   `source-strip`. Make the 3 "how it works" boxes one compact row.
5. Report: add a price range bar that shows low, median, high and where the ad price sits.
   Logic is done and tested: `lib/price-scale.ts` (`priceScale`), `tests/price-scale.test.mjs`.
6. Replace the text arrows ("↗", "→") with lucide icons.

## Layout

- Home: top bar (brand, "Шинэ хайлт" when a report is open) > short headline + one line of copy > search card
  (shadcn `Tabs` for the 3 intake modes, `Textarea`, `Input`, `Button`) > share tip as a quiet info row >
  collected leads (if any) > folded "Facebook группээс зар цуглуулах" (`Collapsible`) > 3 steps in one row.
- Report: meta line + product name + actions > verdict card (status dot, verdict word, sentence, ad price,
  percent from median, range bar) > 3 stat tiles > exact listings (cheapest row gets a "Хамгийн хямд" badge;
  `exact` is already sorted by price) > near matches (folded) > second-hand band > Facebook leads >
  source list with state dots.
- Verdict colours: great = green, fair = neutral green tint, high = warm orange tint, insufficient = grey.
- Numbers use `font-variant-numeric: tabular-nums`.

## Must not break

- `tests/rendered-html.test.mjs` needs these strings in the server HTML: `УБ Үнэ Тандагч`, `Авахаасаа өмнө`,
  `Facebook зар`, `Дэлгэцийн зураг уншуулах`, `Текстээс мэдээлэл ялгах`,
  `Facebook → Share (Хуваалцах) → УБ Үнэ Тандагч`. The default tab must stay `facebook_text` and render on
  the server.
- `Collector` sets the bookmarklet `href` from a ref after mount. Inside a collapsible the link must stay in
  the DOM while folded (use `forceMount` or plain `<details>`).
- All state and handlers in `app/page.tsx` stay as they are. This change is markup and style only.
- `id="product-query"` and `id="report"` are used by focus and scroll code.

## Steps

1. shadcn init + add `button input textarea tabs card badge collapsible`. Run `npm run build` to prove vinext
   accepts it.
2. `app/layout.tsx` font, `app/globals.css` tokens (replace the old stylesheet).
3. `app/page.tsx` markup. Split into `app/components/` if the file passes 400 lines.
4. `public/manifest.webmanifest` `background_color` to the new background.
5. Checks: `npm run lint`, `npx tsc --noEmit`, `npm test`.
6. Smoke: `npm run dev`, open at phone width (390px) and desktop, run the example scan, look at the report.
   Take screenshots into `~/Desktop/ub-price-scout-ui/`.
7. Review: `react-reviewer` on the diff.

## Not in this change

- `public/icon-*.png`, `public/og.png`, `public/favicon.svg` still carry the old look. Tell the owner.
- No change to scan, intake, sources or the database.
