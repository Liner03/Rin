import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, DB } from "../core/hono-types";
import { contents, friends, metas, moments, relationships } from "../db/schema";
import { path_join } from "../utils/path";
import { getStorageObject, putStorageObjectAtKey } from "../utils/storage";
import { CONTENT_STATUS, CONTENT_TYPE, excludeHiddenCategoryWhere, publishedWhere } from "./content-helpers";
import { getSitemapRevision } from "./sitemap-cache";

const SITEMAP_CACHE_FOLDER = "cache/";
const SITEMAP_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SITEMAP_CONTENT_TYPE = "application/xml; charset=utf-8";
const ROBOTS_CONTENT_TYPE = "text/plain; charset=utf-8";

// XML 预定义实体转义，避免内容破坏文档结构
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 将 Date 或 unix 秒格式化为 W3C 日期 (YYYY-MM-DD)
function formatLastMod(value: Date | number | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// 站点根地址：优先使用显式 FRONTEND_URL，其次回退到请求来源；cron 场景无请求时留空
function getBaseUrl(env: Env, requestUrl?: string): string {
  if (env.FRONTEND_URL?.trim()) return env.FRONTEND_URL.trim().replace(/\/+$/, "");
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // 解析失败则回退到空字符串
    }
  }
  return "";
}

function hasConfiguredBaseUrl(env: Env): boolean {
  return Boolean(env.FRONTEND_URL?.trim());
}

interface CachedSitemap {
  baseUrl: string;
  revision: string;
  generatedAt: number;
  expiresAt: number;
  xml: string;
}

function isFreshSitemap(value: unknown, baseUrl: string, revision: string): value is CachedSitemap {
  if (!value || typeof value !== "object") return false;
  const now = Date.now();
  return "baseUrl" in value && value.baseUrl === baseUrl
    && "revision" in value && value.revision === revision
    && "generatedAt" in value && typeof value.generatedAt === "number" && value.generatedAt <= now
    && "expiresAt" in value && typeof value.expiresAt === "number" && value.expiresAt > now
    && value.expiresAt <= value.generatedAt + SITEMAP_CACHE_TTL_MS
    && "xml" in value && typeof value.xml === "string" && value.xml.startsWith("<?xml");
}

