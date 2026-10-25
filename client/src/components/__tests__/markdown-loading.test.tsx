import "../../test/setup";
import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import { Markdown } from "../markdown";

const runDiagram = jest.fn(async ({ nodes }: { nodes: NodeListOf<HTMLElement> }) => {
  for (const node of nodes) {
    expect(node.isConnected).toBe(true);
    node.dataset.processed = "true";
  }
});
mock.module("mermaid", () => ({ default: { initialize: jest.fn(), run: runDiagram } }));

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
afterEach(cleanup);

describe("lazy Markdown features", () => {
  it("renders the body, raw HTML, links and headings", async () => {
    render(<Markdown content={'## Heading\n\nReadable body [link](https://example.com)\n\n<div class="legacy-content">Imported HTML</div>'} />);
    expect(await screen.findByRole("heading", { name: "Heading" })).not.toBeNull();
    expect(screen.getByText("Imported HTML").className).toBe("legacy-content");
    expect(screen.getByRole("link", { name: "link" }).getAttribute("href")).toBe("https://example.com");
  });

  it("enhances fenced code without losing its text", async () => {
    const { container } = render(<Markdown content={'```js\nconst answer = 42;\n```'} />);
    await waitFor(() => expect(container.textContent).toContain("const answer = 42;"));
    await waitFor(() => expect(container.querySelector("code .token[style]")).not.toBeNull());
  });

  it("loads inline and display math when a document gains formulas", async () => {
    const { container, rerender } = render(<Markdown content="Plain text" />);
    await screen.findByText("Plain text");
    expect(container.querySelector(".katex")).toBeNull();
    rerender(<Markdown content={'Inline $x^2$\n\n$$\ny = x + 1\n$$'} />);
    await waitFor(() => expect(container.querySelectorAll(".katex")).toHaveLength(2));
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("opens image preview on demand", async () => {
    render(<Markdown content={'![Photo](https://example.com/photo.png)'} />);
    const image = await screen.findByRole("img", { name: "Photo" });
    expect(document.querySelector(".yarl__root")).toBeNull();
    fireEvent.click(image);
    await waitFor(() => expect(document.querySelector(".yarl__root")).not.toBeNull());
  });

  it("starts diagrams after their lazy body has mounted", async () => {
    const { container } = render(<Markdown content={'```mermaid\ngraph TD; A-->B;\n```'} />);
    await waitFor(() => expect(container.querySelectorAll('pre[data-processed="true"]')).toHaveLength(2));
    expect(runDiagram).toHaveBeenCalledTimes(2);
  });
});
