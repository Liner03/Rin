import "../../test/setup";
import { act, render, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useTableOfContents from "../useTableOfContents";

class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | null = null;
  observed: Element[] = [];
  observe = vi.fn((element: Element) => {
    this.observed.push(element);
  });
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.last = this;
  }

  trigger(target: Element, isIntersecting: boolean) {
    this.callback([{ target, isIntersecting }] as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

class FakeMutationObserver {
  static last: FakeMutationObserver | null = null;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(private callback: MutationCallback) {
    FakeMutationObserver.last = this;
  }

  trigger() {
    this.callback([], this as unknown as MutationObserver);
  }
}

function TocHarness({ content }: { content?: ReactNode }) {
  const { TOC } = useTableOfContents(".toc-content");

  return (
    <div>
      <div className="toc-content">{content}</div>
      {TOC}
    </div>
  );
}

const headers = (
  <>
    <h1>First</h1>
    <h2>Second</h2>
  </>
);

const threeHeaders = (
  <>
    <h1>First</h1>
    <h2>Second</h2>
    <h3>Third</h3>
  </>
);

const tocNav = (container: HTMLElement) => within(container.querySelector<HTMLElement>(".toc-nav")!);

describe("useTableOfContents", () => {
  const originalIO = window.IntersectionObserver;
  const originalMO = window.MutationObserver;

  beforeEach(() => {
    FakeIntersectionObserver.last = null;
    FakeMutationObserver.last = null;
    window.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    window.MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver;
  });

  afterEach(() => {
    window.IntersectionObserver = originalIO;
    window.MutationObserver = originalMO;
  });

  it("builds the table of contents from headers with level-based indentation", () => {
    const { container } = render(<TocHarness content={headers} />);

    expect(tocNav(container).getByText("First")).toBeInTheDocument();
    expect(tocNav(container).getByText("Second")).toBeInTheDocument();
    const items = container.querySelectorAll<HTMLElement>(".toc-nav li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveStyle({ paddingLeft: "calc(1rem + 0px)" });
    expect(items[1]).toHaveStyle({ paddingLeft: "calc(1rem + 10px)" });
  });

  it("shows the empty state when no headers exist", () => {
    const { container } = render(<TocHarness />);

    expect(tocNav(container).getByText("index.empty.title")).toBeInTheDocument();
  });

  it("rebuilds when headers appear after a content mutation", async () => {
    const { container, rerender } = render(<TocHarness />);
    expect(tocNav(container).getByText("index.empty.title")).toBeInTheDocument();

    rerender(<TocHarness content={headers} />);

    act(() => {
      FakeMutationObserver.last?.trigger();
    });

    await waitFor(() => {
      expect(tocNav(container).getByText("First")).toBeInTheDocument();
    });
    expect(container.querySelectorAll(".toc-nav li")).toHaveLength(2);
  });

  it("clears stale entries when headers disappear", async () => {
    const { container, rerender } = render(<TocHarness content={headers} />);
    expect(tocNav(container).getByText("First")).toBeInTheDocument();

    rerender(<TocHarness />);

    act(() => {
      FakeMutationObserver.last?.trigger();
    });

    await waitFor(() => {
      expect(tocNav(container).getByText("index.empty.title")).toBeInTheDocument();
    });
    expect(container.querySelectorAll(".toc-nav li")).toHaveLength(1);
  });

  it("re-observes every header on rebuild, even ones with stale data-ids", async () => {
    const { container, rerender } = render(<TocHarness content={headers} />);
    expect(FakeIntersectionObserver.last!.observed).toHaveLength(2);

    rerender(<TocHarness content={threeHeaders} />);
    expect(container.querySelectorAll<HTMLElement>(".toc-content h1")[0].getAttribute("data-id")).toBe("0");

    act(() => {
      FakeMutationObserver.last?.trigger();
    });

    await waitFor(() => {
      expect(FakeIntersectionObserver.last!.observed).toHaveLength(3);
    });
    expect(container.querySelectorAll(".toc-nav li")).toHaveLength(3);
  });

  it("marks the active item from intersection state", () => {
    const { container } = render(<TocHarness content={headers} />);

    const firstHeader = container.querySelector<HTMLElement>(".toc-content h1")!;
    act(() => {
      FakeIntersectionObserver.last?.trigger(firstHeader, true);
    });

    const items = container.querySelectorAll<HTMLElement>(".toc-nav li");
    expect(items[0]).toHaveClass("text-theme");
    expect(items[1]).not.toHaveClass("text-theme");
  });

  it("defers rebuilds until mutations settle", async () => {
    const { container } = render(<TocHarness />);
    expect(tocNav(container).getByText("index.empty.title")).toBeInTheDocument();

    act(() => {
      container.querySelector<HTMLElement>(".toc-content")!.appendChild(document.createElement("h1"));
      FakeMutationObserver.last?.trigger();
      FakeMutationObserver.last?.trigger();
    });

    expect(tocNav(container).getByText("index.empty.title")).toBeInTheDocument();

    await waitFor(() => {
      expect(tocNav(container).queryByText("index.empty.title")).toBeNull();
    });
    expect(container.querySelectorAll(".toc-nav li")).toHaveLength(1);
  });
});