// 请求与 cron 共用版本检查；旧请求即使迟到写入，也无法让旧版本缓存重新生效。
async function loadSitemap(env: Env, db: DB, requestUrl?: string): Promise<string> {
  const baseUrl = getBaseUrl(env, requestUrl);
  const canUsePersistentCache = hasConfiguredBaseUrl(env);
  const revision = canUsePersistentCache ? await getSitemapRevision(db) : "";
  // 独立键避免部署后继续复用没有版本信息的旧 sitemap.xml。
  const key = path_join(env.S3_CACHE_FOLDER || SITEMAP_CACHE_FOLDER, "sitemap-v2.json");

  if (canUsePersistentCache) {
    try {
      const response = await getStorageObject(env, key);
      if (response) {
        const cached: unknown = await response.json();
        if (isFreshSitemap(cached, baseUrl, revision)) return cached.xml;
      }
    } catch (e: unknown) {
      console.log(`[Sitemap] cache read failed: ${e instanceof Error ? e.message : String(e)}, falling back to generation`);
    }
  }

  const generated = await generateSitemapXml(env, db, requestUrl);
  if (canUsePersistentCache) {
    const cached: CachedSitemap = { ...generated, baseUrl, revision };
    try {
      await putStorageObjectAtKey(env, key, JSON.stringify(cached), "application/json");
    } catch (e: unknown) {
      console.log(`[Sitemap] cache write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return generated.xml;
}

async function generateSitemapXml(env: Env, db: DB, requestUrl?: string): Promise<Pick<CachedSitemap, "xml" | "generatedAt" | "expiresAt">> {
  const baseUrl = getBaseUrl(env, requestUrl);
  if (!baseUrl) {
    throw new Error("A canonical URL or request URL is required to generate a sitemap");
  }
  const now = new Date(Date.now());
  const eligibleContent = and(
    eq(contents.status, CONTENT_STATUS.PUBLISH),
    or(eq(contents.password, ""), isNull(contents.password)),
    or(eq(contents.type, CONTENT_TYPE.POST), eq(contents.type, CONTENT_TYPE.PAGE)),
    excludeHiddenCategoryWhere(),
  );
  const indexableContent = and(eligibleContent, publishedWhere(now));
  const [contentRows, momentRows, friendRows, metaRows, scheduledRows] = await Promise.all([
    db
      .select({ id: contents.id, slug: contents.slug, type: contents.type, updatedAt: contents.updatedAt })
      .from(contents)
      .where(indexableContent),
    db.select({ updatedAt: moments.updatedAt }).from(moments).orderBy(desc(moments.updatedAt)).limit(1),
    db.select({ updatedAt: friends.updatedAt }).from(friends).where(eq(friends.accepted, 1)).orderBy(desc(friends.updatedAt)).limit(1),
    db
      .selectDistinct({ name: metas.name, slug: metas.slug, type: metas.type, updatedAt: metas.updatedAt })
      .from(metas)
      .innerJoin(relationships, eq(relationships.metaId, metas.id))
      .innerJoin(contents, eq(relationships.contentId, contents.id))
      .where(and(indexableContent, eq(contents.type, CONTENT_TYPE.POST),
        or(eq(metas.type, "tag"), and(eq(metas.type, "category"), eq(metas.listed, 1))))),
    db.select({ createdAt: contents.createdAt }).from(contents)
      .where(and(eligibleContent, gt(contents.createdAt, now)))
      .orderBy(asc(contents.createdAt)).limit(1),
  ]);

  const urls: string[] = [];

  const addUrl = (loc: string, lastmod?: Date | null) => {
    const lastmodStr = formatLastMod(lastmod);
    // 首页只输出站点根地址，不带末尾斜杠
    const fullUrl = loc === "/" ? baseUrl : baseUrl + loc;
    urls.push(
      `    <url>\n      <loc>${escapeXml(fullUrl)}</loc>${
        lastmodStr ? `\n      <lastmod>${lastmodStr}</lastmod>` : ""
      }\n    </url>`,
    );
  };

  // 取一组时间中最新的一条，作为聚合页面的 lastmod
  const latestOf = (dates: (Date | null | undefined)[]): Date | null => {
    let latest: Date | null = null;
    for (const d of dates) {
      if (d != null && (!latest || d.getTime() > latest.getTime())) latest = d;
    }
    return latest;
  };

  const latestFeedUpdatedAt = latestOf(contentRows.filter((row) => row.type === CONTENT_TYPE.POST).map((row) => row.updatedAt));
  const latestHashtagUpdatedAt = latestOf(metaRows.filter((row) => row.type === "tag").map((row) => row.updatedAt));

  // 聚合页面：各自携带对应数据源的最新更新时间
  addUrl("/", latestFeedUpdatedAt);
  addUrl("/timeline", latestFeedUpdatedAt);
  addUrl("/moments", momentRows[0]?.updatedAt);
  addUrl("/friends", friendRows[0]?.updatedAt);
  addUrl("/hashtags", latestHashtagUpdatedAt);

  // 独立页面与文章使用各自的前端路由。
  for (const content of contentRows) {
    const path = content.type === CONTENT_TYPE.PAGE
      ? `/page/${encodeURIComponent(content.slug || String(content.id))}`
      : content.slug ? `/${encodeURIComponent(content.slug)}` : `/feed/${content.id}`;
    addUrl(path, content.updatedAt);
  }

  for (const meta of metaRows) {
    const path = meta.type === "category"
      ? `/category/${encodeURIComponent(meta.slug || meta.name)}`
      : `/hashtag/${encodeURIComponent(meta.name)}`;
    addUrl(path, meta.updatedAt);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    "\n",
  )}\n</urlset>\n`;
  return {
    xml,
    generatedAt: now.getTime(),
    expiresAt: Math.min(now.getTime() + SITEMAP_CACHE_TTL_MS, scheduledRows[0]?.createdAt.getTime() ?? Infinity),
  };
}

// 生成 robots.txt 内容
function generateRobotsTxt(env: Env, requestUrl?: string): string {
  const baseUrl = getBaseUrl(env, requestUrl);
  if (!baseUrl) {
    throw new Error("A canonical URL or request URL is required to generate robots.txt");
  }
  return `User-agent: *
Allow: /

Disallow: /admin/
Disallow: /profile/
Disallow: /login/
Disallow: /search/

Sitemap: ${baseUrl}/sitemap.xml
`;
}

/**
 * Sitemap 服务：将站点可索引 URL 暴露为 /sitemap.xml，并提供 /robots.txt。
 * 配置 FRONTEND_URL 时使用 R2/S3 预生成缓存；否则按请求 origin 实时生成，
 * 避免多域名部署将某次请求的地址写入共享缓存。
 */
export function SitemapService(): Hono {
  const app = new Hono();

  app.get("/sitemap.xml", async (c: AppContext) => {
    const env = c.get("env");
    const db = c.get("db");
    const xml = await loadSitemap(env, db, c.req.url);

    return c.body(xml, 200, {
      "Content-Type": SITEMAP_CONTENT_TYPE,
      // 月缓存由服务端版本号控制，浏览器/CDN 必须回源验证，才能及时看到内容变更。
      "Cache-Control": "public, no-cache",
    });
  });

  app.get("/robots.txt", async (c: AppContext) => {
    const env = c.get("env");
    const key = path_join(env.S3_CACHE_FOLDER || SITEMAP_CACHE_FOLDER, "robots.txt");
    const canUsePersistentCache = hasConfiguredBaseUrl(env);

    if (canUsePersistentCache) {
      try {
        const cached = await getStorageObject(env, key);
        if (cached) {
          const text = await cached.text();
          return c.body(text, 200, {
            "Content-Type": ROBOTS_CONTENT_TYPE,
            "Cache-Control": "public, max-age=3600",
          });
        }
      } catch (e: any) {
        console.log(`[Sitemap] robots cache read failed: ${e?.message}, falling back to generation`);
      }
    }

    const robots = generateRobotsTxt(env, c.req.url);
    if (canUsePersistentCache) {
      try {
        await putStorageObjectAtKey(env, key, robots, "text/plain");
      } catch (e: any) {
        console.log(`[Sitemap] robots cache write failed: ${e?.message}`);
      }
    }

    return c.body(robots, 200, {
      "Content-Type": ROBOTS_CONTENT_TYPE,
      "Cache-Control": "public, max-age=3600",
    });
  });

  return app;
}

// 定时任务复用有效缓存，仅在版本变化或过期时重建 sitemap。
export async function sitemapCrontab(env: Env, db: DB) {
  if (!hasConfiguredBaseUrl(env)) {
    console.log("[Sitemap] Skipping pre-generation because FRONTEND_URL is not configured");
    return;
  }

  const folder = env.S3_CACHE_FOLDER || SITEMAP_CACHE_FOLDER;

  try {
    await loadSitemap(env, db);
  } catch (e: any) {
    console.error(`[Sitemap] Failed to save sitemap.xml: ${e?.message}`);
  }

  try {
    const robots = generateRobotsTxt(env);
    const cached = await getStorageObject(env, path_join(folder, "robots.txt"));
    if (cached && await cached.text() === robots) return;
    await putStorageObjectAtKey(env, path_join(folder, "robots.txt"), robots, "text/plain");
    console.log("[Sitemap] Saved robots.txt to storage");
  } catch (e: any) {
    console.error(`[Sitemap] Failed to save robots.txt: ${e?.message}`);
  }
}
