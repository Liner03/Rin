import "../../test/setup";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { useState } from "react";
import type { AISettingsValue } from "../settings-ai";

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");

const testAI = mock(async (_body: Record<string, string>) => ({
  data: { success: true, response: "Hello from a custom model" },
}));
mock.module("../../app/runtime", () => ({ client: { config: { testAI } }, endpoint: "" }));
mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module("../../components/dialog", () => ({
  useAlert: () => ({ AlertUI: () => null }),
  useConfirm: () => ({ ConfirmUI: () => null }),
}));

const { AISummarySettings } = await import("../settings-ai");

function SettingsHarness() {
  const [value, setValue] = useState<AISettingsValue>({
    enabled: true,
    provider: "worker-ai",
    model: "llama-3-8b",
    apiKey: "",
    apiKeySet: false,
    apiUrl: "",
  });

  return <AISummarySettings value={value} onChange={(updates) => setValue((current) => ({ ...current, ...updates }))} />;
}

afterEach(() => {
  cleanup();
  testAI.mockClear();
});

describe("OpenAI-compatible AI settings", () => {
  it("keeps an unconfigured custom target explicit instead of reusing a saved provider target", async () => {
    render(<SettingsHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Cloudflare Worker AI (Free)" }));
    fireEvent.click(screen.getByRole("button", { name: /settings.ai_summary.provider.openai_compatible/ }));
    fireEvent.click(screen.getByRole("button", { name: "settings.ai_summary.test.button" }));

    await waitFor(() => expect(testAI).toHaveBeenCalledWith({
      provider: "openai-compatible",
      model: "",
      api_url: "",
    }));
  });

  it("lets an administrator select a custom provider and test their own endpoint, key and model", async () => {
    render(<SettingsHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Cloudflare Worker AI (Free)" }));
    fireEvent.click(screen.getByRole("button", { name: /settings.ai_summary.provider.openai_compatible/ }));

    const modelInput = screen.getByRole("textbox", { name: "settings.ai_summary.model.title" });
    const urlInput = screen.getByRole("textbox", { name: "settings.ai_summary.api_url.title" });
    expect((modelInput as HTMLInputElement).value).toBe("");
    expect((urlInput as HTMLInputElement).value).toBe("");

    fireEvent.change(modelInput, { target: { value: "my-org/custom-model" } });
    fireEvent.change(urlInput, { target: { value: "https://models.example.com/v1" } });
    fireEvent.change(screen.getByLabelText("settings.ai_summary.api_key.title"), { target: { value: "test-byok-key" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.ai_summary.test.button" }));

    await waitFor(() => expect(testAI).toHaveBeenCalledWith({
      provider: "openai-compatible",
      model: "my-org/custom-model",
      api_url: "https://models.example.com/v1",
      api_key: "test-byok-key",
    }));
    expect(await screen.findByText("Hello from a custom model")).not.toBeNull();
  });

  it("restores a custom model and reuses a stored key without sending the masked value", async () => {
    render(<AISummarySettings value={{
      enabled: true,
      provider: "openai-compatible",
      model: "my-org/custom-model",
      apiUrl: "https://models.example.com/v1",
      apiKey: "",
      apiKeySet: true,
    }} onChange={() => undefined} />);

    expect((screen.getByRole("textbox", { name: "settings.ai_summary.model.title" }) as HTMLInputElement).value).toBe("my-org/custom-model");
    expect((screen.getByLabelText("settings.ai_summary.api_key.title") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "settings.ai_summary.test.button" }));

    await waitFor(() => expect(testAI).toHaveBeenCalledWith({
      provider: "openai-compatible",
      model: "my-org/custom-model",
      api_url: "https://models.example.com/v1",
    }));
  });
});
