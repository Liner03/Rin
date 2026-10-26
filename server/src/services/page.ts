import { and, asc, eq, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { contents } from "../db/schema";
import {
    CONTENT_STATUS,
    CONTENT_TYPE,
    canViewContent,
    createContentUnlockHandler,
    generateSlug,
    getContentFields,
    getFieldsForContents,
    getUniqueSlug,
    hashContentPassword,
    isContentUnlocked,
    parseCookies,
    serializeContentDetail,
    setContentFields,
} from "./content-helpers";

export function PageService(): Hono {
    const app = new Hono();

    // GET /page - 页面列表
    app.get('/', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');

        const where = admin
            ? eq(contents.type, CONTENT_TYPE.PAGE)
            : and(
                eq(contents.type, CONTENT_TYPE.PAGE),
                eq(contents.status, CONTENT_STATUS.PUBLISH),
                lte(contents.createdAt, new Date()),
                eq(contents.password, ""),
            );

        const page_list = await profileAsync(c, 'page_list_db', () => db.query.contents.findMany({
            where,
            columns: admin ? undefined : { password: false, uid: false },
            with: {
                user: { columns: { id: true, username: true, avatar: true } },
            },
            orderBy: [asc(contents.order), asc(contents.id)],
        }));

        const fieldsByPage = await profileAsync(c, 'page_list_fields', () => getFieldsForContents(db, page_list.map((page) => page.id)));
        const rows = page_list.map((page) => serializeContentDetail(page, { fields: fieldsByPage.get(page.id) || [] }));
        return c.json(rows);
    });

    // GET /page/:slug - 页面详情（支持数字 id 或 slug）
    app.get('/:slug', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const slugDecoded = decodeURI(c.req.param('slug'));

        // 纯数字视为 id（front_page 绑定用）
        const idMatch = /^\d+$/.test(slugDecoded) ? parseInt(slugDecoded, 10) : null;
        const where = idMatch !== null
            ? and(eq(contents.type, CONTENT_TYPE.PAGE), eq(contents.id, idMatch))
            : and(eq(contents.type, CONTENT_TYPE.PAGE), eq(contents.slug, slugDecoded));

        const page = await profileAsync(c, 'page_detail_db', () => db.query.contents.findFirst({
            where,
            with: {
                user: { columns: { id: true, username: true, avatar: true } },
            },
        }));

        if (!page) {
            return c.text('Not found', 404);
        }

        if (!canViewContent(page, { admin, uid })) {
            return c.text('Permission denied', 403);
        }

        const cookies = parseCookies(c.req.header('cookie'));
        const unlocked = isContentUnlocked(page, cookies);
        const fieldsList = await getContentFields(db, page.id);
        const serialize = () => serializeContentDetail(page, { fields: fieldsList });

        if (page.password && !unlocked) {
            if (admin) {
                return c.json(serialize());
            }
            return c.json(serializeContentDetail(page, { content: "", locked: true, fields: [] }));
        }

        return c.json(serialize());
    });

    // POST /page - 创建页面
    app.post('/', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const body = await profileAsync(c, 'page_create_parse', () => c.req.json());
        const { title, content, slug, status, password, parent, order, template, fields } = body;

        if (!admin) {
            return c.text('Permission denied', 403);
        }
        if (!title) {
            return c.text('Title is required', 400);
        }
        if (!content) {
            return c.text('Content is required', 400);
        }
        if (!uid) {
            return c.text('User ID is required', 400);
        }

        const parentId = parent === undefined ? 0 : parent;
        if (!await isValidPageParent(db, parentId)) {
            return c.text('Parent page must exist and have a valid hierarchy', 400);
        }

        const finalSlug = slug || await getUniqueSlug(db, generateSlug(title));
        const passwordHash = password ? await hashContentPassword(password) : "";

        const result = await profileAsync(c, 'page_create_db', () => db.insert(contents).values({
            type: CONTENT_TYPE.PAGE,
            title,
            text: content,
            uid,
            slug: finalSlug,
            status: status || CONTENT_STATUS.PUBLISH,
            password: passwordHash,
            parent: parentId,
            order: order || 0,
            template: template || "",
        }).returning({ insertedId: contents.id }));

        if (result.length === 0) {
            return c.text('Failed to insert', 500);
        }
        await profileAsync(c, 'page_create_fields', () => setContentFields(db, result[0].insertedId, fields));
        return c.json(result[0]);
    });

    // POST /page/:id - 更新页面
    app.post('/:id', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id_num = parseInt(c.req.param('id'));
        const body = await profileAsync(c, 'page_update_parse', () => c.req.json());
        const { title, content, slug, status, password, parent, order, template, fields } = body;

        const page = await profileAsync(c, 'page_update_lookup', () => db.query.contents.findFirst({
            where: and(eq(contents.id, id_num), eq(contents.type, CONTENT_TYPE.PAGE)),
        }));

        if (!page) {
            return c.text('Not found', 404);
        }

        if (page.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        if (parent !== undefined && !await isValidPageParent(db, parent, id_num)) {
            return c.text('Parent page must exist and cannot be this page or one of its descendants', 400);
        }

        const finalSlug = slug || page.slug || await getUniqueSlug(db, generateSlug(title || page.title));
        const passwordHash = password !== undefined
            ? (password ? await hashContentPassword(password) : "")
            : page.password;

        await profileAsync(c, 'page_update_db', () => db.update(contents).set({
            title,
            text: content,
            slug: finalSlug,
            status,
            password: passwordHash,
            parent,
            order,
            template,
            updatedAt: new Date(),
        }).where(eq(contents.id, id_num)));

        await profileAsync(c, 'page_update_fields', () => setContentFields(db, id_num, fields));
        return c.text('Updated');
    });

    // POST /page/:id/unlock - 页面密码解锁
    app.post('/:id/unlock', createContentUnlockHandler(async (db, identifier) => {
        const id_num = parseInt(identifier);
        if (!Number.isInteger(id_num)) {
            return null;
        }
        const page = await db.query.contents.findFirst({
            where: and(eq(contents.id, id_num), eq(contents.type, CONTENT_TYPE.PAGE)),
            columns: { id: true, password: true },
        });
        return page ?? null;
    }));

    // DELETE /page/:id
    app.delete('/:id', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id_num = parseInt(c.req.param('id'));

        const page = await profileAsync(c, 'page_delete_lookup', () => db.query.contents.findFirst({
            where: and(eq(contents.id, id_num), eq(contents.type, CONTENT_TYPE.PAGE)),
        }));

        if (!page) {
            return c.text('Not found', 404);
        }

        if (page.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        const child = await db.query.contents.findFirst({
            where: and(eq(contents.type, CONTENT_TYPE.PAGE), eq(contents.parent, id_num)),
            columns: { id: true },
        });
        if (child) {
            return c.text('Move or delete child pages before deleting this page', 409);
        }

        await profileAsync(c, 'page_delete_db', () => db.delete(contents).where(eq(contents.id, id_num)));
        return c.text('Deleted');
    });

    return app;
}

async function isValidPageParent(db: DB, parent: unknown, pageId?: number): Promise<boolean> {
    if (typeof parent !== 'number' || !Number.isSafeInteger(parent) || parent < 0) return false;
    if (parent === 0) return true;

    const pages = await db.select({ id: contents.id, parent: contents.parent }).from(contents)
        .where(eq(contents.type, CONTENT_TYPE.PAGE));
    const parents = new Map(pages.map((page) => [page.id, page.parent]));
    const visited = new Set<number>();
    let current = parent;
    while (current !== 0) {
        if (current === pageId || visited.has(current)) return false;
        visited.add(current);
        const next = parents.get(current);
        if (next === undefined) return false;
        current = next;
    }
    return true;
}
