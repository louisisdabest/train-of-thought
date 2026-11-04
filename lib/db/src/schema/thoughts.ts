import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriesTable = pgTable(
  "thought_categories",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("thought_categories_owner_name_idx").on(
      table.ownerId,
      sql`lower(${table.name})`,
    ),
    index("thought_categories_owner_idx").on(table.ownerId),
  ],
);

export const thoughtsTable = pgTable(
  "thoughts",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    content: text("content").notNull(),
    categoryId: integer("category_id").references(() => categoriesTable.id, {
      onDelete: "set null",
    }),
    reviewAt: timestamp("review_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("thoughts_owner_created_idx").on(table.ownerId, table.createdAt),
    index("thoughts_owner_review_idx").on(table.ownerId, table.reviewAt),
    index("thoughts_owner_category_idx").on(table.ownerId, table.categoryId),
  ],
);

export const thoughtLinksTable = pgTable(
  "thought_links",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    sourceThoughtId: integer("source_thought_id")
      .notNull()
      .references(() => thoughtsTable.id, { onDelete: "cascade" }),
    targetThoughtId: integer("target_thought_id")
      .notNull()
      .references(() => thoughtsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("thought_links_owner_pair_idx").on(
      table.ownerId,
      table.sourceThoughtId,
      table.targetThoughtId,
    ),
    index("thought_links_owner_source_idx").on(
      table.ownerId,
      table.sourceThoughtId,
    ),
    check(
      "thought_links_no_self_link",
      sql`${table.sourceThoughtId} <> ${table.targetThoughtId}`,
    ),
  ],
);

export const categoryRelations = relations(categoriesTable, ({ many }) => ({
  thoughts: many(thoughtsTable),
}));

export const thoughtRelations = relations(thoughtsTable, ({ one }) => ({
  category: one(categoriesTable, {
    fields: [thoughtsTable.categoryId],
    references: [categoriesTable.id],
  }),
}));

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({
  id: true,
  createdAt: true,
});
export const insertThoughtSchema = createInsertSchema(thoughtsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
export type InsertThought = z.infer<typeof insertThoughtSchema>;
export type Thought = typeof thoughtsTable.$inferSelect;
