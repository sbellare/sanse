import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const inquiryRateLimitsTable = pgTable(
  "inquiry_rate_limits",
  {
    address: text("address").primaryKey(),
    submissions: timestamp("submissions", { withTimezone: true, mode: "date" })
      .array()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    lastRequestAllowed: boolean("last_request_allowed").notNull().default(true),
  },
  (table) => [index("inquiry_rate_limits_expiry_idx").on(table.expiresAt)],
);
