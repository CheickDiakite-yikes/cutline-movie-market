import { sql } from "drizzle-orm";
import { check, index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userIdeas = sqliteTable(
  "user_ideas",
  {
    userId: text("user_id").notNull(),
    eventTicker: text("event_ticker").notNull(),
    ideaId: text("idea_id").notNull(),
    disposition: text("disposition", { enum: ["research", "later", "passed"] }).notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventTicker] }),
    check(
      "user_ideas_disposition_check",
      sql`${table.disposition} IN ('research', 'later', 'passed')`,
    ),
    index("user_ideas_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);
