import { afterEach, describe, expect, it, mock } from "bun:test";

const getAppFetch = mock();

mock.module("../app-instance", () => ({
  getApp: () => ({
    fetch: getAppFetch,
  }),
}));

describe("handleFetch", () => {
  afterEach(() => {
    getAppFetch.mockReset();
  });

  it.each([
    ["/archives/86/?from=old#comments", "/feed/86?from=old#comments"],
    ["/about.html", "/page/about"],
    ["/archives.html", "/page/archives"],
    ["/tag/Java/", "/hashtag/Java"],
    ["/category/study/", "/category/study"],
    ["/usr/uploads/2025/06/image.png", "/api/blob/typecho/usr/uploads/2025/06/image.png"],
  ])("redirects old Typecho URL %s before serving the SPA", async (source, destination) => {
    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("spa"));
    const response = await handleFetch(new Request(`https://blog.example${source}`), {
      ASSETS: { fetch: assetFetch },
    } as unknown as Env);
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`https://blog.example${destination}`);
    expect(assetFetch).not.toHaveBeenCalled();
    expect(getAppFetch).not.toHaveBeenCalled();
  });

  it("continues serving index.html as an asset", async () => {
    const { handleFetch } = await import("../fetch-handler");
    const response = await handleFetch(new Request("https://blog.example/index.html"), {
      ASSETS: { fetch: async () => new Response("index") },
    } as unknown as Env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("index");
  });

  it("serves static assets directly when the asset exists", async () => {
    getAppFetch.mockResolvedValue(new Response("app-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body", { status: 200 }));

    const response = await handleFetch(
      new Request("http://localhost/assets/app.js"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
    );

    expect(await response.text()).toBe("asset-body");
    expect(assetFetch).toHaveBeenCalledTimes(1);
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("routes /api/blob requests to the app before static assets", async () => {
    getAppFetch.mockResolvedValue(new Response("blob-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body", { status: 404 }));

    const executionContext = {} as ExecutionContext;
    const response = await handleFetch(
      new Request("http://localhost/api/blob/images/test.txt"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
      executionContext,
    );

    expect(await response.text()).toBe("blob-body");
    expect(getAppFetch).toHaveBeenCalledTimes(1);
    expect(assetFetch).toHaveBeenCalledTimes(0);
    expect(new URL(getAppFetch.mock.calls[0][0].url).pathname).toBe("/blob/images/test.txt");
    expect(getAppFetch.mock.calls[0][2]).toBe(executionContext);
  });
});
