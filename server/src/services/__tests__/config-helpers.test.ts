import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { buildClientConfigResponse, buildServerConfigResponse, resolveWebhookConfig, persistConfigUpdates } from "../config-helpers";
import { cleanupTestDB, createMockDB, createMockEnv } from "../../../tests/fixtures";

it("loads independent bootstrap settings without serial database waits", async () => {
    let release!: (value: Map<string, unknown>) => void;
    const pending = new Promise<Map<string, unknown>>((resolve) => { release = resolve; });
    let aiRequested = false;
    const response = buildClientConfigResponse({
        all: () => pending,
        async set() {},
        async save() {},
    }, {
        async get() { aiRequested = true; return true; },
    }, createMockEnv());
    try {
        expect(aiRequested).toBe(true);
    } finally {
        release(new Map([["site.name", "Test blog"]]));
    }
    expect(await response).toMatchObject({ "site.name": "Test blog", "ai_summary.enabled": true });
});

describe("buildServerConfigResponse", () => {
    let sqlite: Database;

    beforeEach(async () => {
        const mockDB = createMockDB();
        sqlite = mockDB.sqlite;
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    it("stringifies object-based webhook template values", async () => {
        const response = await buildServerConfigResponse({
            async all() {
                return new Map<string, unknown>([
                    ["webhook.headers", { "X-Event": "{{event}}" }],
                    ["webhook.body_template", { content: "{{message}}" }],
                ]);
            },
            async set() {},
            async save() {},
        });

        expect(response["webhook.headers"]).toBe('{"X-Event":"{{event}}"}');
        expect(response["webhook.body_template"]).toBe('{"content":"{{message}}"}');
    });

    it("uses WEBHOOK_URL env as fallback when webhook_url is not stored", async () => {
        const response = await buildServerConfigResponse({
            async all() {
                return new Map<string, unknown>();
            },
            async set() {},
            async save() {},
        }, {
            WEBHOOK_URL: "https://env.example.com/webhook",
        });

        expect(response["webhook_url"]).toBe("https://env.example.com/webhook");
        expect(response["WEBHOOK_URL"]).toBe("https://env.example.com/webhook");
    });

    it("prefers stored webhook_url over WEBHOOK_URL env fallback", async () => {
        const response = await buildServerConfigResponse({
            async all() {
                return new Map<string, unknown>([
                    ["webhook_url", "https://stored.example.com/webhook"],
                ]);
            },
            async set() {},
            async save() {},
        }, {
            WEBHOOK_URL: "https://env.example.com/webhook",
        });

        expect(response["webhook_url"]).toBe("https://stored.example.com/webhook");
    });
});

describe("resolveWebhookConfig", () => {
    it("prefers stored webhook_url over the legacy key and env fallback", async () => {
        const config = await resolveWebhookConfig({
            async get(key: string) {
                if (key === "webhook_url") {
                    return "https://stored.example.com/webhook";
                }
                if (key === "WEBHOOK_URL") {
                    return "https://legacy.example.com/webhook";
                }
                return undefined;
            },
        }, {
            WEBHOOK_URL: "https://env.example.com/webhook",
        });

        expect(config.webhookUrl).toBe("https://stored.example.com/webhook");
    });

    it("uses body overrides before stored config values", async () => {
        const config = await resolveWebhookConfig({
            async get(key: string) {
                if (key === "webhook_url") {
                    return "https://stored.example.com/webhook";
                }
                if (key === "webhook.method") {
                    return "POST";
                }
                return undefined;
            },
        }, {
            WEBHOOK_URL: "https://env.example.com/webhook",
        }, {
            webhook_url: "https://override.example.com/webhook",
            "webhook.method": "GET",
        });

        expect(config.webhookUrl).toBe("https://override.example.com/webhook");
        expect(config.webhookMethod).toBe("GET");
    });
});


describe("config update persistence", () => {
    it("flushes ordinary and AI settings together while keeping a stored API key", async () => {
        const values = new Map<string, unknown>([["ai_summary.api_key", "stored-secret"]]);
        let saves = 0;
        const config = {
            async all() { return values; },
            async set(key: string, value: unknown) { values.set(key, value); },
            async save() { saves++; },
        };
        await persistConfigUpdates(config, { friend_ua: "New user agent" }, { enabled: true, model: "custom", api_key: "" });
        expect(saves).toBe(1);
        expect(values.get("friend_ua")).toBe("New user agent");
        expect(values.get("ai_summary.enabled")).toBe(true);
        expect(values.get("ai_summary.model")).toBe("custom");
        expect(values.get("ai_summary.api_key")).toBe("stored-secret");
    });

    it("does not save untouched configuration groups", async () => {
        let saves = 0;
        await persistConfigUpdates({ async all() { return new Map(); }, async set() {}, async save() { saves++; } }, {});
        expect(saves).toBe(0);
    });
});
