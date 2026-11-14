import { priceScale, type PriceScaleInput } from "../../lib/price-scale";
import { money } from "./types";

/** Keeps a marker label inside the bar: near an end it hangs inward instead of being centred on the marker. */
const anchor = (position: number) => position < 10 ? "translate-x-0" : position > 90 ? "-translate-x-full" : "-translate-x-1/2";

/**
 * Store price range with the median and the ad price marked on it. Decorative: the same numbers are in the
 * verdict text and the stat tiles, so it is hidden from screen readers. Renders nothing without a store range.
 */
export function PriceRangeBar({ low, median, high, target }: PriceScaleInput) {
  const scale = priceScale({ low, median, high, target });
  if (!scale) return null;
  // A wide band holds both prices under its own ends. A narrow one gets one centred "low - high" line.
  const wide = scale.high - scale.low >= 65;
  const middle = Math.min(75, Math.max(25, (scale.low + scale.high) / 2));
  return (
    <div className="mt-5 text-xs" aria-hidden="true">
      <div className="relative h-4">
        {scale.target !== null && (
          <span className={`absolute font-medium whitespace-nowrap ${anchor(scale.target)}`} style={{ left: `${scale.target}%` }}>
            зар
          </span>
        )}
      </div>
      <div className="relative h-5">
        <span className={`absolute whitespace-nowrap text-primary ${anchor(scale.median)}`} style={{ left: `${scale.median}%` }}>
          дундаж
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-foreground/10">
        <div
          className="absolute inset-y-0 min-w-1 rounded-full bg-primary/40"
          style={{ left: `${scale.low}%`, width: `${scale.high - scale.low}%` }}
        />
        <span className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-primary" style={{ left: `${scale.median}%` }} />
        {scale.target !== null && (
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
            style={{ left: `${scale.target}%` }}
          />
        )}
      </div>
      <div className="relative mt-2 h-4 text-muted-foreground tabular-nums">
        {wide ? (
          <>
            <span className="absolute whitespace-nowrap" style={{ left: `${scale.low}%` }}>{money(low)}</span>
            <span className="absolute -translate-x-full whitespace-nowrap" style={{ left: `${scale.high}%` }}>{money(high)}</span>
          </>
        ) : (
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${middle}%` }}>
            {low === high ? money(low) : <>{money(low)} - {money(high)}</>}
          </span>
        )}
      </div>
    </div>
  );
}
