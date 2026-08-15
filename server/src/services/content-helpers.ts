import { and, eq, inArray, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { AppContext, DB } from "../core/hono-types";
import { contents, metas, relationships } from "../db/schema";
import { profileAsync } from "../core/server-timing";

export const CONTENT_TYPE = {
    POST: "post",
    PAGE: "page",
    ATTACHMENT: "attachment",
} as const;
export type ContentType = (typeof CONTENT_TYPE)[keyof typeof CONTENT_TYPE];

export const CONTENT_STATUS = {
    PUBLISH: "publish",
    DRAFT: "draft",
    HIDDEN: "hidden",
    PRIVATE: "private",
} as const;
export type ContentStatus = (typeof CONTENT_STATUS)[keyof typeof CONTENT_STATUS];

export const PASSWORD_COOKIE_PREFIX = "content_pwd_";

export async function hashContentPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export function isContentProtected(content: { password: string | null }): boolean {
    return Boolean(content.password);
}

export function isScheduled(content: { status: string; createdAt: Date | string }): boolean {
    if (content.status !== CONTENT_STATUS.PUBLISH) {
        return false;
    }
    const time = typeof content.createdAt === "string"
        ? new Date(content.createdAt).getTime()
        : content.createdAt.getTime();
    return time > Date.now();
}

export function canViewContent(
    content: { status: string; uid: number },
    viewer: { admin: boolean; uid?: number | null },
): boolean {
    if (content.status === CONTENT_STATUS.DRAFT || content.status === CONTENT_STATUS.PRIVATE) {
        return viewer.admin || viewer.uid === content.uid;
    }
    return true;
}

export function isContentUnlocked(
    content: { id: number; password: string | null },
    cookies: Record<string, string>,
): boolean {
    if (!isContentProtected(content)) {
        return true;
    }
    return cookies[`${PASSWORD_COOKIE_PREFIX}${content.id}`] === content.password;
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!header) return cookies;
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key) cookies[key] = rest.join('=');
    }
    return cookies;
}

// 列表行可见性过滤：公开列表项（密码保护文章在列表可见，Typecho 语义）
export function isPubliclyListed(content: { status: string; createdAt: Date | string }, admin: boolean): boolean {
    if (content.status !== CONTENT_STATUS.PUBLISH) {
        return false;
    }
    if (!admin && isScheduled(content)) {
        return false;
    }
    return true;
}

// 详情序列化：text -> content，password 不下发，附加兼容字段
export function serializeContentDetail(content: any, extra: Record<string, unknown> = {}) {
    const { text, password, ...rest } = content;
    return {
        ...rest,
        content: text,
        slug: content.slug,
        draft: content.status === CONTENT_STATUS.DRAFT ? 1 : 0,
        listed: content.status === CONTENT_STATUS.HIDDEN ? 0 : 1,
        hasPassword: Boolean(password),
        locked: false,
        ...extra,
    };
}

export function generateSlug(title: string): string {
    const base = title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
    return base || "post";
}

export async function getUniqueSlug(db: DB, base: string): Promise<string> {
    const existing = await db.select({ slug: contents.slug }).from(contents)
        .where(eq(contents.slug, base));

    if (existing.length === 0) {
        return base;
    }

    let index = 1;
    while (true) {
        const candidate = `${base}-${index}`;
        const hit = await db.select({ slug: contents.slug }).from(contents)
            .where(eq(contents.slug, candidate));
        if (hit.length === 0) {
            return candidate;
        }
        index += 1;
    }
}

// 公开可见文章条件：status=publish 且未到定时发布时间
export function publishedWhere(now = new Date()) {
    return and(eq(contents.status, CONTENT_STATUS.PUBLISH), lte(contents.createdAt, now));
}

// 排除"隐藏分类"（listed=0）下文章的条件：该文章属于任一隐藏分类则排除
export function excludeHiddenCategoryWhere() {
    return sql`NOT EXISTS (
        SELECT 1 FROM relationships
        JOIN metas ON metas.id = relationships.meta_id
        WHERE relationships.content_id = contents.id
        AND metas.type = 'category'
        AND metas.listed = 0
    )`;
}

