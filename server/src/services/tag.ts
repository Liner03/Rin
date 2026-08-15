import { and, desc, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { metas, relationships } from "../db/schema";
import {
    CONTENT_TYPE,
    generateSlug,
    getTagsForContents,
    isPubliclyListed,
    refreshMetaCounts,
} from "./content-helpers";

export function TagService(): Hono {
    const app = new Hono();

    // GET /tag
    app.get('/', async (c: AppContext) => {
        const db = c.get('db');

        const tag_list = await profileAsync(c, 'tag_list_db', () => db.query.metas.findMany({
            where: eq(metas.type, 'tag'),
            orderBy: [desc(metas.count)],
        }));

        const result = tag_list.map((tag: any) => ({
            id: tag.id,
            name: tag.name,
            count: tag.count,
            createdAt: tag.createdAt,
            updatedAt: tag.updatedAt,
        }));

        return c.json(result);
    });

    // GET /tag/:name
    app.get('/:name', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const nameDecoded = decodeURI(c.req.param('name'));

        const tag = await profileAsync(c, 'tag_detail_db', () => db.query.metas.findFirst({
            where: and(eq(metas.type, 'tag'), or(eq(metas.name, nameDecoded), eq(metas.slug, nameDecoded))),
        }));

        if (!tag) {
            return c.text('Not found', 404);
        }

        const relationships_rows = await profileAsync(c, 'tag_detail_rels', () => db.query.relationships.findMany({
            where: eq(relationships.metaId, tag.id),
            columns: {},
            with: {
                content: {
                    columns: {
                        id: true, title: true, summary: true, slug: true,
                        createdAt: true, updatedAt: true, status: true, type: true,
                    },
                    with: {
                        user: { columns: { id: true, username: true, avatar: true } },
                    },
                },
            },
        }));

        const postRows = relationships_rows
            .map((row) => row.content)
            .filter((feed) => feed && feed.type === CONTENT_TYPE.POST && isPubliclyListed(feed, admin));

        const tagsMap = await getTagsForContents(db, postRows.map((feed) => feed.id));

        const tagFeeds = postRows.map((feed: any) => ({
            ...feed,
            hashtags: tagsMap.get(feed.id) || [],
        }));

        return c.json({ ...tag, feeds: tagFeeds });
    });

    return app;
}

export async function bindTagsToContent(db: DB, contentId: number, tags: string[]) {
    const metaIds = new Set<number>();

    // 只清空该内容的标签关系，保留分类关系
    const existingTags = await db.select({ id: metas.id }).from(metas)
        .innerJoin(relationships, eq(relationships.metaId, metas.id))
        .where(and(eq(relationships.contentId, contentId), eq(metas.type, 'tag')));
    for (const meta of existingTags) {
        metaIds.add(meta.id);
    }
    if (existingTags.length > 0) {
        await db.delete(relationships).where(
            and(
                eq(relationships.contentId, contentId),
                inArray(relationships.metaId, existingTags.map((meta) => meta.id)),
            ),
        );
    }

    for (const tag of tags) {
        const normalized = tag.trim();
        if (!normalized) continue;

        let meta: { id: number } | undefined = await db.query.metas.findFirst({
            where: and(eq(metas.type, 'tag'), eq(metas.name, normalized)),
        });

        if (!meta) {
            const result = await db.insert(metas).values({
                type: 'tag',
                name: normalized,
                slug: generateSlug(normalized),
            }).returning({ insertedId: metas.id });
            meta = { id: result[0].insertedId };
        }

        metaIds.add(meta.id);
        await db.insert(relationships).values({ contentId, metaId: meta.id });
    }

    await refreshMetaCounts(db, Array.from(metaIds));
}
