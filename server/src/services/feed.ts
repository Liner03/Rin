import { feedCreateSchema, feedUpdateSchema, feedSetTopSchema, type CreateFeedRequest, type UpdateFeedRequest } from "@rin/api";
import { and, asc, count, desc, eq, gt, lt, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import type { DB, Variables } from "../core/hono-types";
import { adminOnly, userOnly, withJsonBody } from "../core/route-boundaries";
import { deleteFeedById, findDuplicateFeed, findFeedById, insertFeed, searchFeedPage, updateFeedById } from "../features/feed/repository";
import { profileAsync } from "../core/server-timing";
import { contents, visits, visitStats } from "../db/schema";
import { HyperLogLog } from "../utils/hyperloglog";
import { extractImageWithMetadata } from "../utils/image";
import { stripMarkdown } from "../utils/markdown";
import { syncFeedAISummaryQueueState } from "./feed-ai-summary";
import { bindTagsToContent } from "./tag";
import { clearFeedCache, clearFeedCollectionCaches } from "./clear-feed-cache";
import {
    CONTENT_STATUS,
    CONTENT_TYPE,
    canViewContent,
    createContentUnlockHandler,
    excludeHiddenCategoryWhere,
    generateSlug,
    getTaxonomiesForContents,
    getUniqueSlug,
    hashContentPassword,
    isContentUnlocked,
    isScheduled,
    parseCookies,
    publishedWhere,
    serializeContentDetail,
} from "./content-helpers";
import { bindCategoriesToContent } from "./category";
export { clearFeedCache } from "./clear-feed-cache";

// Lazy-loaded modules for WordPress import
let XMLParser: any;
let html2md: any;

function parseFeedId(value: string): number | null {
    if (!/^[1-9]\d*$/.test(value)) {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
}

function parsePositiveInteger(value: string | undefined, fallback: number, maximum?: number) {
    const parsed = Number.parseInt(value || "", 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return maximum ? Math.min(parsed, maximum) : parsed;
}

async function initWPModules() {
    if (!XMLParser) {
        const fxp = await import("fast-xml-parser");
        XMLParser = fxp.XMLParser;
    }
    if (!html2md) {
        const h2m = await import("html-to-md");
        html2md = h2m.default;
    }
}

async function findPostByIdentifier(db: DB, idOrSlug: string) {
    const id_num = parseFeedId(idOrSlug);
    if (id_num !== null) {
        return db.query.contents.findFirst({
            where: and(eq(contents.id, id_num), eq(contents.type, CONTENT_TYPE.POST)),
            with: {
                user: { columns: { id: true, username: true, avatar: true } }
            },
        });
    }
    return db.query.contents.findFirst({
        where: and(eq(contents.slug, idOrSlug), eq(contents.type, CONTENT_TYPE.POST)),
        with: {
            user: { columns: { id: true, username: true, avatar: true } }
        },
    });
}

// 列表缓存带时间戳，定时发布的文章在到期后最多滞后 LIST_CACHE_TTL 可见
const LIST_CACHE_TTL = 5 * 60 * 1000;

type FeedListRow = typeof contents.$inferSelect & {
    hashtags?: Array<{ id: number; name: string }>;
    categories?: Array<{ id: number; name: string; slug: string | null }>;
};

function contentToFeedList(feed: FeedListRow) {
    const avatar = feed.cover || extractImageWithMetadata(feed.text);
    const plainText = stripMarkdown(feed.text);
    const { text, password, ...rest } = feed;
    return {
        ...rest,
        summary: feed.summary.length > 0 ? feed.summary : plainText.length > 100 ? plainText.slice(0, 100) : plainText,
        hashtags: feed.hashtags || [],
        categories: feed.categories || [],
        draft: feed.status === CONTENT_STATUS.DRAFT ? 1 : 0,
        listed: feed.status === CONTENT_STATUS.HIDDEN ? 0 : 1,
        avatar,
    };
}

export function FeedService(): Hono<{
    Bindings: Env;
    Variables: Variables;
}> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();

    // GET /feed - List feeds
    app.get('/', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const page = c.req.query('page');
        const limit = c.req.query('limit');
        const type = c.req.query('type');

        if ((type === 'draft' || type === 'unlisted') && !admin) {
            return c.text('Permission denied', 403);
        }

        const page_num = parsePositiveInteger(page, 1) - 1;
        const limit_num = parsePositiveInteger(limit, 20, 50);
        // 缓存按角色区分：admin 与非 admin 的查询条件不同
        const cacheKey = `feeds_${admin ? "admin_" : ""}${type}_${page_num}_${limit_num}`;
        const cached = await profileAsync(c, 'feed_list_cache_get', () => cache.get(cacheKey));

        if (cached && cached.t !== undefined && Date.now() - cached.t < LIST_CACHE_TTL) {
            return c.json(cached.data);
        }

        const typeWhere = type === 'draft'
            ? eq(contents.status, CONTENT_STATUS.DRAFT)
            : type === 'unlisted'
                ? eq(contents.status, CONTENT_STATUS.HIDDEN)
                : publishedWhere();
        // 非 admin 的首页列表排除"隐藏分类"下的文章
        const where = admin
            ? and(eq(contents.type, CONTENT_TYPE.POST), typeWhere)
            : and(eq(contents.type, CONTENT_TYPE.POST), typeWhere, excludeHiddenCategoryWhere());

        const [size, rows] = await Promise.all([
            profileAsync(c, 'feed_list_count', () => db.select({ count: count() }).from(contents).where(where)),
            profileAsync(c, 'feed_list_db', () => db.query.contents.findMany({
                where,
                columns: admin ? undefined : { status: false, password: false, parent: false, template: false, order: false, type: false, allowComment: false, allowPing: false, allowFeed: false, uid: false },
                with: {
                    user: { columns: { id: true, username: true, avatar: true } }
                },
                orderBy: [desc(contents.top), desc(contents.createdAt), desc(contents.updatedAt)],
                offset: page_num * limit_num,
                limit: limit_num + 1,
            })),
        ]);

        const rowIds = rows.map((feed: any) => feed.id);
        const { tags: tagsMap, categories: categoriesMap } = await getTaxonomiesForContents(db, rowIds);

        const feed_list = rows.map((feed: any) => contentToFeedList({
            ...feed,
            hashtags: tagsMap.get(feed.id) || [],
            categories: categoriesMap.get(feed.id) || [],
        }));

        let hasNext = false;
        if (feed_list.length === limit_num + 1) {
            feed_list.pop();
            hasNext = true;
        }

        const data = { size: size[0].count, data: feed_list, hasNext };

        if (type === undefined || type === 'normal' || type === '') {
            await profileAsync(c, 'feed_list_cache_set', () => cache.set(cacheKey, { t: Date.now(), data }));
        }

        return c.json(data);
    });

    // GET /feed/timeline
    app.get('/timeline', async (c) => {
        const db = c.get('db');
        const where = and(eq(contents.type, CONTENT_TYPE.POST), publishedWhere());

        return c.json(await profileAsync(c, 'feed_timeline_db', () => db.query.contents.findMany({
            where: where,
            columns: { id: true, title: true, createdAt: true },
            orderBy: [desc(contents.createdAt), desc(contents.updatedAt)],
        })));
    });

    // POST /feed - Create feed
    app.post('/', adminOnly(withJsonBody<CreateFeedRequest>(feedCreateSchema, async (c, body) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const serverConfig = c.get('serverConfig');
        const env = c.get('env');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const { title, slug, listed, content, summary, draft, tags, categories, createdAt, status, password, top, cover } = body;

        if (!admin) {
            return c.text('Permission denied', 403);
        }

        if (!title) {
            return c.text('Title is required', 400);
        }
        if (!content) {
            return c.text('Content is required', 400);
        }

        const exist = await profileAsync(c, 'feed_create_existing', () => findDuplicateFeed(db, title, content));

        if (exist) {
            return c.text('Content already exists', 400);
        }

        const date = createdAt ? new Date(createdAt) : new Date();

        if (!uid) {
            return c.text('User ID is required', 400);
        }

        const finalStatus = draft
            ? CONTENT_STATUS.DRAFT
            : (status || (listed === false ? CONTENT_STATUS.HIDDEN : CONTENT_STATUS.PUBLISH));
        const finalSlug = slug || await getUniqueSlug(db, generateSlug(title));
        const passwordHash = password ? await hashContentPassword(password) : "";

        const result = await profileAsync(c, 'feed_create_insert', () => insertFeed(db, {
            type: CONTENT_TYPE.POST,
            title,
            text: content,
            cover: cover || null,
            summary,
            ai_summary: "",
            ai_summary_status: "idle",
            ai_summary_error: "",
            uid,
            slug: finalSlug,
            status: finalStatus,
            password: passwordHash,
            top: top || 0,
            createdAt: date,
            updatedAt: date
        }));
        if (!result) return c.text('Failed to insert', 500);

        await profileAsync(c, 'feed_create_tags', () => bindTagsToContent(db, result.insertedId, tags || []));
        await profileAsync(c, 'feed_create_categories', () => bindCategoriesToContent(db, result.insertedId, categories || []));
        await profileAsync(c, 'feed_create_ai_queue', () => syncFeedAISummaryQueueState(db, serverConfig, env, result.insertedId, {
            draft: finalStatus === CONTENT_STATUS.DRAFT,
            updatedAt: date,
            resetSummary: true,
        }));
        await profileAsync(c, 'feed_create_cache_invalidate', () => clearFeedCache(cache, result.insertedId, finalSlug, finalSlug));

        return c.json(result);
    }, { errorMessage: (issues) => {
        if (issues.some((issue) => issue.path === 'title' && /required|empty/.test(issue.message))) return 'Title is required';
        if (issues.some((issue) => issue.path === 'content' && /required|empty/.test(issue.message))) return 'Content is required';
        return issues[0]?.message ?? 'Invalid request body';
    } }), { message: 'Permission denied', status: 403 }));

    // GET /feed/:id
    app.get('/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const clientConfig = c.get('clientConfig');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');
        const id_num = parseFeedId(id);
        const cacheKey = id_num === null ? `feed_detail_v2_alias_${id}` : `feed_detail_v2_id_${id_num}`;

        const [feed, enableVisit] = await Promise.all([
            profileAsync(c, 'feed_detail_cache_db', () => cache.getOrSet(cacheKey, async () => {
                const row = await findPostByIdentifier(db, id);
                if (!row) return null;
                const { tags, categories } = await getTaxonomiesForContents(db, [row.id]);
                return {
                    ...row,
                    hashtags: tags.get(row.id) || [],
                    categories: categories.get(row.id) || [],
                };
            })),
            profileAsync(c, 'feed_detail_counter_flag', () => clientConfig.getOrDefault('counter.enabled', true)),
        ]);

        if (!feed) {
            return c.text('Not found', 404);
        }

        // 权限：草稿/私密/定时发布
        if (!canViewContent(feed, { admin, uid }) || (isScheduled(feed) && !admin && feed.uid !== uid)) {
            return c.text('Permission denied', 403);
        }

        // 密码保护：未解锁时返回锁定状态（不缓存解锁内容）
        const cookies = parseCookies(c.req.header('cookie'));
        const unlocked = isContentUnlocked(feed, cookies);
        if (feed.password && !unlocked) {
            if (admin) {
                return c.json(serializeContentDetail(feed, { pv: 0, uv: 0 }));
            }
            return c.json(serializeContentDetail(feed, {
                pv: 0,
                uv: 0,
                content: "",
                hashtags: [],
                categories: [],
                locked: true,
            }));
        }

        // update visits using HyperLogLog for efficient UV estimation
        let pv = 0;
        let uv = 0;

        if (enableVisit) {
            const ip = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || "UNK";
            const stats = await profileAsync(c, 'feed_detail_stats_lookup', () => db.query.visitStats.findFirst({
                where: eq(visitStats.contentId, feed.id)
            }));
            const hll = new HyperLogLog(stats?.hllData);
            hll.add(ip);
            const hllData = hll.serialize();
            // Await both writes, but avoid two serial D1 round trips. Increment PV
            // in SQL so concurrent readers cannot overwrite each other's visits.
            const [updated] = await Promise.all([
                profileAsync(c, 'feed_detail_stats_update', () => db.insert(visitStats).values({
                    contentId: feed.id, pv: 1, hllData,
                }).onConflictDoUpdate({
                    target: visitStats.contentId,
                    set: { pv: sql`${visitStats.pv} + 1`, hllData, updatedAt: new Date() },
                }).returning({ pv: visitStats.pv })),
                profileAsync(c, 'feed_detail_visit_insert', () => db.insert(visits).values({ contentId: feed.id, ip })),
            ]);
            pv = updated[0].pv;
            uv = Math.round(hll.count());
        }

        return c.json(serializeContentDetail(feed, { pv, uv }));
    });

    // POST /feed/:id/unlock - 密码解锁
    app.post('/:id/unlock', createContentUnlockHandler(async (db, id) => {
        const feed = await findPostByIdentifier(db, id);
        return feed ?? null;
    }));

    // GET /feed/adjacent/:id
    app.get("/adjacent/:id", async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const id = c.req.param('id');
        let id_num = parseFeedId(id);

        if (id_num === null) {
            const slugRecord = await profileAsync(c, 'feed_adjacent_slug_lookup', () => db.select({ id: contents.id }).from(contents)
                .where(and(eq(contents.slug, id), eq(contents.type, CONTENT_TYPE.POST))));
            if (slugRecord.length === 0) {
                return c.text("Not found", 404);
            }
            id_num = slugRecord[0].id;
        }

        const feed = await profileAsync(c, 'feed_adjacent_current', () => db.query.contents.findFirst({
            where: and(eq(contents.id, id_num), eq(contents.type, CONTENT_TYPE.POST)),
            columns: { createdAt: true },
        }));

        if (!feed) {
            return c.text("Not found", 404);
        }

        const created_at = feed.createdAt;

        async function formatAndCacheData(feed: any, feedDirection: "previous_feed" | "next_feed") {
            if (feed) {
                const cacheKey = `${feed.id}_${feedDirection}_${id_num}`;
                const cacheData = {
                    id: feed.id,
                    title: feed.title,
                    summary: feed.summary,
                    hashtags: feed.hashtags || [],
                    categories: feed.categories || [],
                    createdAt: feed.createdAt,
                    updatedAt: feed.updatedAt,
                };
                await cache.set(cacheKey, cacheData);
                return cacheData;
            }
            return null;
        }

        const baseWhere = (field: AnyColumn, op: typeof lt) => and(eq(contents.type, CONTENT_TYPE.POST), publishedWhere(), op(field, created_at));

        async function loadAdjacentFeed(
            direction: "previous_feed" | "next_feed",
            where: ReturnType<typeof baseWhere>,
            order: SQL,
        ) {
            const cached = await profileAsync(c, `feed_adjacent_${direction === "previous_feed" ? "prev" : "next"}_cache`, () => cache.getBySuffix(`${direction}_${id_num}`));
            if (cached && cached.length > 0) {
                return cached[0];
            }
            const row = await profileAsync(c, `feed_adjacent_${direction === "previous_feed" ? "prev" : "next"}_db`, () => db.query.contents.findFirst({
                where,
                orderBy: [order],
                with: {
                    user: { columns: { id: true, username: true, avatar: true } }
                },
            }));
            if (!row) return null;
            const { tags, categories } = await getTaxonomiesForContents(db, [row.id]);
            const summary = row.summary.length > 0
                ? row.summary
                : stripMarkdown(row.text).slice(0, 50);
            return formatAndCacheData({
                ...row,
                hashtags: tags.get(row.id) || [],
                categories: categories.get(row.id) || [],
                summary,
            }, direction);
        }

        const [previousFeed, nextFeed] = await Promise.all([
            loadAdjacentFeed("previous_feed", baseWhere(contents.createdAt, lt), desc(contents.createdAt)),
            loadAdjacentFeed("next_feed", baseWhere(contents.createdAt, gt), asc(contents.createdAt)),
        ]);
        return c.json({ previousFeed, nextFeed });
    });

    // POST /feed/:id - Update feed
    app.post('/:id', userOnly(withJsonBody<UpdateFeedRequest>(feedUpdateSchema, async (c, body) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const serverConfig = c.get('serverConfig');
        const env = c.get('env');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');
        const { title, listed, content, summary, slug, draft, top, tags, categories, createdAt, status, password, cover } = body;

        const id_num = parseFeedId(id);
        if (id_num === null) return c.text('Not found', 404);
        const feed = await profileAsync(c, 'feed_update_lookup', () => findFeedById(db, id_num));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        const contentChanged = content && content !== feed.text;
        // draft=true 强制草稿；draft=false 时按显式 status / listed / 原状态推导，
        // 避免编辑 hidden 文章时被悄悄改回 publish
        const finalStatus = draft
            ? CONTENT_STATUS.DRAFT
            : (status
                ? status
                : listed === false
                    ? CONTENT_STATUS.HIDDEN
                    : feed.status === CONTENT_STATUS.DRAFT
                        ? CONTENT_STATUS.PUBLISH
                        : feed.status);
        const isDraft = finalStatus === CONTENT_STATUS.DRAFT;
        const shouldQueueAISummary = (contentChanged && !isDraft) || (!isDraft && feed.status === CONTENT_STATUS.DRAFT && !feed.ai_summary);
        const updateTime = new Date();
        const finalSlug = slug || feed.slug || await getUniqueSlug(db, generateSlug(title || feed.title));
        const passwordHash = password !== undefined
            ? (password ? await hashContentPassword(password) : "")
            : feed.password;

        await profileAsync(c, 'feed_update_db', () => updateFeedById(db, id_num, {
            title,
            text: content,
            cover,
            summary,
            ai_summary: shouldQueueAISummary ? "" : undefined,
            ai_summary_status: isDraft ? "idle" : undefined,
            ai_summary_error: shouldQueueAISummary || isDraft ? "" : undefined,
            slug: finalSlug,
            top,
            status: finalStatus,
            password: passwordHash,
            createdAt: createdAt ? new Date(createdAt) : undefined,
            updatedAt: updateTime
        }));

        if (tags) {
            await profileAsync(c, 'feed_update_tags', () => bindTagsToContent(db, id_num, tags));
        }
        if (categories) {
            await profileAsync(c, 'feed_update_categories', () => bindCategoriesToContent(db, id_num, categories));
        }

        if (shouldQueueAISummary || isDraft) {
            await profileAsync(c, 'feed_update_ai_queue', () => syncFeedAISummaryQueueState(db, serverConfig, env, id_num, {
                draft: Boolean(isDraft),
                updatedAt: updateTime,
                resetSummary: shouldQueueAISummary,
            }));
        }

        await profileAsync(c, 'feed_update_cache_invalidate', () => clearFeedCache(cache, id_num, feed.slug, finalSlug));
        return c.text('Updated');
    }), { message: 'Permission denied', status: 403 }));

    // POST /feed/top/:id
    app.post('/top/:id', userOnly(withJsonBody<{ top: number }>(feedSetTopSchema, async (c, body) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');
        const { top } = body;

        const id_num = parseFeedId(id);
        if (id_num === null) return c.text('Not found', 404);
        const feed = await profileAsync(c, 'feed_top_lookup', () => findFeedById(db, id_num));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        await profileAsync(c, 'feed_top_db', () => updateFeedById(db, feed.id, { top }));
        await profileAsync(c, 'feed_top_cache_invalidate', () => clearFeedCache(cache, feed.id, feed.slug, feed.slug));
        return c.text('Updated');
    }), { message: 'Permission denied', status: 403 }));

    // DELETE /feed/:id
    app.delete('/:id', userOnly(async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');

        const id_num = parseFeedId(id);
        if (id_num === null) return c.text('Not found', 404);
        const feed = await profileAsync(c, 'feed_delete_lookup', () => findFeedById(db, id_num));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        await profileAsync(c, 'feed_delete_db', () => deleteFeedById(db, id_num));
        await profileAsync(c, 'feed_delete_cache_invalidate', () => clearFeedCache(cache, id_num, feed.slug, null));
        return c.text('Deleted');
    }, { message: 'Permission denied', status: 403 }));
    return app;
}

