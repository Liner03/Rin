import type { CacheImpl } from "../core/hono-types";

export async function clearFeedCache(cache: CacheImpl, id: number, alias: string | null, newAlias: string | null) {
    await cache.deletePrefix('feeds_', false);
    await cache.deletePrefix('search_', false);
    await cache.deletePrefix('category_', false);
    await cache.deletePrefix('page_', false);

    const detailKeys = new Set([`feed_detail_v2_id_${id}`]);
    if (alias) {
        detailKeys.add(`feed_detail_v2_alias_${alias}`);
    }
    if (newAlias && newAlias !== alias) {
        detailKeys.add(`feed_detail_v2_alias_${newAlias}`);
    }

    for (const key of detailKeys) {
        await cache.delete(key, false);
    }

    await cache.deletePrefix(`${id}_previous_feed`, false);
    await cache.deletePrefix(`${id}_next_feed`, false);
    await cache.save();
}
