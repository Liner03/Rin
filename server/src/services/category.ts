import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { metas, relationships } from "../db/schema";
import {
    CONTENT_TYPE,
    generateSlug,
    getCategoriesForContents,
    getTagsForContents,
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
        const cacheKey = `category_detail_v4_${admin ? "admin_" : ""}${slugDecoded}`;

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
                            id: true, title: true, summary: true, cover: true, slug: true, status: true, type: true,
                            createdAt: true, updatedAt: true,
                        },
                        with: {
                            user: { columns: { id: true, username: true, avatar: true } },
                        },
                    },
                },
            }));

            const posts = rows
                .map((row) => row.content)
                .filter((feed) => feed && feed.type === CONTENT_TYPE.POST && isPubliclyListed(feed, admin));
            const postRows = Array.from(new Map(posts.map((feed) => [feed.id, feed])).values());

            const postIds = postRows.map((feed) => feed.id);
            const [tagsMap, categoriesMap] = await Promise.all([
                getTagsForContents(db, postIds),
                getCategoriesForContents(db, postIds),
            ]);

            const feeds = postRows
                .map((feed: any) => ({
                    ...feed,
                    avatar: feed.cover || null,
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
        if (typeof name !== 'string' || !name.trim()) {
            return c.text('Name is required', 400);
        }
        if (slug !== undefined && typeof slug !== 'string') {
            return c.text('Slug must be a string', 400);
        }
        const parentId = parent === undefined ? 0 : parent;
        if (!await isValidCategoryParent(db, parentId)) {
            return c.text('Parent category must exist and have a valid hierarchy', 400);
        }

        const finalSlug = slug?.trim() || await getUniqueCategorySlug(db, generateSlug(name));
        const result = await profileAsync(c, 'category_create_db', () => db.insert(metas).values({
            type: 'category',
            name,
            slug: finalSlug,
            description: description || "",
            parent: parentId,
            order: order || 0,
            listed: listed === undefined ? 1 : (listed ? 1 : 0),
        }).onConflictDoNothing({ target: [metas.slug, metas.type] }).returning({ insertedId: metas.id }));

        if (result.length === 0) {
            return c.text('Category slug is already in use', 409);
        }
        await profileAsync(c, 'category_create_cache_invalidate', () => cache.deletePrefix('category_'));
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
        if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
            return c.text('Name is required', 400);
        }
        if (slug !== undefined && typeof slug !== 'string') {
            return c.text('Slug must be a string', 400);
        }
        if (parent !== undefined && !await isValidCategoryParent(db, parent, id)) {
            return c.text('Parent category must exist and cannot be this category or one of its descendants', 400);
        }

        const finalSlug = slug === undefined ? category.slug
            : slug.trim() || await getUniqueCategorySlug(db, generateSlug(name ?? category.name), id);
        if (finalSlug && await categorySlugExists(db, finalSlug, id)) {
            return c.text('Category slug is already in use', 409);
        }

        try {
            await profileAsync(c, 'category_update_db', () => db.update(metas).set({
                name,
                slug: finalSlug,
                description,
                parent,
                order,
                listed: listed === undefined ? undefined : (listed ? 1 : 0),
                updatedAt: new Date(),
            }).where(eq(metas.id, id)));
        } catch (error) {
            // The unique constraint also protects concurrent edits after the availability check.
            if (isCategorySlugConflict(error)) return c.text('Category slug is already in use', 409);
            throw error;
        }

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

        const child = await db.query.metas.findFirst({
            where: and(eq(metas.type, 'category'), eq(metas.parent, id)),
            columns: { id: true },
        });
        if (child) {
            return c.text('Move or delete child categories before deleting this category', 409);
        }

        await profileAsync(c, 'category_delete_rels', () => db.delete(relationships).where(eq(relationships.metaId, id)));
        await profileAsync(c, 'category_delete_db', () => db.delete(metas).where(eq(metas.id, id)));
        await profileAsync(c, 'category_delete_cache_invalidate', () => cache.deletePrefix('category_'));

        return c.text('Deleted');
    });

    return app;
}

async function categorySlugExists(db: DB, slug: string, excludeId?: number) {
    const match = await db.query.metas.findFirst({
        where: and(eq(metas.type, 'category'), eq(metas.slug, slug), excludeId === undefined ? undefined : ne(metas.id, excludeId)),
        columns: { id: true },
    });
    return Boolean(match);
}

async function getUniqueCategorySlug(db: DB, base: string, excludeId?: number): Promise<string> {
    let candidate = base;
    for (let suffix = 1; await categorySlugExists(db, candidate, excludeId); suffix++) {
        candidate = `${base}-${suffix}`;
    }
    return candidate;
}

function isCategorySlugConflict(error: unknown): boolean {
    while (error instanceof Error) {
        if (error.message.includes('UNIQUE constraint failed: metas.slug, metas.type')) return true;
        error = error.cause;
    }
    return false;
}

async function getCategoryParents(db: DB) {
    const categories = await db.select({ id: metas.id, parent: metas.parent }).from(metas)
        .where(eq(metas.type, 'category'));
    return new Map(categories.map((category) => [category.id, category.parent]));
}

async function isValidCategoryParent(db: DB, parent: unknown, categoryId?: number): Promise<boolean> {
    if (typeof parent !== 'number' || !Number.isSafeInteger(parent) || parent < 0) return false;
    if (parent === 0) return true;

    const parents = await getCategoryParents(db);
    const visited = new Set<number>();
    let current = parent;
    while (current !== 0) {
        if (current === categoryId || visited.has(current)) return false;
        visited.add(current);
        const next = parents.get(current);
        if (next === undefined) return false;
        current = next;
    }
    return true;
}

async function collectChildIds(db: DB, parentId: number): Promise<number[]> {
    const children = new Map<number, number[]>();
    for (const [id, parent] of await getCategoryParents(db)) {
        const siblings = children.get(parent) || [];
        siblings.push(id);
        children.set(parent, siblings);
    }
    // A visited set also bounds reads of legacy hierarchies that already contain cycles.
    const visited = new Set([parentId]);
    const pending = [parentId];
    const ids: number[] = [];
    for (let index = 0; index < pending.length; index++) {
        for (const id of children.get(pending[index]) || []) {
            if (visited.has(id)) continue;
            visited.add(id);
            ids.push(id);
            pending.push(id);
        }
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
