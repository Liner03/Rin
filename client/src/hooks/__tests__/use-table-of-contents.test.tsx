import "../../test/setup";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import useTableOfContents from "../useTableOfContents";

const { act, cleanup, render, waitFor, within } = await import("@testing-library/react");

class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | null = null;
  observed: Element[] = [];
  observe = jest.fn((element: Element) => {
    this.observed.push(element);
  });
  unobserve = jest.fn();
  disconnect = jest.fn();

  constructor(private callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.last = this;
  }

  trigger(target: Element, isIntersecting: boolean) {
    this.callback([{ target, isIntersecting }] as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

class FakeMutationObserver {
  static last: FakeMutationObserver | null = null;
  observe = jest.fn();
  disconnect = jest.fn();

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
    Object.assign(globalThis, { IntersectionObserver: window.IntersectionObserver, MutationObserver: window.MutationObserver });
  });

  afterEach(() => {
    cleanup();
    window.IntersectionObserver = originalIO;
    window.MutationObserver = originalMO;
    Object.assign(globalThis, { IntersectionObserver: originalIO, MutationObserver: originalMO });
  });

  it("builds the table of contents from headers with level-based indentation", () => {
    const { container } = render(<TocHarness content={headers} />);

    expect(tocNav(container).getByText("First")).not.toBeNull();
    expect(tocNav(container).getByText("Second")).not.toBeNull();
    const items = container.querySelectorAll<HTMLElement>(".toc-nav li");
    expect(items).toHaveLength(2);
    expect(items[0].style.paddingLeft).toBe("calc(0px + 1rem)");
    expect(items[1].style.paddingLeft).toBe("calc(10px + 1rem)");
  });

  it("hides the toc entirely when no headers exist", () => {
    const { container } = render(<TocHarness />);

    expect(container.querySelector(".toc-nav")).toBeNull();
  });

  it("rebuilds when headers appear after a content mutation", async () => {
    const { container, rerender } = render(<TocHarness />);
    expect(container.querySelector(".toc-nav")).toBeNull();

    rerender(<TocHarness content={headers} />);

    act(() => {
      FakeMutationObserver.last?.trigger();
    });

    await waitFor(() => {
      expect(tocNav(container).getByText("First")).not.toBeNull();
    });
    expect(container.querySelectorAll(".toc-nav li")).toHaveLength(2);
  });

  it("clears stale entries when headers disappear", async () => {
    const { container, rerender } = render(<TocHarness content={headers} />);
    expect(tocNav(container).getByText("First")).not.toBeNull();

    rerender(<TocHarness />);

    act(() => {
      FakeMutationObserver.last?.trigger();
    });

    await waitFor(() => {
      expect(container.querySelector(".toc-nav")).toBeNull();
    });
    expect(container.querySelectorAll(".toc-nav li")).toHaveLength(0);
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
    expect(items[0].classList.contains("text-theme")).toBe(true);
    expect(items[1].classList.contains("text-theme")).toBe(false);
  });

  it("defers rebuilds until mutations settle", async () => {
    const { container } = render(<TocHarness />);
    expect(container.querySelector(".toc-nav")).toBeNull();

    act(() => {
      container.querySelector<HTMLElement>(".toc-content")!.appendChild(document.createElement("h1"));
      FakeMutationObserver.last?.trigger();
      FakeMutationObserver.last?.trigger();
    });

    expect(container.querySelector(".toc-nav")).toBeNull();

    await waitFor(() => {
      expect(container.querySelectorAll(".toc-nav li")).toHaveLength(1);
    });
  });

  it("preserves the navigation element and its scroll position when the active heading changes", () => {
    const { container } = render(<TocHarness content={threeHeaders} />);
    const nav = container.querySelector<HTMLElement>(".toc-nav")!;
    nav.scrollTop = 80;
    act(() => {
      FakeIntersectionObserver.last?.trigger(container.querySelector("h3")!, true);
    });
    expect(container.querySelector(".toc-nav")).toBe(nav);
    expect(nav.scrollTop).toBe(80);
    expect(container.querySelectorAll(".toc-nav li")[1].classList.contains("text-theme")).toBe(true);
  });
});
