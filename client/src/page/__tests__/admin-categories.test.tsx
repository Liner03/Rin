import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Category } from "@rin/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { client } from "../../app/runtime";
import { AdminCategoriesPage } from "../admin-categories";

vi.mock("../../app/runtime", () => ({
  client: { category: { list: vi.fn(), update: vi.fn() } },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../components/dialog", () => ({ useAlert: () => ({ showAlert: vi.fn(), AlertUI: () => null }) }));

const category: Category = {
  id: 1, name: "Parent", slug: "parent", description: "", count: 0, order: 0, parent: 0,
  listed: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

describe("category editor hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.category.update).mockResolvedValue({});
  });
  afterEach(cleanup);

  it("excludes descendants from parent choices", async () => {
    vi.mocked(client.category.list).mockResolvedValue({ data: [
      category,
      { ...category, id: 2, name: "Child", parent: 1 },
      { ...category, id: 3, name: "Grandchild", parent: 2 },
      { ...category, id: 4, name: "Other" },
    ] });
    render(<AdminCategoriesPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "update.title" }))[0]);
    expect(screen.queryByRole("option", { name: "Parent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Child" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Grandchild" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();
  });

  it("shows categories in a legacy cycle and allows repairing their parent", async () => {
    vi.mocked(client.category.list).mockResolvedValue({ data: [
      { ...category, parent: 2 },
      { ...category, id: 2, name: "Cycle", parent: 1 },
    ] });
    render(<AdminCategoriesPage />);
    expect(await screen.findByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("Cycle")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "update.title" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.category.update).toHaveBeenCalledWith(1, expect.objectContaining({ parent: 0 })));
  });
});
