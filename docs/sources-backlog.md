# Sources backlog

Found on 2026-09-28 while hunting a 1 TB NVMe SSD by hand and comparing with a scout report
(`?report=7bbacc3730aa`, query `1TB NVMe M.2 SSD`).

## Stores not covered yet

Ordered by value. "Platform" was read from each home page's HTML.

| Store | Platform | Work | Why it matters |
|---|---|---|---|
| hitech.mn | Next.js (custom) | New adapter | Had the only in-stock bare 1 TB SSD (Samsung 990 Pro, 380,000₮ + VAT) that the scout never saw |
| cases.mn | Zochil | Likely one `zochilSource` line — untested | Satechi, Apple accessories (Mac mini hub 360,000₮) |
| shoppy.mn | Cody ("Powered by CODY") | Likely one `codySource` line — find the Elasticsearch index name first | Large marketplace |
| molly.mn | Shopify | New small adapter (`/search/suggest.json`) | Samsung SSDs, electronics |
| cyberstore.mn | React SPA | New adapter — find its JSON API first | Kingston, Samsung storage |
| computershop.mn | Unknown | Check first | Apple accessories, SSDs |

Not worth adding:
- **computers.mn** — another price-comparison site, not a store. Its 1 TB NVMe page was 32 days
  stale with only sold-out offers.
- **stora.mn / ubuy.mn** — US/China import services, not UB stock. Only as a separate
  "order from abroad" section, if ever.

## Known report problems

1. **Best Computers stock is always "unknown"** — `lib/sources/bestcomputers.ts:14` hard-codes
   it. The product page says `0 ширхэг бэлэн байна` when sold out; both of its "cheapest" SSDs in
   the report were sold out.
2. **A whole laptop counted as an exact match** for `1TB NVMe M.2 SSD` (ASUS ROG Strix SCAR 17,
   10,699,900₮). It sets the "highest" price and pulls the average up. Items whose title is a
   different product category (laptop, desktop) should not be "exact".
3. **Store search misses titles with an extra word.** Some WooCommerce stores match the query
   words next to each other. corepc.mn: `990 pro` finds "Samsung SSD 990 PRO 1TB" (800,000₮, in
   stock), but `Samsung 990 Pro` and `Samsung 990 Pro 1TB` — the two variants `scanVariants`
   tries (`lib/sources/index.ts:89`) — do not. A third variant without the brand (model + number
   only) would catch it. Affects x86 and uTech too.
4. **VAT not shown.** hitech.mn and turbotech.mn print prices "НӨАТ ороогүй" (without VAT);
   citymall.mn shows both. The report compares them as if equal.
