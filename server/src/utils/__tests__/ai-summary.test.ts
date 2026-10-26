import { afterEach, describe, expect, it, mock } from "bun:test";
import type { AIConfig } from "@rin/api";
import { AI_CONFIG_PREFIX } from "@rin/config";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createAIConfigReader(config: AIConfig) {
  const values = new Map<string, unknown>(
    Object.entries(config).map(([key, value]) => [`${AI_CONFIG_PREFIX}${key}`, value]),
  );

  return {
    async get(key: string) {
      return values.get(key);
    },
  };
}

describe("generateAISummaryResult", () => {
  it("returns a concrete error when AI responds with empty content", async () => {
    const serverConfig = createAIConfigReader({
      enabled: true,
      provider: "worker-ai",
      model: "llama-3-8b",
      api_key: "",
      api_url: "",
    });

    const { generateAISummaryResult } = await import("../ai");

    const result = await generateAISummaryResult({
      AI: {
        run: async () => ({ response: "" }),
      },
    } as unknown as Env, serverConfig, "test content");

    expect(result.summary).toBeNull();
    expect(result.skipped).toBe(false);
    expect(result.error).toContain('Empty response from AI provider "worker-ai"');
  });

  it("sends summary system prompt to Workers AI", async () => {
    const serverConfig = createAIConfigReader({
      enabled: true,
      provider: "worker-ai",
      model: "llama-3-8b",
      api_key: "",
      api_url: "",
    });

    const calls: Array<any> = [];
    const { AI_SUMMARY_SYSTEM_PROMPT, generateAISummaryResult } = await import("../ai");

    const result = await generateAISummaryResult({
      AI: {
        run: async (_model: string, payload: any) => {
          calls.push(payload);
          return { response: "summary" };
        },
      },
    } as unknown as Env, serverConfig, "test content");

    expect(result.summary).toBe("summary");
    expect(calls).toHaveLength(1);
    expect(calls[0].messages[0]).toEqual({
      role: "system",
      content: AI_SUMMARY_SYSTEM_PROMPT,
    });
    expect(calls[0].messages[1]).toEqual({
      role: "user",
      content: "test content",
    });
  });

  it.each(["openai", "openai-compatible"])("sends summary system prompt and BYOK credentials to %s", async (provider) => {
    const serverConfig = createAIConfigReader({
      enabled: true,
      provider,
      model: "gpt-4o-mini",
      api_key: "secret",
      api_url: "https://models.example.com/v1",
    });

    const requests: Array<any> = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://models.example.com/v1/chat/completions");
      requests.push(init);
      return new Response(JSON.stringify({
        choices: [{ message: { content: "summary" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { AI_SUMMARY_SYSTEM_PROMPT, generateAISummaryResult } = await import("../ai");

    const result = await generateAISummaryResult({} as Env, serverConfig, "external content");

    expect(result.summary).toBe("summary");
    expect(requests).toHaveLength(1);
    expect(new Headers(requests[0].headers).get("Authorization")).toBe("Bearer secret");
    const body = JSON.parse(String(requests[0].body));
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0]).toEqual({
      role: "system",
      content: AI_SUMMARY_SYSTEM_PROMPT,
    });
    expect(body.messages[1]).toEqual({
      role: "user",
      content: "external content",
    });
  });
});
