import assert from "node:assert/strict";
import test from "node:test";

import { priceScale } from "../lib/price-scale.ts";

test("places the store range, the median and the ad price on one 0-100 scale", () => {
  const scale = priceScale({ low: 1_000_000, median: 1_500_000, high: 2_000_000, target: 1_250_000 });
  assert.deepEqual(scale, { low: 0, high: 100, median: 50, target: 25 });
});

test("stretches the scale when the ad price is outside the store range", () => {
  const cheap = priceScale({ low: 1_000_000, median: 1_500_000, high: 2_000_000, target: 500_000 });
  assert.equal(cheap?.target, 0);
  assert.equal(cheap?.low, 33.3);
  assert.equal(cheap?.high, 100);
  const dear = priceScale({ low: 1_000_000, median: 1_500_000, high: 2_000_000, target: 3_000_000 });
  assert.equal(dear?.target, 100);
  assert.equal(dear?.low, 0);
  assert.equal(dear?.high, 50);
});

test("has no ad marker when there is no ad price", () => {
  const scale = priceScale({ low: 1_000_000, median: 1_200_000, high: 2_000_000, target: null });
  assert.deepEqual(scale, { low: 0, high: 100, median: 20, target: null });
});

test("centres everything when a single offer is the whole range", () => {
  const scale = priceScale({ low: 1_900_000, median: 1_900_000, high: 1_900_000, target: 1_900_000 });
  assert.deepEqual(scale, { low: 50, high: 50, median: 50, target: 50 });
});

test("returns null when there is no store range to draw", () => {
  assert.equal(priceScale({ low: null, median: null, high: null, target: 1_900_000 }), null);
  assert.equal(priceScale({ low: 1_000_000, median: null, high: null, target: null }), null);
});
