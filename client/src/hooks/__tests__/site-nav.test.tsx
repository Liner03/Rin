import "../../test/setup";
import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import { ClientConfigContext, ConfigWrapper, defaultClientConfig } from "../../state/config";

const list = jest.fn();
mock.module("../../app/runtime", () => ({ client: { page: { list } } }));
mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const { useSiteNavItems } = await import("../useSiteConfig");
const { cleanup, render, screen, waitFor } = await import("@testing-library/react");

function Navigation() {
  return <nav>{useSiteNavItems().map((item) => <a key={item.href} href={item.href}>{item.title}</a>)}</nav>;
}

afterEach(() => { cleanup(); list.mockReset(); });

describe("site navigation requests", () => {
  it("uses configured navigation without fetching unused page bodies", () => {
    list.mockResolvedValue({ data: [] });
    const config = new ConfigWrapper({ "site.nav": JSON.stringify([{ label: "About", href: "/page/about" }]) }, defaultClientConfig);
    render(<ClientConfigContext.Provider value={config}><Navigation /><Navigation /></ClientConfigContext.Provider>);
    expect(screen.getAllByRole("link", { name: "About" })).toHaveLength(2);
    expect(list).not.toHaveBeenCalled();
  });

  it("shares the default navigation request and excludes private pages", async () => {
    list.mockResolvedValue({ data: [
      { title: "Public", slug: "public", status: "publish" },
      { title: "Draft", slug: "draft", status: "draft" },
      { title: "Locked", slug: "locked", status: "publish", hasPassword: true },
    ] });
    render(<><Navigation /><Navigation /></>);
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Public" })).toHaveLength(2));
    expect(screen.queryByRole("link", { name: "Draft" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Locked" })).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });
});
