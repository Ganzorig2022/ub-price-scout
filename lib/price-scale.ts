export type PriceScaleInput = { low: number | null; median: number | null; high: number | null; target: number | null };
export type PriceScale = { low: number; high: number; median: number; target: number | null };

const percent = (value: number, min: number, span: number) => span === 0 ? 50 : Math.round(((value - min) / span) * 1000) / 10;

/**
 * Positions (0-100) for the report's price range bar: the store range, its median and the ad price.
 * The scale stretches to hold an ad price outside the store range, so the marker never leaves the bar.
 * Returns null when there is no store range to draw.
 */
export function priceScale({ low, median, high, target }: PriceScaleInput): PriceScale | null {
  if (low === null || high === null || median === null) return null;
  const min = Math.min(low, target ?? low);
  const max = Math.max(high, target ?? high);
  const span = max - min;
  return { low: percent(low, min, span), high: percent(high, min, span), median: percent(median, min, span), target: target === null ? null : percent(target, min, span) };
}
