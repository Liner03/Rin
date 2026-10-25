import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { ConfigService } from "../config";
import { cleanupTestDB, createTestUser, setupTestApp } from "../../../tests/fixtures";

describe("public bootstrap cache", () => {
    let context: Awaited<ReturnType<typeof setupTestApp>>;
    let now: number;
    const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");

    beforeEach(async () => {
        context = await setupTestApp(ConfigService);
        await createTestUser(context.sqlite);
        now = 0;
        const entries = new Map<string, { response: Response; expires: number }>();
        Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => ({
            async match(key: Request) {
                const entry = entries.get(key.url);
                return entry && entry.expires > now ? entry.response.clone() : undefined;
            },
            async put(key: Request, response: Response) {
                expect(response.headers.get("cache-control")).toBe("public, max-age=30");
                entries.set(key.url, { response, expires: now + 30_000 });
            },
            async delete(key: Request) { return entries.delete(key.url); },
        }) } });
    });
    afterEach(() => {
        if (originalCaches) Object.defineProperty(globalThis, "caches", originalCaches);
        else Reflect.deleteProperty(globalThis, "caches");
        cleanupTestDB(context.sqlite);
    });

    const bootstrap = () => context.app.request("/client/bootstrap.js", {}, context.env);

    it("avoids repeated database reads, preserves revalidation and expires within 30 seconds", async () => {
        await context.clientConfig.set("site.name", "Original");
        const all = spyOn(context.clientConfig, "all");
        try {
            await bootstrap();
            await context.clientConfig.set("site.name", "Changed elsewhere");
            const hit = await bootstrap();
            expect(hit.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
            expect(await hit.text()).toContain('"site.name":"Original"');
            expect(all).toHaveBeenCalledTimes(1);
            now += 30_001;
            expect(await (await bootstrap()).text()).toContain('"site.name":"Changed elsewhere"');
            expect(all).toHaveBeenCalledTimes(2);
        } finally { all.mockRestore(); }
    });

    it.each(["/", "/client"])("invalidates bootstrap after saving settings via %s", async (path) => {
        await bootstrap();
        const update = { "site.name": "Updated", "site.hero_image": "</script><img src=x>" };
        const response = await context.app.request(path, {
            method: "POST",
            headers: { Authorization: "Bearer mock_token_1", "content-type": "application/json" },
            body: JSON.stringify(path === "/" ? { clientConfig: update } : update),
        }, context.env);
        expect(response.status).toBe(200);
        const script = await (await bootstrap()).text();
        expect(script).toContain('"site.name":"Updated"');
        expect(script).not.toContain("</script>");
    });

    it("invalidates the public AI flag without exposing server secrets", async () => {
        await bootstrap();
        await context.app.request("/server", {
            method: "POST",
            headers: { Authorization: "Bearer mock_token_1", "content-type": "application/json" },
            body: JSON.stringify({ "ai_summary.enabled": true, "ai_summary.api_key": "private-test-key" }),
        }, context.env);
        const script = await (await bootstrap()).text();
        expect(script).toContain('"ai_summary.enabled":true');
        expect(script).not.toContain("private-test-key");
    });
});
