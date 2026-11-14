export type Listing = {
  seller: string;
  title: string;
  price: number;
  url: string;
  match: "exact" | "near";
  stock: "in_stock" | "out_of_stock" | "unknown";
  confidence: number;
  checkedAt: string;
  note?: string;
};

export type Source = {
  seller: string;
  searchUrl: string;
  state: "found" | "no_match" | "blocked" | "timed_out" | "unreadable";
  listings: Listing[];
  attemptedQueries?: string[];
};

export type FacebookLead = { seller: string; pageUrl: string; searchUrl: string; status: "manual_lead" };

export type Report = {
  query: string;
  targetPrice: number | null;
  listingUrl: string | null;
  verdict: "great" | "fair" | "high" | "insufficient";
  median: number | null;
  low: number | null;
  high: number | null;
  exact: Listing[];
  near: Listing[];
  sources: Source[];
  facebookLeads?: FacebookLead[];
  checkedAt: string;
};

export type SourceStats = { checked: number; reached: number; blocked: number; unreadable: number };
export type IntakeMode = "details" | "facebook_text" | "facebook_link";
export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export const money = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("mn-MN").format(value)}₮`;

export const relativeTime = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? "дөнгөж сая" : `${minutes} минутын өмнө`;
};
