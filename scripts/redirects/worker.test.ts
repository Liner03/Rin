import { describe, expect, it } from "bun:test";
import worker from "./worker";

describe("blog domain redirects", () => {
  for (const host of ["lin03.cn", "www.lin03.cn"]) {
    for (const protocol of ["http", "https"]) {
      it(`redirects ${protocol}://${host} to the canonical HTTPS blog`, () => {
        const response = worker.fetch(new Request(`${protocol}://${host}/`));
        expect(response.status).toBe(308);
        expect(response.headers.get("location")).toBe("https://blog.lin03.cn/");
      });
    }
  }

  it.each(["GET", "HEAD", "POST"])("preserves encoded paths and queries for %s requests", method => {
    const response = worker.fetch(new Request("https://www.lin03.cn:8443/archives/a%2Fb.html?x=a%20b&x=2", { method }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://blog.lin03.cn/archives/a%2Fb.html?x=a%20b&x=2");
  });

  it.each(["blog.lin03.cn", "lin03.cn.example.com"])("does not redirect other hosts such as %s", host => {
    const response = worker.fetch(new Request(`https://${host}/`));
    expect(response.status).toBe(404);
    expect(response.headers.has("location")).toBe(false);
  });
});
