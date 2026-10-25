import "../../test/setup";
import type { Friend, Moment } from "@rin/api";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");

const mockedRuntime = {
  client: {
    friend: { list: jest.fn() },
    moments: { list: jest.fn() },
  },
};
mock.module("../../app/runtime", () => mockedRuntime);
const { client } = mockedRuntime;
mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module("../../components/dialog", () => ({
  useAlert: () => ({ showAlert: jest.fn(), AlertUI: () => null }),
  useConfirm: () => ({ showConfirm: jest.fn(), ConfirmUI: () => null }),
}));
mock.module("../../components/markdown_editor", () => ({ MarkdownEditor: () => null }));
mock.module("../../components/markdown", () => ({ Markdown: ({ content }: { content: string }) => <div>{content}</div> }));

const { FriendsPage } = await import("../friends");
const { MomentsPage } = await import("../moments");

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
    list: client.friend.list,
    content: friend.name,
    queueEmpty: () => client.friend.list.mockResolvedValueOnce({ data: { friend_list: [], apply_list: null } }),
    queueContent: () => client.friend.list.mockResolvedValueOnce({ data: { friend_list: [friend], apply_list: null } }),
  },
  {
    name: "moments",
    Page: MomentsPage,
    list: client.moments.list,
    content: moment.content,
    queueEmpty: () => client.moments.list.mockResolvedValueOnce({ data: { data: [], hasNext: false } }),
    queueContent: () => client.moments.list.mockResolvedValueOnce({ data: { data: [moment], hasNext: false } }),
  },
];

beforeEach(() => {
  client.friend.list.mockReset();
  client.moments.list.mockReset();
});
afterEach(cleanup);

describe.each(cases)("$name loading states", ({ name, Page, list, content, queueEmpty, queueContent }) => {
  it.each([0, 500])("shows a retryable error, not an empty list, for API error %i", async (status) => {
    list.mockResolvedValueOnce({ error: { status, value: "Request failed" } });
    queueEmpty();
    render(<StrictMode><Page /></StrictMode>);

    expect((await screen.findByRole("alert")).textContent).toContain(`${name}.load_failed`);
    expect(screen.queryByText(`${name}.empty`)).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
    expect(await screen.findByText(`${name}.empty`)).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "error.retry" })).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("recovers from a rejected request and displays the returned content", async () => {
    list.mockRejectedValueOnce(new Error("Connection lost"));
    queueContent();
    render(<Page />);

    expect((await screen.findByRole("alert")).textContent).toContain(`${name}.load_failed`);
    expect(screen.queryByText(`${name}.empty`)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));

    expect(await screen.findByText(content)).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(`${name}.empty`)).toBeNull();
  });

  it("does not treat a response without list data as an empty list", async () => {
    list.mockResolvedValueOnce({});
    render(<Page />);
    expect((await screen.findByRole("alert")).textContent).toContain(`${name}.load_failed`);
    expect(screen.queryByText(`${name}.empty`)).toBeNull();
  });

  it("does not show an empty state while the initial request is pending", () => {
    list.mockImplementationOnce(() => new Promise<never>(() => {}));
    render(<StrictMode><Page /></StrictMode>);
    expect(list).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(`${name}.empty`)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("moments pagination", () => {
  it.each(["API error", "rejected request"])("retains loaded moments and retries the same page after an %s", async (failure) => {
    const list = client.moments.list;
    list.mockResolvedValueOnce({ data: { data: [moment], hasNext: true } });
    if (failure === "API error") {
      list.mockResolvedValueOnce({ error: { status: 500, value: "Request failed" } });
    } else {
      list.mockRejectedValueOnce(new Error("Connection lost"));
    }
    list.mockResolvedValueOnce({ data: { data: [{ ...moment, id: 2, content: "Second moment" }], hasNext: false } });
    render(<MomentsPage />);

    expect(await screen.findByText(moment.content)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "load_more" }));
    expect((await screen.findByRole("alert")).textContent).toContain("moments.load_failed");
    expect(screen.getByText(moment.content)).not.toBeNull();
    expect(screen.queryByText("moments.empty")).toBeNull();
    expect(screen.queryByRole("button", { name: "load_more" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "error.retry" }));
    expect(await screen.findByText("Second moment")).not.toBeNull();
    expect(screen.getAllByText(moment.content)).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(screen.getByText("no_more")).not.toBeNull());
    expect(list.mock.calls.map(([query]) => query?.page)).toEqual([1, 2, 2]);
  });
});
