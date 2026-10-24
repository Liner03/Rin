import { eq } from "drizzle-orm";
import { contents } from "../db/schema";
import type { CacheImpl, DB } from "../core/hono-types";
import { createTaskQueue, createFeedAISummaryTask, type FeedAISummaryStatus } from "../queue";
import { generateAISummaryResult } from "../utils/ai";
import { getAIConfig } from "../utils/db-config";

type ConfigReader = {
  get(key: string): Promise<unknown>;
};

function buildStatusUpdate(
  status: FeedAISummaryStatus,
  overrides?: Partial<{
    ai_summary: string;
    ai_summary_status: FeedAISummaryStatus;
    ai_summary_error: string;
  }>,
) {
  return {
    ai_summary_status: status,
    ai_summary_error: "",
    ...overrides,
  };
}

export async function enqueueFeedAISummary(
  env: Env,
  feedId: number,
  updatedAt: Date,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createTaskQueue(env).send(
      createFeedAISummaryTask({
        feedId,
        expectedUpdatedAtUnix: normalizeQueueUpdatedAt(updatedAt),
      }),
    );

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function normalizeQueueUpdatedAt(updatedAt: Date) {
  return Math.floor(updatedAt.getTime() / 1000);
}

export function matchesExpectedUpdatedAt(
  updatedAt: Date,
  payload: {
    expectedUpdatedAt?: string;
    expectedUpdatedAtUnix?: number;
  },
) {
  const actual = normalizeQueueUpdatedAt(updatedAt);

  if (typeof payload.expectedUpdatedAtUnix === "number") {
    return actual === payload.expectedUpdatedAtUnix;
  }

  if (typeof payload.expectedUpdatedAt === "string") {
    const expected = Date.parse(payload.expectedUpdatedAt);
    if (Number.isFinite(expected)) {
      return actual === Math.floor(expected / 1000);
    }
  }

  return false;
}

export async function syncFeedAISummaryQueueState(
  db: DB,
  serverConfig: ConfigReader,
  env: Env,
  feedId: number,
  options: {
    draft: boolean;
    updatedAt: Date;
    resetSummary?: boolean;
  },
) {
  const aiConfig = await getAIConfig(serverConfig);
  const shouldQueue = aiConfig.enabled && !options.draft;

  if (!shouldQueue) {
    await db
      .update(contents)
      .set(
        buildStatusUpdate("idle", options.resetSummary ? { ai_summary: "" } : undefined),
      )
      .where(eq(contents.id, feedId));
    return;
  }

  await db
    .update(contents)
    .set(
      buildStatusUpdate("pending", {
        ai_summary: options.resetSummary ? "" : undefined,
      }),
    )
    .where(eq(contents.id, feedId));

  const enqueueResult = await enqueueFeedAISummary(env, feedId, options.updatedAt);
  if (!enqueueResult.ok) {
    await db
      .update(contents)
      .set(
        buildStatusUpdate("failed", {
          ai_summary_error: enqueueResult.error,
        }),
      )
      .where(eq(contents.id, feedId));
  }
}

export async function processFeedAISummaryTask(
  env: Env,
  db: DB,
  cache: CacheImpl,
  serverConfig: ConfigReader,
  payload: {
    feedId: number;
    expectedUpdatedAt?: string;
    expectedUpdatedAtUnix?: number;
  },
  clearFeedCache: (cache: CacheImpl, id: number, alias: string | null, newAlias: string | null) => Promise<void>,
) {
  const feed = await db.query.contents.findFirst({
    where: eq(contents.id, payload.feedId),
  });

  if (!feed) {
    return;
  }

  if (!matchesExpectedUpdatedAt(feed.updatedAt, payload)) {
    return;
  }

  const aiConfig = await getAIConfig(serverConfig);
  if (!aiConfig.enabled || feed.status === "draft") {
    await db
      .update(contents)
      .set(buildStatusUpdate("idle"))
      .where(eq(contents.id, feed.id));
    await clearFeedCache(cache, feed.id, feed.slug, feed.slug);
    return;
  }

  await db
    .update(contents)
    .set(buildStatusUpdate("processing"))
    .where(eq(contents.id, feed.id));

  const result = await generateAISummaryResult(env, serverConfig, feed.text);
  if (result.summary) {
    await db
      .update(contents)
      .set(
        buildStatusUpdate("completed", {
          ai_summary: result.summary,
        }),
      )
      .where(eq(contents.id, feed.id));
  } else if (result.skipped) {
    await db
      .update(contents)
      .set(buildStatusUpdate("idle"))
      .where(eq(contents.id, feed.id));
  } else {
    await db
      .update(contents)
      .set(
        buildStatusUpdate("failed", {
          ai_summary_error: result.error ?? "Unknown AI summary generation error",
        }),
      )
      .where(eq(contents.id, feed.id));
  }

  await clearFeedCache(cache, feed.id, feed.slug, feed.slug);
}
