import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppBootstrap } from "../use-app-bootstrap";

vi.mock("../runtime", () => ({
  client: { user: { profile: vi.fn().mockResolvedValue({}) } },
}));

describe("initial app configuration", () => {
  beforeEach(() => sessionStorage.removeItem("config"));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.removeItem("config");
  });

  it.each(["bootstrap", "session cache"])("uses the %s theme on the first render to avoid remounting content", (source) => {
    const config = { "header.layout": "mirages" };
    if (source === "bootstrap") vi.stubGlobal("__RIN_CLIENT_CONFIG__", config);
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