export function SearchService(): Hono<{
    Bindings: Env;
    Variables: Variables;
}> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();

    // GET /search/:keyword
    app.get('/:keyword', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const page = c.req.query('page');
        const limit = c.req.query('limit');
        // Hono has already decoded the route parameter, including literal % signs.
        const keyword = c.req.param('keyword');
        const page_num = parsePositiveInteger(page, 1) - 1;
        const limit_num = parsePositiveInteger(limit, 20, 50);

        if (keyword === undefined || keyword.trim().length === 0) {
            return c.json({ size: 0, data: [], hasNext: false });
        }

        const cacheKey = `search_v3_${admin ? "admin" : "public"}_${page_num}_${limit_num}_${encodeURIComponent(keyword)}`;
        const cached = await profileAsync(c, 'feed_search_cache_get', () => cache.get(cacheKey));
        if (cached && cached.t !== undefined && Date.now() - cached.t < LIST_CACHE_TTL) {
            return c.json(cached.data);
        }
        const result = await profileAsync(c, 'feed_search_db', () => searchFeedPage(db, {
            keyword, admin: Boolean(admin), pageIndex: page_num, limit: limit_num,
        }));
        const ids = result.rows.map((feed) => feed.id);
        const { tags: tagsMap, categories: categoriesMap } = await getTaxonomiesForContents(db, ids);
        const data = {
            size: result.size,
            hasNext: result.hasNext,
            data: result.rows.map((feed) => contentToFeedList({
                ...feed, hashtags: tagsMap.get(feed.id) || [], categories: categoriesMap.get(feed.id) || [],
            })),
        };
        await cache.set(cacheKey, { t: Date.now(), data });
        return c.json(data);
    });
    return app;
}


