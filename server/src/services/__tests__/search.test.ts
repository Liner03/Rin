import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { contents } from "../../db/schema";
import { cleanupTestDB, createTestUser, setupTestApp, type TestCacheImpl } from "../../../tests/fixtures";
import { SearchService } from "../feed";

describe("SearchService", () => {
    let db: any;
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;
    let clientConfig: TestCacheImpl;

    beforeEach(async () => {
        const context = await setupTestApp(SearchService);
        db = context.db;
        sqlite = context.sqlite;
        env = context.env;
        app = context.app;
        clientConfig = context.clientConfig;
        await createTestUser(sqlite);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    it("paginates matching feeds in the database while preserving the response shape", async () => {
        await db.insert(contents).values([
            { title: "Needle 1", text: "one", uid: 1, status: "publish" },
            { title: "Needle 2", text: "two", uid: 1, status: "publish" },
            { title: "Needle 3", text: "three", uid: 1, status: "publish" },
        ]);

        const firstResponse = await app.request("/Needle?page=1&limit=2", {}, env);
        const firstPage = await firstResponse.json() as any;

        expect(firstResponse.status).toBe(200);
        expect(firstPage.size).toBe(3);
        expect(firstPage.data).toHaveLength(2);
        expect(firstPage.hasNext).toBe(true);

        const secondResponse = await app.request("/Needle?page=2&limit=2", {}, env);
        const secondPage = await secondResponse.json() as any;

        expect(secondResponse.status).toBe(200);
        expect(secondPage.size).toBe(3);
        expect(secondPage.data).toHaveLength(1);
        expect(secondPage.hasNext).toBe(false);
    });

    it("isolates administrator search cache entries from public results", async () => {
        await clientConfig.set("cache.enabled", true);
        await db.insert(contents).values([
            { title: "Shared result", text: "visible", uid: 1, status: "publish" },
            { title: "Shared draft", text: "private", uid: 1, status: "draft" },
        ]);

        const adminResponse = await app.request("/Shared", {
            headers: { Authorization: "Bearer mock_token_1" },
        }, env);
        const adminResult = await adminResponse.json() as any;
        expect(adminResult.size).toBe(2);

        const publicResponse = await app.request("/Shared", {}, env);
        const publicResult = await publicResponse.json() as any;

        expect(publicResponse.status).toBe(200);
        expect(publicResult.size).toBe(1);
        expect(publicResult.data).toHaveLength(1);
        expect(publicResult.data[0].title).toBe("Shared result");
    });

    it.each(["%", "_", "\\"])("treats %s as a literal search character", async (character) => {
        await db.insert(contents).values([
            { title: `Literal ${character} match`, text: "body", uid: 1 },
            { title: "Literal other match", text: "body", uid: 1 },
        ]);
        const response = await app.request(`/${encodeURIComponent(character)}`, {}, env);
        const result = await response.json() as any;
        expect(response.status).toBe(200);
        expect(result.size).toBe(1);
        expect(result.data[0].title).toBe(`Literal ${character} match`);
    });

    it("excludes protected, unpublished and future posts as well as independent pages", async () => {
        const base = { title: "Visibility", text: "body", uid: 1 };
        await db.insert(contents).values([
            { ...base, slug: "public" },
            { ...base, password: "hash" },
            { ...base, status: "draft" },
            { ...base, status: "hidden" },
            { ...base, status: "private" },
            { ...base, createdAt: new Date("2099-01-01") },
            { ...base, type: "page" },
        ]);
        const result = await (await app.request("/Visibility", {}, env)).json() as any;
        expect(result.size).toBe(1);
        expect(result.data[0].slug).toBe("public");
        expect(result.data[0]).not.toHaveProperty("password");
        const admin = await (await app.request("/Visibility", {
            headers: { Authorization: "Bearer mock_token_1" },
        }, env)).json() as any;
        expect(admin.size).toBe(6);
        expect(admin.data.every((row: any) => row.type === "post")).toBe(true);
    });

    it("counts and pages all matching posts beyond the former 200-row cap", async () => {
        for (let offset = 0; offset < 205; offset += 20) {
            await db.insert(contents).values(Array.from({ length: Math.min(20, 205 - offset) }, (_, index) => ({
                title: `Large result ${offset + index}`, text: "body", uid: 1,
            })));
        }
        const result = await (await app.request("/Large?page=11&limit=20", {}, env)).json() as any;
        expect(result.size).toBe(205);
        expect(result.data).toHaveLength(5);
        expect(result.hasNext).toBe(false);
    });
});
