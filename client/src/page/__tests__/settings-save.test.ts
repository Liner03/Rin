import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ApiResponse } from "@rin/api";
import type { SettingsDraft } from "../settings-helpers";

const updateAll = mock(async (_draft: unknown): Promise<ApiResponse<SettingsDraft>> => ({ data: { clientConfig: { "site.name": "Updated" }, serverConfig: {} } }));
const getAll = mock(async (): Promise<ApiResponse<SettingsDraft>> => ({ error: { status: 503, value: "Unavailable" } }));
mock.module("../../app/runtime", () => ({ client: { config: { updateAll, getAll } }, endpoint: "" }));
const { saveSettingsConfigState, loadSettingsConfigState, mergeSavedSettingsDraft } = await import("../settings-helpers");
afterEach(() => { updateAll.mockClear(); getAll.mockClear(); });

describe("settings saves", () => {
  it("submits only changed settings, including intentionally cleared values", async () => {
    const initial = { clientConfig: { "site.name": "Old", "site.avatar": "avatar.png" }, serverConfig: { "ai_summary.api_key": "" } };
    const draft = { clientConfig: { "site.name": "Updated", "site.avatar": "" }, serverConfig: { "ai_summary.api_key": "" } };
    await saveSettingsConfigState(draft, initial);
    expect(updateAll).toHaveBeenCalledWith({ clientConfig: { "site.name": "Updated", "site.avatar": "" }, serverConfig: {} });
  });

  it("reports failed saves instead of replacing the draft with an empty successful response", async () => {
    updateAll.mockResolvedValueOnce({ error: { status: 503, value: "Database unavailable" } });
    await expect(saveSettingsConfigState({ clientConfig: {}, serverConfig: {} })).rejects.toThrow("Database unavailable");
  });

  it("rejects an empty save response", async () => {
    updateAll.mockResolvedValueOnce({});
    await expect(saveSettingsConfigState({ clientConfig: {}, serverConfig: {} })).rejects.toThrow("Empty settings response");
  });

  it("reports a failed settings load", async () => {
    await expect(loadSettingsConfigState()).rejects.toThrow("Unavailable");
  });

  it("preserves edits made during a save while accepting normalized saved fields", () => {
    const submitted = { clientConfig: { "site.name": "Submitted" }, serverConfig: { "ai_summary.enabled": true } };
    const current = { clientConfig: { "site.name": "New typing" }, serverConfig: { "ai_summary.enabled": true } };
    const saved = { clientConfig: { "site.name": "Submitted", "site.page_size": 5 }, serverConfig: { "ai_summary.enabled": "true" } };
    expect(mergeSavedSettingsDraft(current, submitted, saved)).toEqual({
      clientConfig: { "site.name": "New typing", "site.page_size": 5 }, serverConfig: { "ai_summary.enabled": "true" },
    });
  });
});
