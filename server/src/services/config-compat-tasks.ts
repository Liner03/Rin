import { desc, eq } from "drizzle-orm";
import type { CacheImpl, DB } from "../core/hono-types";
import { contents } from "../db/schema";
import { syncFeedAISummaryQueueState } from "./feed-ai-summary";
import { clearFeedCache } from "./feed";
import { contentHasImagesMissingMetadata } from "../utils/image";
import { getAIConfig } from "../utils/db-config";

type ConfigReader = {
  get(key: string): Promise<unknown>;
};

function isAISummaryBackfillEligible(feed: {
  status: string;
  ai_summary: string;
  ai_summary_status: string;
}) {
  if (feed.status === "draft") {
    return false;
  }

  if (feed.ai_summary.trim().length > 0) {
    return false;
  }

  return feed.ai_summary_status !== "pending" && feed.ai_summary_status !== "processing";
}

function isAISummaryForceBackfillEligible(feed: {
  status: string;
  ai_summary_status: string;
}) {
  if (feed.status === "draft") {
    return false;
  }

  return feed.ai_summary_status !== "pending" && feed.ai_summary_status !== "processing";
}

export async function buildCompatTasksResponse(db: DB, serverConfig: ConfigReader, env: Env) {
  const aiConfig = await getAIConfig(serverConfig);
  const items = await db.query.contents.findMany({
    columns: {
      id: true,
      text: true,
      ai_summary: true,
      ai_summary_status: true,
      status: true,
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    aiSummary: {
      enabled: aiConfig.enabled,
      queueConfigured: Boolean(env.TASK_QUEUE),
      eligible: items.filter(isAISummaryBackfillEligible).length,
      forceEligible: items.filter(isAISummaryForceBackfillEligible).length,
    },
    blurhash: {
      eligible: items.filter((item) => contentHasImagesMissingMetadata(item.text)).length,
    },
  };
}

export async function runCompatAISummaryBackfill(
  db: DB,
  cache: CacheImpl,
  serverConfig: ConfigReader,
  env: Env,
  force = false,
) {
  const aiConfig = await getAIConfig(serverConfig);
  if (!aiConfig.enabled) {
    throw new Error("AI summary is not enabled");
  }
  if (!env.TASK_QUEUE) {
    throw new Error("TASK_QUEUE binding is not configured");
  }

  const items = await db.query.contents.findMany({
    columns: {
      id: true,
      slug: true,
      updatedAt: true,
      ai_summary: true,
      ai_summary_status: true,
      status: true,
    },
    orderBy: [desc(contents.updatedAt)],
  });

  let queued = 0;
  let skipped = 0;

  for (const item of items) {
    const eligible = force
      ? isAISummaryForceBackfillEligible(item)
      : isAISummaryBackfillEligible(item);

    if (!eligible) {
      skipped += 1;
      continue;
    }

    await syncFeedAISummaryQueueState(db, serverConfig, env, item.id, {
      draft: false,
      updatedAt: item.updatedAt,
      resetSummary: true,
    });
    await clearFeedCache(cache, item.id, item.slug, item.slug);
    queued += 1;
  }

  return {
    queued,
    skipped,
    forced: force,
  };
}

export async function listBlurhashCompatCandidates(db: DB) {
  const items = await db.query.contents.findMany({
    columns: {
      id: true,
      title: true,
      text: true,
    },
    orderBy: [desc(contents.updatedAt)],
  });

  return {
    generatedAt: new Date().toISOString(),
    items: items.filter((item) => contentHasImagesMissingMetadata(item.text)),
  };
}

export async function applyBlurhashCompatUpdate(db: DB, cache: CacheImpl, feedId: number, content: string) {
  const feed = await db.query.contents.findFirst({
    where: eq(contents.id, feedId),
    columns: {
      id: true,
      slug: true,
      text: true,
    },
  });

  if (!feed) {
    throw new Error("Feed not found");
  }

  if (feed.text === content) {
    return { updated: false };
  }

  await db.update(contents).set({ text: content }).where(eq(contents.id, feed.id));
  await clearFeedCache(cache, feed.id, feed.slug, feed.slug);

  return { updated: true };
}
