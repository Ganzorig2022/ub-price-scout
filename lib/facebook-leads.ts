export type FacebookLead = {
  seller: string;
  pageUrl: string;
  searchUrl: string;
  status: "manual_lead";
};

const FACEBOOK_MERCHANTS = [
  { seller: "BedRock", pageUrl: "https://www.facebook.com/TheBedRockmn" },
  { seller: "Best Computers", pageUrl: "https://www.facebook.com/BestComputers.mn" },
  { seller: "iTStore", pageUrl: "https://www.facebook.com/ITStore.mn/" },
  { seller: "PC Mall", pageUrl: "https://www.facebook.com/PCmallOfficial" },
  { seller: "iPick", pageUrl: "https://www.facebook.com/iPickElectronic" },
  { seller: "TurboTech", pageUrl: "https://www.facebook.com/p/TurboTech-100044573913240/" },
  { seller: "Arina", pageUrl: "https://www.facebook.com/arinacomputer" },
] as const;

function postSearchUrl(query: string) {
  const url = new URL("https://www.facebook.com/search/posts/");
  url.searchParams.set("q", query);
  return url.toString();
}

export function facebookMerchantLeads(query: string): FacebookLead[] {
  const normalized = query.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!normalized) return [];
  return [
    { seller: "Facebook бүх пост", pageUrl: "https://www.facebook.com/search/posts/", searchUrl: postSearchUrl(normalized), status: "manual_lead" },
    ...FACEBOOK_MERCHANTS.map((merchant) => ({
      ...merchant,
      searchUrl: postSearchUrl(`${normalized} ${merchant.seller}`),
      status: "manual_lead" as const,
    })),
  ];
}
