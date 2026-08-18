import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scans = sqliteTable(
  "scans",
  {
    id: text("id").primaryKey(),
    query: text("query").notNull(),
    targetPrice: integer("target_price"),
    report: text("report").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_scans_created_at").on(table.createdAt)],
);

export const scanLimits = sqliteTable("scan_limits", {
  fingerprint: text("fingerprint").primaryKey(),
  bucket: integer("bucket").notNull(),
  count: integer("count").notNull(),
});
