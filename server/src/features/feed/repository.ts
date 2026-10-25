import { and, count, desc, eq, or, sql } from "drizzle-orm";
import type { DB } from "../../core/hono-types";
import { contents } from "../../db/schema";
import { CONTENT_TYPE, publishedWhere } from "../../services/content-helpers";

type FeedInsert = typeof contents.$inferInsert;
type FeedUpdate = Partial<FeedInsert>;
const postById = (id: number) => and(eq(contents.id, id), eq(contents.type, CONTENT_TYPE.POST));

export function findFeedById(db: DB, id: number) {
    return db.query.contents.findFirst({ where: postById(id) });
}

export function findDuplicateFeed(db: DB, title: string, content: string) {
    return db.query.contents.findFirst({
        where: and(eq(contents.type, CONTENT_TYPE.POST), or(eq(contents.title, title), eq(contents.text, content))),
    });
}

export async function insertFeed(db: DB, values: FeedInsert) {
    const [inserted] = await db.insert(contents).values(values).returning({ insertedId: contents.id });
    return inserted ?? null;
}

export function updateFeedById(db: DB, id: number, values: FeedUpdate) {
    return db.update(contents).set(values).where(postById(id));
}

export function deleteFeedById(db: DB, id: number) {
    return db.delete(contents).where(postById(id));
}

export type SearchFeedPageOptions = {
    keyword: string;
    admin: boolean;
    pageIndex: number;
    limit: number;
};

export async function searchFeedPage(db: DB, options: SearchFeedPageOptions) {
    const keyword = options.keyword.trim();
    if (!keyword) return { size: 0, rows: [], hasNext: false };

    // SQLite requires an explicit ESCAPE clause for literal %, _ and backslashes.
    const pattern = `%${keyword.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const searchWhere = or(
        sql`${contents.title} LIKE ${pattern} ESCAPE '\\'`,
        sql`${contents.text} LIKE ${pattern} ESCAPE '\\'`,
        sql`${contents.summary} LIKE ${pattern} ESCAPE '\\'`,
        sql`${contents.slug} LIKE ${pattern} ESCAPE '\\'`,
    );
    const where = and(
        eq(contents.type, CONTENT_TYPE.POST),
        searchWhere,
        options.admin ? undefined : and(publishedWhere(), sql`${contents.password} = ''`),
    );
    const [sizeRows, rows] = await Promise.all([
        db.select({ count: count() }).from(contents).where(where),
        db.query.contents.findMany({
            where,
            with: { user: { columns: { id: true, username: true, avatar: true } } },
            orderBy: [desc(contents.createdAt), desc(contents.updatedAt), desc(contents.id)],
            offset: options.pageIndex * options.limit,
            limit: options.limit + 1,
        }),
    ]);
    const hasNext = rows.length > options.limit;
    if (hasNext) rows.pop();
    return { size: sizeRows[0]?.count ?? 0, rows, hasNext };
}