export async function getTagsForContent(db: DB, contentId: number) {
    const map = await getTagsForContents(db, [contentId]);
    return map.get(contentId) || [];
}

export async function getCategoriesForContent(db: DB, contentId: number) {
    const map = await getCategoriesForContents(db, [contentId]);
    return map.get(contentId) || [];
}

export async function getTagsForContents(db: DB, contentIds: number[]) {
    const rows = await getMetasForContents(db, contentIds);
    const map = new Map<number, Array<{ id: number; name: string }>>();
    for (const [contentId, metaList] of rows) {
        const tags = metaList
            .filter((meta) => meta.type === "tag")
            .map((meta) => ({ id: meta.id, name: meta.name }));
        if (tags.length > 0) {
            map.set(contentId, tags);
        }
    }
    return map;
}

export async function getCategoriesForContents(db: DB, contentIds: number[]) {
    const rows = await getMetasForContents(db, contentIds);
    const map = new Map<number, Array<{ id: number; name: string; slug: string | null }>>();
    for (const [contentId, metaList] of rows) {
        const categories = metaList
            .filter((meta) => meta.type === "category")
            .map((meta) => ({ id: meta.id, name: meta.name, slug: meta.slug }));
        if (categories.length > 0) {
            map.set(contentId, categories);
        }
    }
    return map;
}

async function getMetasForContents(db: DB, contentIds: number[]) {
    const map = new Map<number, Array<{ id: number; name: string; slug: string | null; type: string }>>();
    if (contentIds.length === 0) {
        return map;
    }
    const rows = await db.query.relationships.findMany({
        where: inArray(relationships.contentId, contentIds),
        columns: { contentId: true },
        with: {
            meta: {
                columns: { id: true, name: true, slug: true, type: true },
            },
        },
    });
    for (const row of rows) {
        if (!map.has(row.contentId)) {
            map.set(row.contentId, []);
        }
        map.get(row.contentId)!.push(row.meta);
    }
    return map;
}

export async function refreshMetaCounts(db: DB, metaIds: number[]) {
    if (metaIds.length === 0) {
        return;
    }
    const now = Math.floor(Date.now() / 1000);
    const counts = await db.select({
        metaId: metas.id,
        total: sql<number>`(
            SELECT COUNT(*) FROM relationships
            JOIN contents ON contents.id = relationships.content_id
            WHERE relationships.meta_id = metas.id
            AND contents.type = 'post'
            AND contents.status = 'publish'
            AND contents.created_at <= ${now}
        )`,
    }).from(metas).where(inArray(metas.id, metaIds));

    for (const { metaId, total } of counts) {
        await db.update(metas).set({ count: Number(total) }).where(eq(metas.id, metaId));
    }
}

// 密码解锁处理器工厂：feed（按 id/slug）与 page（按 id）共用
export function createContentUnlockHandler(
    loader: (db: DB, identifier: string) => Promise<{ id: number; password: string | null } | null>,
) {
    return async (c: AppContext) => {
        const db = c.get('db');
        const admin = c.get('admin');
        const identifier = c.req.param('id');
        const body = await profileAsync(c, 'content_unlock_parse', () => c.req.json());
        const { password } = body;

        const content = await profileAsync(c, 'content_unlock_lookup', () => loader(db, identifier));
        if (!content) {
            return c.text('Not found', 404);
        }
        if (admin) {
            return c.text('OK');
        }

        if (!password || !content.password) {
            return c.text('Password is required', 400);
        }

        const passwordHash = await hashContentPassword(password);
        if (passwordHash !== content.password) {
            return c.text('Incorrect password', 403);
        }

        c.header('Set-Cookie', `${PASSWORD_COOKIE_PREFIX}${content.id}=${content.password}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`);
        return c.text('OK');
    };
}
