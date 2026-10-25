import "../../test/setup";
import type { Page } from "@rin/api";
import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");

const showAlert = mock();

const mockedRuntime = {
  client: { page: { list: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() } },
};
mock.module("../../app/runtime", () => mockedRuntime);
const { client } = mockedRuntime;
mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module("../../components/dialog", () => ({ useAlert: () => ({ showAlert, AlertUI: () => null }) }));
mock.module("../../components/markdown_editor", () => ({
  MarkdownEditor: ({ content, setContent }: { content: string; setContent: (value: string) => void }) => (
    <textarea aria-label="content" value={content} onChange={(event) => setContent(event.target.value)} />
  ),
}));
mock.module("../../components/page-templates", () => ({ PAGE_TEMPLATES: { default: { id: "default", title: "Default" } } }));

const { AdminPagesPage } = await import("../admin-pages");

const page: Page = {
  id: 7, title: "Portfolio", content: "Body", slug: "portfolio", status: "publish",
  parent: 0, order: 0, template: "default", uid: 1, hasPassword: true,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  fields: [{ name: "gallery", type: "json", value: [{ title: "Project" }] }],
};

async function editPage() {
  render(<AdminPagesPage />);
  fireEvent.click(await screen.findByRole("button", { name: "update.title" }));
}

describe("page editor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    client.page.list.mockResolvedValue({ data: [page] });
    client.page.update.mockResolvedValue({});
  });
  afterEach(cleanup);

  it("round-trips JSON fields as editable JSON rather than object labels", async () => {
    await editPage();
    const field = screen.getByRole("textbox", { name: "pages.field_value: gallery" });
    expect((field as HTMLInputElement).value).toBe(JSON.stringify(page.fields![0].value, null, 2));
    const incomplete = '[{"title":';
    fireEvent.change(field, { target: { value: incomplete } });
    expect((field as HTMLInputElement).value).toBe(incomplete);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(client.page.update).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith("pages.invalid_field_value");

    fireEvent.change(field, { target: { value: '[{"title":"Edited"}]' } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.page.update).toHaveBeenCalledWith(7, expect.objectContaining({
      fields: [{ name: "gallery", type: "json", value: [{ title: "Edited" }] }],
    })));
  });

  it("preserves the existing password when the password field is left empty", async () => {
    await editPage();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.page.update).toHaveBeenCalledWith(7, expect.objectContaining({ password: undefined })));
  });

  it.each([
    ["int", "42", 42],
    ["float", "-1.25", -1.25],
  ] as const)("keeps incomplete %s input editable and validates it before saving", async (type, text, value) => {
    client.page.list.mockResolvedValue({ data: [{ ...page, fields: [{ name: "score", type, value: 1 }] }] });
    await editPage();
    const field = screen.getByRole("textbox", { name: "pages.field_value: score" });
    for (const incomplete of ["-", ""]) {
      fireEvent.change(field, { target: { value: incomplete } });
      expect((field as HTMLInputElement).value).toBe(incomplete);
      fireEvent.click(screen.getByRole("button", { name: "save" }));
      expect(client.page.update).not.toHaveBeenCalled();
    }
    fireEvent.change(field, { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.page.update).toHaveBeenCalledWith(7, expect.objectContaining({
      fields: [{ name: "score", type, value }],
    })));
  });

  it("explicitly clears the password when removal is selected", async () => {
    await editPage();
    fireEvent.click(screen.getByRole("checkbox", { name: "password_remove" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.page.update).toHaveBeenCalledWith(7, expect.objectContaining({ password: "" })));
  });

  it("sends a replacement password when one is entered", async () => {
    await editPage();
    fireEvent.change(screen.getByPlaceholderText("password"), { target: { value: "new password" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.page.update).toHaveBeenCalledWith(7, expect.objectContaining({ password: "new password" })));
  });

  it("excludes the edited page and all descendants from parent choices", async () => {
    client.page.list.mockResolvedValue({ data: [
      page,
      { ...page, id: 8, title: "Child", parent: 7 },
      { ...page, id: 9, title: "Grandchild", parent: 8 },
      { ...page, id: 10, title: "Other", parent: 0 },
    ] });
    render(<AdminPagesPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "update.title" }))[0]);
    expect(screen.queryByRole("option", { name: "Portfolio" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Child" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Grandchild" })).toBeNull();
    expect(screen.getByRole("option", { name: "Other" })).not.toBeNull();
  });

  it("keeps legacy cycles and orphans visible and lets an edit repair the parent", async () => {
    client.page.list.mockResolvedValue({ data: [
      { ...page, parent: 8 },
      { ...page, id: 8, title: "Cycle", parent: 7 },
      { ...page, id: 9, title: "Orphan", parent: 999 },
    ] });
    render(<AdminPagesPage />);
    expect(await screen.findByText("Portfolio")).not.toBeNull();
    expect(screen.getByText("Cycle")).not.toBeNull();
    expect(screen.getByText("Orphan")).not.toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "update.title" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.page.update).toHaveBeenCalledWith(7, expect.objectContaining({ parent: 0 })));
  });
});
