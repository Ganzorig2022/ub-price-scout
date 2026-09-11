import { extractAskingPrice, extractProductQuery, facebookListingUrl } from "./intake.ts";
import { compareProductTitle } from "./matching.ts";

/**
 * Second-hand listings live in Facebook groups, behind a login. The server never
 * reads them. Instead the user runs a bookmarklet on the group page they are
 * already looking at; it collects the visible posts and submits them to `/share`
 * as a plain form post (Facebook's page policy blocks scripts from calling other
 * sites, but not a form submission). Nothing here is stored on the server.
 */
export type CollectedLead = {
  /** Product line extracted from the post text. */
  query: string;
  /** First 160 characters of the post, for display. */
  excerpt: string;
  price: number | null;
  url: string;
};

export const MAX_LEADS = 40;
export const MAX_TEXT = 800;
/** Decoded JSON the page will accept. Worst case: every post is MAX_TEXT chars plus URL and JSON overhead. */
export const MAX_LEADS_JSON_CHARS = MAX_LEADS * (MAX_TEXT + 400);
/**
 * Wire size of the form body. Cyrillic is 2 UTF-8 bytes and percent-encodes to 6 ASCII
 * characters, so the encoded body can be ~6× the character count. Sized for that worst case.
 */
export const MAX_SHARE_BODY_BYTES = MAX_LEADS_JSON_CHARS * 6 + 20_000;

type RawLead = { text?: unknown; url?: unknown };

/** Validate what the bookmarklet sent. Bad rows are dropped, never trusted. */
export function parseCollectedLeads(raw: unknown): CollectedLead[] {
  let rows: unknown = raw;
  if (typeof raw === "string") {
    try { rows = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: CollectedLead[] = [];
  for (const row of rows as RawLead[]) {
    if (!row || typeof row !== "object") continue;
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "";
    const url = facebookListingUrl(row.url)?.toString() ?? "";
    if (text.length < 8 || !url || seen.has(url)) continue;
    seen.add(url);
    out.push({ query: extractProductQuery(text), excerpt: text.slice(0, 160), price: extractAskingPrice(text), url });
    if (out.length >= MAX_LEADS) break;
  }
  return out;
}

export type LeadSummary = {
  matched: CollectedLead[];
  others: CollectedLead[];
  median: number | null;
  low: number | null;
  high: number | null;
};

/** Leads that name the same product, with their own price band — never mixed into the store median. */
export function summarizeLeads(leads: CollectedLead[], query: string): LeadSummary {
  const matched = leads.filter((lead) => lead.price !== null && compareProductTitle(query, `${lead.query} ${lead.excerpt}`) !== null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  const others = leads.filter((lead) => !matched.includes(lead));
  const prices = matched.map((lead) => lead.price as number);
  const mid = Math.floor(prices.length / 2);
  const median = !prices.length ? null : prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
  return { matched, others, median, low: prices[0] ?? null, high: prices[prices.length - 1] ?? null };
}

/**
 * Source of the bookmarklet. `__APP__` is replaced with the app origin when rendered.
 * Constraints: self-contained (Facebook blocks external scripts), no fetch/XHR
 * (blocked by its connect policy), only a form POST to our /share endpoint.
 * Links keep only the public post identifiers, never tracking parameters.
 */
export const BOOKMARKLET_SOURCE = `(function(){
if(!/(^|\\.)facebook\\.com$/.test(location.hostname)){alert('Энэ хавчуургыг Facebook группийн хуудас дээр дарна уу.');return;}
var posts=[].slice.call(document.querySelectorAll('[role=article]'));
var out=[],seen={};
posts.forEach(function(post){
  var text=(post.innerText||'').replace(/\\s+/g,' ').trim();
  if(text.length<8)return;
  var link=post.querySelector('a[href*="/posts/"],a[href*="/permalink/"],a[href*="story_fbid="],a[href*="/photo"],a[href*="/marketplace/item/"]');
  if(!link)return;
  var u;
  try{u=new URL(link.href);}catch(e){return;}
  var keep=new URLSearchParams();
  ['story_fbid','id','fbid','set'].forEach(function(k){var v=u.searchParams.get(k);if(v)keep.set(k,v);});
  u.search=keep.toString();u.hash='';
  var href=u.toString();
  if(seen[href])return;
  seen[href]=1;
  out.push({text:text.slice(0,${MAX_TEXT}),url:href});
});
if(!out.length){alert('Энэ хуудсанд зар олдсонгүй. Facebook группийн хайлт, feed эсвэл Marketplace жагсаалт дээр ажиллуулна уу.');return;}
var form=document.createElement('form');
form.method='POST';form.action='__APP__/share';form.target='_blank';
var field=document.createElement('input');
field.type='hidden';field.name='leads';field.value=JSON.stringify(out.slice(0,${MAX_LEADS}));
var token=document.createElement('input');
token.type='hidden';token.name='token';token.value='__TOKEN__';
form.appendChild(field);form.appendChild(token);document.body.appendChild(form);form.submit();form.remove();
})();`;

export const COLLECTOR_TOKEN_KEY = "ub-price-scout-collector-token";

/**
 * The token is random, created once per browser and kept in localStorage. It travels
 * inside the bookmarklet and comes back with every submission, so the page can tell
 * "my own bookmarklet sent this" from "some other website posted a form at /share".
 * Other sites cannot read this browser's localStorage, so they cannot forge it.
 */
export function readOrCreateCollectorToken(storage: Pick<Storage, "getItem" | "setItem">): string {
  const existing = storage.getItem(COLLECTOR_TOKEN_KEY);
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  const fresh = crypto.randomUUID().replaceAll("-", "");
  storage.setItem(COLLECTOR_TOKEN_KEY, fresh);
  return fresh;
}

export function bookmarkletHref(origin: string, token: string) {
  const safeToken = /^[a-f0-9]{32}$/.test(token) ? token : "";
  return `javascript:${encodeURIComponent(BOOKMARKLET_SOURCE.replace(/__APP__/g, origin).replace(/__TOKEN__/g, safeToken).replace(/\n\s*/g, ""))}`;
}
