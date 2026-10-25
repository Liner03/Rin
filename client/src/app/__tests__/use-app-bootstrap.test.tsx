import "../../test/setup";
import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";

const { cleanup, renderHook } = await import("@testing-library/react");

const mockedRuntime = {
  client: { user: { profile: jest.fn().mockResolvedValue({}) } },
};
mock.module("../runtime", () => mockedRuntime);

const { useAppBootstrap } = await import("../use-app-bootstrap");

describe("initial app configuration", () => {
  const globals = globalThis as typeof globalThis & { __RIN_CLIENT_CONFIG__?: Record<string, unknown> };
  const originalConfig = globals.__RIN_CLIENT_CONFIG__;
  beforeEach(() => sessionStorage.removeItem("config"));
  afterEach(() => {
    cleanup();
    globals.__RIN_CLIENT_CONFIG__ = originalConfig;
    sessionStorage.removeItem("config");
  });

  it.each(["bootstrap", "session cache"])("uses the %s theme on the first render to avoid remounting content", (source) => {
    const config = { "header.layout": "mirages" };
    if (source === "bootstrap") globals.__RIN_CLIENT_CONFIG__ = config;
    else sessionStorage.setItem("config", JSON.stringify(config));

    const layouts: unknown[] = [];
    renderHook(() => {
      const app = useAppBootstrap();
      layouts.push(app.config.get("header.layout"));
      return app;
    });
    expect(layouts[0]).toBe("mirages");
    expect(new Set(layouts)).toEqual(new Set(["mirages"]));
  });
});
