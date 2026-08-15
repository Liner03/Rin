import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const created_at = integer("created_at", { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull();
const updated_at = integer("updated_at", { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull();

export const contents = sqliteTable("contents", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").default("post").notNull(),
    title: text("title").default("").notNull(),
    slug: text("slug"),
    text: text("text").default("").notNull(),
    summary: text("summary").default("").notNull(),
    ai_summary: text("ai_summary").default("").notNull(),
    ai_summary_status: text("ai_summary_status").default("idle").notNull(),
    ai_summary_error: text("ai_summary_error").default("").notNull(),
    status: text("status").default("publish").notNull(),
    password: text("password").default(""),
    top: integer("top").default(0).notNull(),
    order: integer("order").default(0).notNull(),
    template: text("template").default(""),
    allowComment: integer("allow_comment").default(1).notNull(),
    allowPing: integer("allow_ping").default(1).notNull(),
    allowFeed: integer("allow_feed").default(1).notNull(),
    parent: integer("parent").default(0).notNull(),
    uid: integer("uid").references(() => users.id).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
}, (table) => ({
    slugUnique: unique().on(table.slug),
}));

export const metas = sqliteTable("metas", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").default("tag").notNull(),
    name: text("name").notNull(),
    slug: text("slug"),
    description: text("description").default("").notNull(),
    count: integer("count").default(0).notNull(),
    order: integer("order").default(0).notNull(),
    parent: integer("parent").default(0).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
}, (table) => ({
    slugTypeUnique: unique().on(table.slug, table.type),
}));

export const relationships = sqliteTable("relationships", {
    contentId: integer("content_id").references(() => contents.id, { onDelete: 'cascade' }).notNull(),
    metaId: integer("meta_id").references(() => metas.id, { onDelete: 'cascade' }).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
}, (table) => ({
    contentMetaUnique: unique().on(table.contentId, table.metaId),
}));

export const fields = sqliteTable("fields", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contentId: integer("content_id").references(() => contents.id, { onDelete: 'cascade' }).notNull(),
    name: text("name").notNull(),
    type: text("type").default("str").notNull(),
    strValue: text("str_value").default("").notNull(),
    intValue: integer("int_value").default(0).notNull(),
    floatValue: real("float_value").default(0).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
}, (table) => ({
    contentNameUnique: unique().on(table.contentId, table.name),
}));

export const moments = sqliteTable("moments", {
    id: integer("id").primaryKey(),
    content: text("content").notNull(),
    uid: integer("uid").references(() => users.id).notNull(),
    createdAt: created_at,
    updatedAt: updated_at
});

export const visits = sqliteTable("visits", {
    id: integer("id").primaryKey(),
    contentId: integer("content_id").references(() => contents.id, { onDelete: 'cascade' }).notNull(),
    ip: text("ip").notNull(),
    createdAt: created_at,
});

export const visitStats = sqliteTable("visit_stats", {
    contentId: integer("content_id").references(() => contents.id, { onDelete: 'cascade' }).notNull().primaryKey(),
    pv: integer("pv").default(0).notNull(),
    hllData: text("hll_data").default("").notNull(),
    updatedAt: updated_at,
});

export const info = sqliteTable("info", {
    key: text("key").notNull().unique(),
    value: text("value").notNull(),
});

export const friends = sqliteTable("friends", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    desc: text("desc"),
    avatar: text("avatar").notNull(),
    url: text("url").notNull(),
    uid: integer("uid").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    accepted: integer("accepted").default(0).notNull(),
    health: text("health").default("").notNull(),
    sort_order: integer("sort_order").default(0).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const users = sqliteTable("users", {
    id: integer("id").primaryKey(),
    username: text("username").notNull(),
    openid: text("openid").notNull(),
    avatar: text("avatar"),
    password: text("password"),
    permission: integer("permission").default(0),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const comments = sqliteTable("comments", {
    id: integer("id").primaryKey(),
    contentId: integer("content_id").references(() => contents.id, { onDelete: 'cascade' }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
    content: text("content").notNull(),
    guestName: text("guest_name").default(""),
    guestEmail: text("guest_email").default(""),
    guestWebsite: text("guest_website").default(""),
    approved: integer("approved").default(1).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const cache = sqliteTable("cache", {
    id: integer("id").primaryKey(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    type: text("type").default("cache").notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
}, (table) => ({
    keyTypeUnique: unique().on(table.key, table.type),
}));

export const contentsRelations = relations(contents, ({ many, one }) => ({
    metas: many(relationships),
    user: one(users, {
        fields: [contents.uid],
        references: [users.id],
    }),
    comments: many(comments),
    visits: many(visits),
    visitStats: many(visitStats),
    fields: many(fields),
}));

export const metasRelations = relations(metas, ({ many }) => ({
    contents: many(relationships),
}));

export const relationshipsRelations = relations(relationships, ({ one }) => ({
    content: one(contents, {
        fields: [relationships.contentId],
        references: [contents.id],
    }),
    meta: one(metas, {
        fields: [relationships.metaId],
        references: [metas.id],
    }),
}));

export const fieldsRelations = relations(fields, ({ one }) => ({
    content: one(contents, {
        fields: [fields.contentId],
        references: [contents.id],
    }),
}));

export const momentsRelations = relations(moments, ({ one }) => ({
    user: one(users, {
        fields: [moments.uid],
        references: [users.id],
    })
}));

export const commentsRelations = relations(comments, ({ one }) => ({
    content: one(contents, {
        fields: [comments.contentId],
        references: [contents.id],
    }),
    user: one(users, {
        fields: [comments.userId],
        references: [users.id],
    }),
}));
