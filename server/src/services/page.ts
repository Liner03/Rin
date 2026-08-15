import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { contents } from "../db/schema";
import {
    CONTENT_STATUS,
    PASSWORD_COOKIE_PREFIX,
    canViewContent,
    generateSlug,
    getUniqueSlug,
    hashContentPassword,
    isContentUnlocked,
} from "./content-helpers";

export function PageService(): Hono {
    const app = new Hono();

    // GET /page - 页面列表
    app.get('/', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');

        const where = admin
            ? and(eq(contents.type, 'page'))
            : and(eq(contents.type, 'page'), eq(contents.status, CONTENT_STATUS.PUBLISH), eq(contents.password, ""));

        const page_list = await profileAsync(c, 'page_list_db', () => db.query.contents.findMany({
            where,
            columns: admin ? undefined : { password: false, uid: false },
            with: {
                user: { columns: { id: true, username: true, avatar: true } },
            },
            orderBy: [asc(contents.order), asc(contents.id)],
        }));

        return c.json(page_list);
    });

    // GET /page/:slug - 页面详情
    app.get('/:slug', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const slugDecoded = decodeURI(c.req.param('slug'));

        const page = await profileAsync(c, 'page_detail_db', () => db.query.contents.findFirst({
            where: and(eq(contents.type, 'page'), eq(contents.slug, slugDecoded)),
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
        if (page.password && !unlocked) {
            if (admin) {
                return c.json(page);
            }
            return c.json({
                id: page.id,
                title: page.title,
                locked: true,
                status: page.status,
                createdAt: page.createdAt,
                updatedAt: page.updatedAt,
            });
        }

        return c.json(page);
    });

    // POST /page - 创建页面
    app.post('/', async (c: AppContext) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const body = await profileAsync(c, 'page_create_parse', () => c.req.json());
        const { title, content, slug, status, password, parent, order, template } = body;

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

        const finalSlug = slug || await getUniqueSlug(db, generateSlug(title));
        const passwordHash = password ? await hashContentPassword(password) : "";

        const result = await profileAsync(c, 'page_create_db', () => db.insert(contents).values({
            type: 'page',
            title,
            text: content,
            uid,
            slug: finalSlug,
            status: status || CONTENT_STATUS.PUBLISH,
            password: passwordHash,
            parent: parent || 0,
            order: order || 0,
            template: template || "",
        }).returning({ insertedId: contents.id }));

        await profileAsync(c, 'page_create_cache_invalidate', () => cache.deletePrefix('page_'));

        if (result.length === 0) {
            return c.text('Failed to insert', 500);
        }
        return c.json(result[0]);
    });

    // POST /page/:id - 更新页面
    app.post('/:id', async (c: AppContext) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id_num = parseInt(c.req.param('id'));
        const body = await profileAsync(c, 'page_update_parse', () => c.req.json());
        const { title, content, slug, status, password, parent, order, template } = body;

        const page = await profileAsync(c, 'page_update_lookup', () => db.query.contents.findFirst({
            where: and(eq(contents.id, id_num), eq(contents.type, 'page')),
        }));

        if (!page) {
            return c.text('Not found', 404);
        }

        if (page.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
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
        }).where(eq(contents.id, id_num)));

        await profileAsync(c, 'page_update_cache_invalidate', () => cache.deletePrefix('page_'));
        return c.text('Updated');
    });

    // POST /page/:id/unlock - 页面密码解锁
    app.post('/:id/unlock', async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const id_num = parseInt(c.req.param('id'));
        const body = await profileAsync(c, 'page_unlock_parse', () => c.req.json());
        const { password } = body;

        const page = await profileAsync(c, 'page_unlock_lookup', () => db.query.contents.findFirst({
            where: and(eq(contents.id, id_num), eq(contents.type, 'page')),
        }));
        if (!page) {
            return c.text('Not found', 404);
        }
        if (admin) {
            return c.text('OK');
        }

        if (!password || !page.password) {
            return c.text('Password is required', 400);
        }

        const passwordHash = await hashContentPassword(password);
        if (passwordHash !== page.password) {
            return c.text('Incorrect password', 403);
        }

        c.header('Set-Cookie', `${PASSWORD_COOKIE_PREFIX}${page.id}=${page.password}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`);
        return c.text('OK');
    });

    // DELETE /page/:id
    app.delete('/:id', async (c: AppContext) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id_num = parseInt(c.req.param('id'));

        const page = await profileAsync(c, 'page_delete_lookup', () => db.query.contents.findFirst({
            where: and(eq(contents.id, id_num), eq(contents.type, 'page')),
        }));

        if (!page) {
            return c.text('Not found', 404);
        }

        if (page.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        await profileAsync(c, 'page_delete_db', () => db.delete(contents).where(eq(contents.id, id_num)));
        await profileAsync(c, 'page_delete_cache_invalidate', () => cache.deletePrefix('page_'));
        return c.text('Deleted');
    });

    return app;
}

function parseCookies(header: string | null | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!header) return cookies;
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key) cookies[key] = rest.join('=');
    }
    return cookies;
}
