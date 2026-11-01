import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const inquiryDeliveriesTable = pgTable(
  "inquiry_deliveries",
  {
    id: uuid("id").primaryKey(),
    status: varchar("status", { length: 12 }).notNull(),
    name: text("name"),
    email: text("email"),
    project: text("project"),
    stage: text("stage"),
    message: text("message"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "inquiry_deliveries_status_check",
      sql`${table.status} IN ('pending', 'sending', 'delivered', 'failed')`,
    ),
    check("inquiry_deliveries_attempts_check", sql`${table.attempts} >= 0 AND ${table.attempts} <= 5`),
    index("inquiry_deliveries_retry_idx").on(table.status, table.nextAttemptAt),
    index("inquiry_deliveries_lease_idx").on(table.status, table.leaseUntil),
    index("inquiry_deliveries_terminal_age_idx").on(table.status, table.createdAt),
  ],
);

export const insertInquiryDeliverySchema = createInsertSchema(inquiryDeliveriesTable).omit({
  id: true,
  status: true,
  attempts: true,
  nextAttemptAt: true,
  leaseUntil: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInquiryDelivery = z.infer<typeof insertInquiryDeliverySchema>;
export type InquiryDelivery = typeof inquiryDeliveriesTable.$inferSelect;
