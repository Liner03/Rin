import { and, desc, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { contents, metas, relationships } from "../db/schema";
import { generateSlug, refreshMetaCounts } from "./content-helpers";

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
                        id: true, title: true, summary: true, text: true, slug: true,
                        createdAt: true, updatedAt: true, status: true, password: true,
                    },
                    with: {
                        user: { columns: { id: true, username: true, avatar: true } },
                    },
                },
            },
        }));

        const tagFeeds = [];
        for (const row of relationships_rows) {
            const feed = row.content;
            if (!feed || feed.status !== 'publish') continue;
            if (!admin) {
                if (feed.password || feed.createdAt.getTime() > Date.now()) continue;
            }
            const tags = await profileAsync(c, 'tag_detail_tags', () => getTagsForContentLike(db, feed.id));
            tagFeeds.push({ ...feed, hashtags: tags });
        }

        return c.json({ ...tag, feeds: tagFeeds });
    });

    return app;
}

async function getTagsForContentLike(db: DB, contentId: number) {
    const rows = await db.query.relationships.findMany({
        where: eq(relationships.contentId, contentId),
        columns: {},
        with: {
            meta: {
                columns: { id: true, name: true },
            },
        },
    });
    return rows.map(({ meta }) => meta).filter((meta: any) => meta.type === "tag");
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

function inArrayForTags(tags: string[]) {
    return inArray(metas.name, tags.map((tag) => tag.trim()).filter(Boolean));
}
