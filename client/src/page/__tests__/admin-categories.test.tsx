import "../../test/setup";
import type { Category } from "@rin/api";
import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");

const mockedRuntime = {
  client: { category: { list: jest.fn(), update: jest.fn() } },
};
mock.module("../../app/runtime", () => mockedRuntime);
const { client } = mockedRuntime;
mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module("../../components/dialog", () => ({ useAlert: () => ({ showAlert: jest.fn(), AlertUI: () => null }) }));

const { AdminCategoriesPage } = await import("../admin-categories");

const category: Category = {
  id: 1, name: "Parent", slug: "parent", description: "", count: 0, order: 0, parent: 0,
  listed: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

describe("category editor hierarchy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    client.category.update.mockResolvedValue({});
  });
  afterEach(cleanup);

  it("excludes descendants from parent choices", async () => {
    client.category.list.mockResolvedValue({ data: [
      category,
      { ...category, id: 2, name: "Child", parent: 1 },
      { ...category, id: 3, name: "Grandchild", parent: 2 },
      { ...category, id: 4, name: "Other" },
    ] });
    render(<AdminCategoriesPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "update.title" }))[0]);
    expect(screen.queryByRole("option", { name: "Parent" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Child" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Grandchild" })).toBeNull();
    expect(screen.getByRole("option", { name: "Other" })).not.toBeNull();
  });

  it("shows categories in a legacy cycle and allows repairing their parent", async () => {
    client.category.list.mockResolvedValue({ data: [
      { ...category, parent: 2 },
      { ...category, id: 2, name: "Cycle", parent: 1 },
    ] });
    render(<AdminCategoriesPage />);
    expect(await screen.findByText("Parent")).not.toBeNull();
    expect(screen.getByText("Cycle")).not.toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "update.title" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(client.category.update).toHaveBeenCalledWith(1, expect.objectContaining({ parent: 0 })));
  });
});
