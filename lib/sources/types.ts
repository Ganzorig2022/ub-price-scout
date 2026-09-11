import type { MatchKind } from "../matching.ts";

export type Stock = "in_stock" | "out_of_stock" | "unknown";

export type Listing = {
  seller: string;
  title: string;
  price: number;
  url: string;
  match: MatchKind;
  stock: Stock;
  confidence: number;
  checkedAt: string;
  note?: string;
};

export type SourceState = "found" | "no_match" | "blocked" | "timed_out" | "unreadable";

export type SourceResult = {
  seller: string;
  searchUrl: string;
  state: SourceState;
  listings: Listing[];
  attemptedQueries?: string[];
};

/** One retailer. `search` returns raw candidates; the registry filters, ranks and dedupes them. */
export type SourceDefinition = {
  seller: string;
  /** Page a human can open for the same query. */
  searchUrl: (query: string) => string;
  /** How the data is read — shown in the ledger so nobody mistakes a link for a scrape. */
  method: "api" | "html";
  search: (query: string) => Promise<RawCandidate[]>;
};

/** Untyped listing before product matching. */
export type RawCandidate = {
  title: string;
  price: number | null;
  url: string;
  stock: Stock;
  note?: string;
};

export class SourceError extends Error {
  readonly state: Exclude<SourceState, "found" | "no_match">;
  constructor(state: Exclude<SourceState, "found" | "no_match">, message?: string) {
    super(message ?? state);
    this.name = "SourceError";
    this.state = state;
  }
}