export function WordPressService(): Hono<{
    Bindings: Env;
    Variables: Variables;
}> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();

    // POST /wp - WordPress import
    app.post('/', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const body = await profileAsync(c, 'wp_import_parse', () => c.req.parseBody());
        const data = body.data as File;

        if (!admin) {
            return c.text('Permission denied', 403);
        }

        if (!data) {
            return c.text('Data is required', 400);
        }

        // Initialize WordPress import modules lazily
        await profileAsync(c, 'wp_import_modules', () => initWPModules());

        const xml = await profileAsync(c, 'wp_import_read', () => data.text());
        const parser = new XMLParser();
        const result = await profileAsync(c, 'wp_import_xml_parse', () => parser.parse(xml));
        const items = result.rss.channel.item;

        if (!items) {
            return c.text('No items found', 404);
        }

        const feedItems: FeedItem[] = items?.map((item: any) => {
            const createdAt = new Date(item?.['wp:post_date']);
            const updatedAt = new Date(item?.['wp:post_modified']);
            const draft = item?.['wp:status'] !== 'publish';
            const contentHtml = item?.['content:encoded'];
            const content = html2md(contentHtml);
            const summary = content.length > 100 ? content.slice(0, 100) : content;
            let tags = item?.['category'];

            if (tags && Array.isArray(tags)) {
                tags = tags.map((tag: any) => tag + '');
            } else if (tags && typeof tags === 'string') {
                tags = [tags];
            }

            return {
                title: item.title,
                summary,
                content,
                draft,
                createdAt,
                updatedAt,
                tags
            };
        });

        let success = 0;
        let skipped = 0;
        let skippedList: { title: string, reason: string }[] = [];

        for (const item of feedItems) {
            if (!item.content) {
                skippedList.push({ title: item.title, reason: "no content" });
                skipped++;
                continue;
            }

            const exist = await profileAsync(c, 'wp_import_existing', () => db.query.contents.findFirst({
                where: and(eq(contents.type, CONTENT_TYPE.POST), eq(contents.text, item.content))
            }));
            if (exist) {
                skippedList.push({ title: item.title, reason: "content exists" });
                skipped++;
                continue;
            }

            const finalSlug = await getUniqueSlug(db, generateSlug(item.title));
            const result = await profileAsync(c, 'wp_import_insert', () => db.insert(contents).values({
                type: CONTENT_TYPE.POST,
                title: item.title,
                text: item.content,
                summary: item.summary,
                uid: 1,
                status: item.draft ? CONTENT_STATUS.DRAFT : CONTENT_STATUS.PUBLISH,
                slug: finalSlug,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            }).returning({ insertedId: contents.id }));

            if (item.tags) {
                const tags = item.tags;
                await profileAsync(c, 'wp_import_tags', () => bindTagsToContent(db, result[0].insertedId, tags));
            }
            success++;
        }

        await profileAsync(c, 'wp_import_cache_invalidate', () => clearFeedCollectionCaches(cache));
        await profileAsync(c, 'wp_import_cache_invalidate_category', () => cache.deletePrefix('category_'));
        return c.json({ success, skipped, skippedList });
    });
    return app;
}

type FeedItem = {
    title: string;
    summary: string;
    content: string;
    draft: boolean;
    createdAt: Date;
    updatedAt: Date;
    tags?: string[];
}
