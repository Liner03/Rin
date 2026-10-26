import "../../test/setup";
import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import { ClientConfigContext, ConfigWrapper, defaultClientConfig } from "../../state/config";

const list = jest.fn();
const listeners = new Set<() => void>();
mock.module("../../app/runtime", () => ({ client: {
  page: { navigation: list, getCachedNavigation: () => undefined },
  subscribeContentChanges: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
} }));
mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const { useSiteNavItems } = await import("../useSiteConfig");
const { act, cleanup, render, screen, waitFor } = await import("@testing-library/react");

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

  it("shares the public navigation request", async () => {
    list.mockResolvedValue({ data: [
      { title: "Public", slug: "public", status: "publish" },
    ] });
    render(<><Navigation /><Navigation /></>);
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Public" })).toHaveLength(2));
    expect(screen.queryByRole("link", { name: "Draft" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Locked" })).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });
});


it("starts new navigation after a mutation even while an older request is pending", async () => {
  let resolveOld!: (value: unknown) => void;
  list.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  list.mockResolvedValue({ data: [{ title: "New page", slug: "new" }] });
  const config = new ConfigWrapper({}, defaultClientConfig);
  render(<ClientConfigContext.Provider value={config}><Navigation /><Navigation /></ClientConfigContext.Provider>);
  expect(list).toHaveBeenCalledTimes(1);
  act(() => listeners.forEach(listener => listener()));
  await screen.findAllByRole("link", { name: "New page" });
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => resolveOld({ data: [{ title: "Deleted page", slug: "deleted" }] }));
  expect(screen.queryByRole("link", { name: "Deleted page" })).toBeNull();
});
