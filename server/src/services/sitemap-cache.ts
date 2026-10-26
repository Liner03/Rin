import { and, eq } from "drizzle-orm";
import type { DB } from "../core/hono-types";
import { cache } from "../db/schema";

const SITEMAP_CACHE_TYPE = "sitemap";
const SITEMAP_REVISION_KEY = "revision";

// 0016.sql 的触发器在同一条数据写入内更新版本号；这里仅读取共享失效状态。
export async function getSitemapRevision(db: DB): Promise<string> {
  const [row] = await db.select({ value: cache.value }).from(cache)
    .where(and(eq(cache.type, SITEMAP_CACHE_TYPE), eq(cache.key, SITEMAP_REVISION_KEY)))
    .limit(1);
  return row?.value ?? "initial";
}
