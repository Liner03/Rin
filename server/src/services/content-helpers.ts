import { and, eq, inArray, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { DB } from "../core/hono-types";
import { contents, metas, relationships } from "../db/schema";

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

export async function getTagsForContent(db: DB, contentId: number) {
    const rows = await db.query.relationships.findMany({
        where: eq(relationships.contentId, contentId),
        columns: {},
        with: {
            meta: {
                columns: { id: true, name: true, type: true },
            },
        },
    });
    return rows
        .map(({ meta }) => meta)
        .filter((meta) => meta.type === "tag")
        .map((meta) => ({ id: meta.id, name: meta.name }));
}

export async function getCategoriesForContent(db: DB, contentId: number) {
    const rows = await db.query.relationships.findMany({
        where: eq(relationships.contentId, contentId),
        columns: {},
        with: {
            meta: {
                columns: { id: true, name: true, slug: true, type: true },
            },
        },
    });
    return rows
        .map(({ meta }) => meta)
        .filter((meta) => meta.type === "category")
        .map((meta) => ({ id: meta.id, name: meta.name, slug: meta.slug }));
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
