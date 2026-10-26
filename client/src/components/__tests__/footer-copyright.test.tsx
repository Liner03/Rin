import "../../test/setup";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { ConfigWrapper } from "@rin/config";
import { ClientConfigContext, defaultClientConfig } from "../../state/config";
import Footer from "../footer";
import { formatCopyright } from "../copyright";

mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
window.matchMedia = () => ({ matches: false }) as MediaQueryList;
afterEach(cleanup);

function renderCopyright(value: string) {
  return render(<ClientConfigContext.Provider value={new ConfigWrapper({ "site.copyright": value }, defaultClientConfig)}><Footer /></ClientConfigContext.Provider>);
}

describe("footer copyright", () => {
  it("changes the year without changing stored copyright text", () => {
    const value = "&copy; 2020–{year} Lin";
    expect(formatCopyright(value, 2026)).toBe("© 2020–2026 Lin");
    expect(formatCopyright(value, 2027)).toBe("© 2020–2027 Lin");
  });
  it("renders entities, author links and the current year", () => {
    const { container, getByRole } = renderCopyright("&copyright; {year} <a href='https://github.com/Liner03/Rin' target='_blank'>Lin</a>");
    expect(container.textContent).toContain(`© ${new Date().getFullYear()} Lin`);
    const link = getByRole("link", { name: "Lin" });
    expect(link.getAttribute("href")).toBe("https://github.com/Liner03/Rin");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("keeps plain text and standard HTML entities", () => {
    const { container } = renderCopyright("&copy; 2020–{{year}} Lin &amp; friends");
    expect(container.textContent).toContain(`© 2020–${new Date().getFullYear()} Lin & friends`);
  });

  it("removes scripts, event handlers and unsafe link protocols", () => {
    const { container } = renderCopyright('<a href="javascript:alert(1)" onclick="alert(1)">Lin</a><script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(container.querySelector("script, img, [onclick], [onerror], a[href^=javascript]")).toBeNull();
    expect(container.textContent).toContain("Lin");
    expect(container.textContent).not.toContain("alert(1)");
  });
});
