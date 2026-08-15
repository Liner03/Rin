import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { contents, metas, relationships } from "../db/schema";
import {
    CONTENT_TYPE,
    generateSlug,
    getCategoriesForContents,
    getTagsForContents,
    getUniqueSlug,
    isPubliclyListed,
    refreshMetaCounts,
} from "./content-helpers";

export function CategoryService(): Hono {
    const app = new Hono();

    // GET /category - 分类列表（树形）
    app.get('/', async (c: AppContext) => {
        const db = c.get('db');

        const category_list = await profileAsync(c, 'category_list_db', () => db.query.metas.findMany({
            where: eq(metas.type, 'category'),
            orderBy: [asc(metas.order), asc(metas.id)],
        }));

        const result = category_list.map((category: any) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            count: category.count,
            order: category.order,
            parent: category.parent,
            listed: category.listed,
            createdAt: category.createdAt,
            updatedAt: category.updatedAt,
        }));

        return c.json(result);
    });

    // GET /category/:slug - 分类详情（含文章）
    app.get('/:slug', async (c: AppContext) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const slugDecoded = decodeURI(c.req.param('slug'));

        // 缓存按角色区分（admin 可见密码/隐藏分类文章），CRUD 时 deletePrefix('category_') 失效
        const cacheKey = `category_detail_v2_${admin ? "admin_" : ""}${slugDecoded}`;

        const build = async () => {
            const category = await profileAsync(c, 'category_detail_db', () => db.query.metas.findFirst({
                where: and(eq(metas.type, 'category'), eq(metas.slug, slugDecoded)),
            }));

            if (!category) {
                return null;
            }

            // 包含子分类
            const childIds = await collectChildIds(db, category.id);
            const ids = [category.id, ...childIds];

            const rows = await profileAsync(c, 'category_detail_rels', () => db.query.relationships.findMany({
                where: inArray(relationships.metaId, ids),
                columns: {},
                with: {
                    content: {
                        columns: {
                            id: true, title: true, summary: true, slug: true, status: true, type: true,
                            createdAt: true, updatedAt: true,
                        },
                        with: {
                            user: { columns: { id: true, username: true, avatar: true } },
                        },
                    },
                },
            }));

            const postRows = rows
                .map((row) => row.content)
                .filter((feed) => feed && feed.type === CONTENT_TYPE.POST && isPubliclyListed(feed, admin));

            const postIds = postRows.map((feed) => feed.id);
            const [tagsMap, categoriesMap] = await Promise.all([
                getTagsForContents(db, postIds),
                getCategoriesForContents(db, postIds),
            ]);

            const feeds = postRows
                .map((feed: any) => ({
                    ...feed,
                    hashtags: tagsMap.get(feed.id) || [],
                    categories: categoriesMap.get(feed.id) || [],
                }))
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return { ...category, feeds };
        };

        const result = await profileAsync(c, 'category_detail_cache', () => cache.getOrSet(cacheKey, build));

        if (!result) {
            return c.text('Not found', 404);
        }

        return c.json(result);
    });

    // POST /category - 创建分类
    app.post('/', async (c: AppContext) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const body = await profileAsync(c, 'category_create_parse', () => c.req.json());
        const { name, slug, description, parent, order, listed } = body;

        if (!admin) {
            return c.text('Permission denied', 403);
        }
        if (!name) {
            return c.text('Name is required', 400);
        }

        const finalSlug = slug || await getUniqueSlug(db, generateSlug(name));
        const result = await profileAsync(c, 'category_create_db', () => db.insert(metas).values({
            type: 'category',
            name,
            slug: finalSlug,
            description: description || "",
            parent: parent || 0,
            order: order || 0,
            listed: listed === undefined ? 1 : (listed ? 1 : 0),
        }).returning({ insertedId: metas.id }));

        await profileAsync(c, 'category_create_cache_invalidate', () => cache.deletePrefix('category_'));

        if (result.length === 0) {
            return c.text('Failed to insert', 500);
        }
        return c.json(result[0]);
    });

    // PUT /category/:id - 更新分类
    app.put('/:id', async (c: AppContext) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const id = parseInt(c.req.param('id'));
        const body = await profileAsync(c, 'category_update_parse', () => c.req.json());
        const { name, slug, description, parent, order, listed } = body;

        if (!admin) {
            return c.text('Permission denied', 403);
        }

        const category = await profileAsync(c, 'category_update_lookup', () => db.query.metas.findFirst({
            where: and(eq(metas.id, id), eq(metas.type, 'category')),
        }));
        if (!category) {
            return c.text('Not found', 404);
        }

        await profileAsync(c, 'category_update_db', () => db.update(metas).set({
            name,
            slug,
            description,
            parent,
            order,
            listed: listed === undefined ? undefined : (listed ? 1 : 0),
        }).where(eq(metas.id, id)));

        await profileAsync(c, 'category_update_cache_invalidate', () => cache.deletePrefix('category_'));
        return c.text('Updated');
    });

    // DELETE /category/:id - 删除分类
    app.delete('/:id', async (c: AppContext) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const id = parseInt(c.req.param('id'));

        if (!admin) {
            return c.text('Permission denied', 403);
        }

        const category = await profileAsync(c, 'category_delete_lookup', () => db.query.metas.findFirst({
            where: and(eq(metas.id, id), eq(metas.type, 'category')),
        }));
        if (!category) {
            return c.text('Not found', 404);
        }

        await profileAsync(c, 'category_delete_rels', () => db.delete(relationships).where(eq(relationships.metaId, id)));
        await profileAsync(c, 'category_delete_db', () => db.delete(metas).where(eq(metas.id, id)));
        await profileAsync(c, 'category_delete_cache_invalidate', () => cache.deletePrefix('category_'));

        return c.text('Deleted');
    });

    return app;
}

async function collectChildIds(db: DB, parentId: number): Promise<number[]> {
    const children = await db.select({ id: metas.id }).from(metas)
        .where(and(eq(metas.type, 'category'), eq(metas.parent, parentId)));
    const ids = children.map((child) => child.id);
    for (const id of ids) {
        ids.push(...await collectChildIds(db, id));
    }
    return ids;
}

export async function bindCategoriesToContent(db: DB, contentId: number, categoryIds: number[]) {
    const metaIds = new Set<number>();

    // 只清空该内容的分类关系，保留标签关系
    const existingCats = await db.select({ id: metas.id }).from(metas)
        .innerJoin(relationships, eq(relationships.metaId, metas.id))
        .where(and(eq(relationships.contentId, contentId), eq(metas.type, 'category')));
    for (const meta of existingCats) {
        metaIds.add(meta.id);
    }
    if (existingCats.length > 0) {
        await db.delete(relationships).where(
            and(
                eq(relationships.contentId, contentId),
                inArray(relationships.metaId, existingCats.map((meta) => meta.id)),
            ),
        );
    }

    // 批量预取分类，避免逐条 findFirst
    const validCategories = new Map<number, boolean>();
    if (categoryIds.length > 0) {
        const existing = await db.select({ id: metas.id }).from(metas)
            .where(and(eq(metas.type, 'category'), inArray(metas.id, categoryIds)));
        for (const meta of existing) {
            validCategories.set(meta.id, true);
        }
    }

    for (const id of categoryIds) {
        if (!validCategories.has(id)) continue;
        metaIds.add(id);
        await db.insert(relationships).values({ contentId, metaId: id });
    }

    await refreshMetaCounts(db, Array.from(metaIds));
}
