import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../client";

const originalFetch = globalThis.fetch;
const api = createClient("https://blog.example");

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function withinDeadline(request: Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      request,
      new Promise<"still loading">((resolve) => {
        timer = setTimeout(() => resolve("still loading"), 150);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

describe("article request deadlines", () => {
  it("leaves a completed response intact after its deadline", async () => {
    let signal: AbortSignal | null | undefined;
    const article = { id: 144, content: "Complete article" };
    globalThis.fetch = mock(async (_input, init) => {
      signal = init?.signal;
      return Response.json(article);
    }) as typeof fetch;

    const result = await api.feed.get(144, { timeoutMs: 20 });
    expect(result.data?.content).toBe(article.content);
    expect(result.error).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(signal?.aborted).toBe(false);
  });

  it("stops waiting when the connection never returns headers", async () => {
    let rejectRequest: (reason?: unknown) => void = () => {};
    globalThis.fetch = mock((_input, init) => new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })) as typeof fetch;

    try {
      expect(await withinDeadline(api.feed.get(144, { timeoutMs: 20 })))
        .toEqual({ error: { status: 408, value: "Request timed out" } });
    } finally {
      rejectRequest(new Error("test cleanup"));
    }
  });

  it.each([["article", 200], ["article", 503], ["list", 200]] as const)("stops waiting when the %s HTTP %s response body stalls midway", async (resource, status) => {
    let finishBody: () => void = () => {};
    globalThis.fetch = mock(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"content":"partial article'));
        const abort = () => controller.error(init?.signal?.reason);
        init?.signal?.addEventListener("abort", abort, { once: true });
        finishBody = () => {
          init?.signal?.removeEventListener("abort", abort);
          if (!init?.signal?.aborted) controller.close();
        };
      },
    }), { status, headers: { "content-type": "application/json" } })) as typeof fetch;

    try {
      const request = resource === "article"
        ? api.feed.get(144, { timeoutMs: 20 })
        : api.feed.list(undefined, { timeoutMs: 20 });
      expect(await withinDeadline(request))
        .toEqual({ error: { status: 408, value: "Request timed out" } });
    } finally {
      finishBody();
    }
  });
});
