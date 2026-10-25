import { afterEach, describe, expect, it, jest } from "bun:test";
import { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { createMockEnv } from "../../../tests/fixtures";
import { BlobService } from "../storage";

const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
afterEach(() => {
    if (originalCaches) Object.defineProperty(globalThis, "caches", originalCaches);
    else Reflect.deleteProperty(globalThis, "caches");
});

function setup(cacheControl = "public, max-age=3600") {
    const get = jest.fn(async (key: string) => key.endsWith("missing") ? null : {
        body: new Blob(["image bytes"]).stream(), size: 11, httpEtag: '"image-v1"', uploaded: new Date(),
        writeHttpMetadata(headers: Headers) {
            headers.set("content-type", "image/webp");
            headers.set("cache-control", cacheControl);
        },
    });
    const env = createMockEnv({ R2_BUCKET: { get } as unknown as R2Bucket });
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use("*", async (c, next) => { c.set("env", env); await next(); });
    app.route("/blob", BlobService());
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); }, passThroughOnException() {}, props: {} };
    const request = (path = "image.webp") => app.request(`/blob/${path}`, {}, env, context);
    return { get, pending, request };
}

describe("public R2 edge cache", () => {
    it("streams a miss before cache persistence and serves subsequent reads without R2", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const entries = new Map<string, Response>();
        const put = jest.fn(async (key: Request, response: Response) => { await gate; entries.set(key.url, response); });
        Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => ({
            match: async (key: Request) => entries.get(key.url)?.clone(), put,
        }) } });
        const { get, pending, request } = setup();
        const first = await request();
        expect(await first.text()).toBe("image bytes");
        expect(first.headers.get("etag")).toBe('"image-v1"');
        expect(pending).toHaveLength(1);
        release();
        await Promise.all(pending);
        const second = await request();
        expect(second.headers.get("content-type")).toBe("image/webp");
        expect(await second.text()).toBe("image bytes");
        expect(get).toHaveBeenCalledTimes(1);
    });

    it.each(["private, max-age=60", "no-store"])("respects %s and does not cache missing objects", async (policy) => {
        const put = jest.fn();
        Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => ({ match: async () => undefined, put }) } });
        const { request } = setup(policy);
        expect((await request()).status).toBe(200);
        expect((await request("missing")).status).toBe(404);
        expect(put).not.toHaveBeenCalled();
    });

    it("still serves the object when cache writes fail", async () => {
        Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => ({
            match: async () => undefined, put: async () => { throw new Error("cache unavailable"); },
        }) } });
        const { request, pending } = setup();
        expect(await (await request()).text()).toBe("image bytes");
        await Promise.all(pending);
    });
});
