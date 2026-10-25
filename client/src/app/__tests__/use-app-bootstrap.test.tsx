import "../../test/setup";
import { afterEach, beforeEach, describe, expect, it, jest, mock, spyOn } from "bun:test";
import { StrictMode } from "react";

const { act, cleanup, render, renderHook, screen } = await import("@testing-library/react");

const mockedRuntime = {
  client: { user: { profile: jest.fn(() => new Promise(() => {})) } },
};
mock.module("../runtime", () => mockedRuntime);

const { useAppBootstrap, CLIENT_CONFIG_TIMEOUT_MS } = await import("../use-app-bootstrap");
const routes = jest.fn(() => <div>Article content</div>);
mock.module("../routes", () => ({ AppRoutes: routes }));
mock.module("../../components/scroll-restoration", () => ({ ScrollRestoration: () => null }));
mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const { default: App } = await import("../../App");

describe("initial app configuration", () => {
  const globals = globalThis as typeof globalThis & { __RIN_CLIENT_CONFIG__?: Record<string, unknown> };
  const originalConfig = globals.__RIN_CLIENT_CONFIG__;
  let script: HTMLScriptElement;
  beforeEach(() => {
    sessionStorage.removeItem("config");
    delete globals.__RIN_CLIENT_CONFIG__;
    script = document.createElement("script");
    script.id = "rin-client-config";
    document.head.appendChild(script);
    routes.mockClear();
  });
  afterEach(() => {
    cleanup();
    globals.__RIN_CLIENT_CONFIG__ = originalConfig;
    sessionStorage.removeItem("config");
    script.remove();
    jest.restoreAllMocks();
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

  function finishConfig(config = { "header.layout": "mirages" }) {
    act(() => {
      globals.__RIN_CLIENT_CONFIG__ = config;
      script.dispatchEvent(new Event("load"));
    });
  }

  it("renders a loading state without mounting routes until the async config arrives", () => {
    render(<App />);
    expect(screen.getByRole("status").textContent).toBe("bootstrap.loading");
    expect(routes).not.toHaveBeenCalled();
    finishConfig();
    expect(screen.getByText("Article content")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("subscribes to delayed config under StrictMode and uses the real theme", () => {
    const { result } = renderHook(useAppBootstrap, { wrapper: StrictMode });
    expect(result.current.configStatus).toBe("loading");
    finishConfig();
    expect(result.current.configStatus).toBe("ready");
    expect(result.current.config.get<string>("header.layout")).toBe("mirages");
    expect(JSON.parse(sessionStorage.getItem("config")!)).toEqual(globals.__RIN_CLIENT_CONFIG__);
  });

  it("keeps cached pages available when the config request fails and preserves wrapper identity", () => {
    sessionStorage.setItem("config", JSON.stringify({ "header.layout": "mirages" }));
    const { result } = renderHook(useAppBootstrap);
    const initial = result.current.config;
    act(() => script.dispatchEvent(new Event("error")));
    expect(result.current.configStatus).toBe("ready");
    finishConfig();
    expect(result.current.config).toBe(initial);
  });

  it.each(["not json", "[]", "null", "42"])("ignores corrupt cache %s and waits for fresh config", cached => {
    sessionStorage.setItem("config", cached);
    const { result } = renderHook(useAppBootstrap);
    expect(result.current.configStatus).toBe("loading");
    finishConfig();
    expect(result.current.configStatus).toBe("ready");
  });

  it("still loads when session storage is disabled", () => {
    const storage = Object.getPrototypeOf(sessionStorage);
    spyOn(storage, "getItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    spyOn(storage, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    const { result } = renderHook(useAppBootstrap);
    finishConfig();
    expect(result.current.configStatus).toBe("ready");
    expect(result.current.config.get<string>("header.layout")).toBe("mirages");
  });

  it("shows retry when loading fails without mounting routes", () => {
    render(<App />);
    act(() => script.dispatchEvent(new Event("error")));
    expect(screen.getByRole("alert").textContent).toBe("bootstrap.failed");
    expect(screen.getByRole("button", { name: "error.retry" })).not.toBeNull();
    expect(routes).not.toHaveBeenCalled();
  });

  it("times out a stalled config and recovers if its response arrives later", () => {
    const timers = spyOn(globalThis, "setTimeout");
    render(<App />);
    const expire = timers.mock.calls.find(([, delay]) => delay === CLIENT_CONFIG_TIMEOUT_MS)?.[0];
    expect(expire).toBeDefined();
    act(() => expire!());
    expect(screen.getByRole("alert").textContent).toBe("bootstrap.failed");
    expect(routes).not.toHaveBeenCalled();
    finishConfig();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Article content")).not.toBeNull();
  });
});
