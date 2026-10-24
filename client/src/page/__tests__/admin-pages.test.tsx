import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Page } from "@rin/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { client } from "../../app/runtime";
import { AdminPagesPage } from "../admin-pages";

const { showAlert } = vi.hoisted(() => ({ showAlert: vi.fn() }));

vi.mock("../../app/runtime", () => ({
  client: { page: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../components/dialog", () => ({ useAlert: () => ({ showAlert, AlertUI: () => null }) }));
vi.mock("../../components/markdown_editor", () => ({
  MarkdownEditor: ({ content, setContent }: { content: string; setContent: (value: string) => void }) => (
    <textarea aria-label="content" value={content} onChange={(event) => setContent(event.target.value)} />
  ),
}));
vi.mock("../../components/page-templates", () => ({ PAGE_TEMPLATES: { default: { id: "default", title: "Default" } } }));

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
    vi.clearAllMocks();
    vi.mocked(client.page.list).mockResolvedValue({ data: [page] });
    vi.mocked(client.page.update).mockResolvedValue({});
  });
  afterEach(cleanup);

  it("round-trips JSON fields as editable JSON rather than object labels", async () => {
    await editPage();
    const field = screen.getByRole("textbox", { name: "pages.field_value: gallery" });
    expect(field).toHaveValue(JSON.stringify(page.fields![0].value, null, 2));
    const incomplete = '[{"title":';
    fireEvent.change(field, { target: { value: incomplete } });
    expect(field).toHaveValue(incomplete);
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
    vi.mocked(client.page.list).mockResolvedValue({ data: [{ ...page, fields: [{ name: "score", type, value: 1 }] }] });
    await editPage();
    const field = screen.getByRole("textbox", { name: "pages.field_value: score" });
    for (const incomplete of ["-", ""]) {
      fireEvent.change(field, { target: { value: incomplete } });
      expect(field).toHaveValue(incomplete);
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
    vi.mocked(client.page.list).mockResolvedValue({ data: [
      page,
      { ...page, id: 8, title: "Child", parent: 7 },
      { ...page, id: 9, title: "Grandchild", parent: 8 },
      { ...page, id: 10, title: "Other", parent: 0 },
    ] });
    render(<AdminPagesPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "update.title" }))[0]);
    expect(screen.queryByRole("option", { name: "Portfolio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Child" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Grandchild" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();
  });

  it("keeps legacy cycles and orphans visible and lets an edit repair the parent", async () => {
    vi.mocked(client.page.list).mockResolvedValue({ data: [
      { ...page, parent: 8 },
      { ...page, id: 8, title: "Cycle", parent: 7 },
      { ...page, id: 9, title: "Orphan", parent: 999 },
    ] });
    render(<AdminPagesPage />);
    expect(await screen.findByText("Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Cycle")).toBeInTheDocument();
    expect(screen.getByText("Orphan")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "update.title" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.page.update).toHaveBeenCalledWith(7, expect.objectContaining({ parent: 0 })));
  });
});
