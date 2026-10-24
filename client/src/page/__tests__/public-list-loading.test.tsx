import type { Friend, Moment } from "@rin/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { client } from "../../app/runtime";
import { FriendsPage } from "../friends";
import { MomentsPage } from "../moments";

vi.mock("../../app/runtime", () => ({
  client: {
    friend: { list: vi.fn() },
    moments: { list: vi.fn() },
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../components/dialog", () => ({
  useAlert: () => ({ showAlert: vi.fn(), AlertUI: () => null }),
  useConfirm: () => ({ showConfirm: vi.fn(), ConfirmUI: () => null }),
}));
vi.mock("../../components/markdown_editor", () => ({ MarkdownEditor: () => null }));
vi.mock("../../components/markdown", () => ({ Markdown: ({ content }: { content: string }) => <div>{content}</div> }));

const date = "2026-01-01T00:00:00Z";
const friend: Friend = {
  id: 1, uid: 1, name: "Test friend", desc: "A friend", avatar: "", url: "https://example.test",
  accepted: 1, health: "", sort_order: 0, createdAt: date, updatedAt: date,
};
const moment: Moment = {
  id: 1, content: "First moment", createdAt: date, updatedAt: date,
  user: { id: 1, username: "Author", avatar: "" },
};

const cases = [
  {
    name: "friends",
    Page: FriendsPage,
    list: vi.mocked(client.friend.list),
    content: friend.name,
    queueEmpty: () => vi.mocked(client.friend.list).mockResolvedValueOnce({ data: { friend_list: [], apply_list: null } }),
    queueContent: () => vi.mocked(client.friend.list).mockResolvedValueOnce({ data: { friend_list: [friend], apply_list: null } }),
  },
  {
    name: "moments",
    Page: MomentsPage,
    list: vi.mocked(client.moments.list),
    content: moment.content,
    queueEmpty: () => vi.mocked(client.moments.list).mockResolvedValueOnce({ data: { data: [], hasNext: false } }),
    queueContent: () => vi.mocked(client.moments.list).mockResolvedValueOnce({ data: { data: [moment], hasNext: false } }),
  },
];

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

describe.each(cases)("$name loading states", ({ name, Page, list, content, queueEmpty, queueContent }) => {
  it.each([0, 500])("shows a retryable error, not an empty list, for API error %i", async (status) => {
    list.mockResolvedValueOnce({ error: { status, value: "Request failed" } });
    queueEmpty();
    render(<StrictMode><Page /></StrictMode>);

    expect(await screen.findByRole("alert")).toHaveTextContent(`${name}.load_failed`);
    expect(screen.queryByText(`${name}.empty`)).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
    expect(await screen.findByText(`${name}.empty`)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "error.retry" })).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("recovers from a rejected request and displays the returned content", async () => {
    list.mockRejectedValueOnce(new Error("Connection lost"));
    queueContent();
    render(<Page />);

    expect(await screen.findByRole("alert")).toHaveTextContent(`${name}.load_failed`);
    expect(screen.queryByText(`${name}.empty`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));

    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(`${name}.empty`)).not.toBeInTheDocument();
  });

  it("does not treat a response without list data as an empty list", async () => {
    list.mockResolvedValueOnce({});
    render(<Page />);
    expect(await screen.findByRole("alert")).toHaveTextContent(`${name}.load_failed`);
    expect(screen.queryByText(`${name}.empty`)).not.toBeInTheDocument();
  });

  it("does not show an empty state while the initial request is pending", () => {
    list.mockImplementationOnce(() => new Promise<never>(() => {}));
    render(<StrictMode><Page /></StrictMode>);
    expect(list).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(`${name}.empty`)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("moments pagination", () => {
  it.each(["API error", "rejected request"])("retains loaded moments and retries the same page after an %s", async (failure) => {
    const list = vi.mocked(client.moments.list);
    list.mockResolvedValueOnce({ data: { data: [moment], hasNext: true } });
    if (failure === "API error") {
      list.mockResolvedValueOnce({ error: { status: 500, value: "Request failed" } });
    } else {
      list.mockRejectedValueOnce(new Error("Connection lost"));
    }
    list.mockResolvedValueOnce({ data: { data: [{ ...moment, id: 2, content: "Second moment" }], hasNext: false } });
    render(<MomentsPage />);

    expect(await screen.findByText(moment.content)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "load_more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("moments.load_failed");
    expect(screen.getByText(moment.content)).toBeInTheDocument();
    expect(screen.queryByText("moments.empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "load_more" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
    expect(await screen.findByText("Second moment")).toBeInTheDocument();
    expect(screen.getAllByText(moment.content)).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("no_more")).toBeInTheDocument());
    expect(list.mock.calls.map(([query]) => query?.page)).toEqual([1, 2, 2]);
  });
});
