import type { AppContext } from "../core/hono-types";

// Cloudflare keeps these promises alive after the response. Local adapters
// without an ExecutionContext must finish them before the request ends.
export async function completeAfterResponse(c: AppContext, task: Promise<unknown>) {
    let context: AppContext["executionCtx"];
    try {
        context = c.executionCtx;
    } catch {
        await task;
        return;
    }
    context.waitUntil(task);
}
