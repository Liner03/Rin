import "../../test/setup";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { BootstrapStatus } from "../bootstrap-status";
mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
it("shows a blog skeleton while the initial config loads", () => {
  const { container, getByRole } = render(<BootstrapStatus failed={false} />);
  expect(getByRole("status").getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector(".blog-skeleton")).not.toBeNull();
  expect(container.textContent).not.toContain("bootstrap.loading");
});
it("keeps the retry action when loading fails", () => {
  const { getByRole } = render(<BootstrapStatus failed />);
  expect(getByRole("alert").textContent).toContain("bootstrap.failed");
  expect(getByRole("button").textContent).toContain("error.retry");
});
it("serves a skeleton before JavaScript starts", () => {
  const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
  expect(html).not.toMatch(/>Loading[… .]*</);
  expect(html).toContain("blog-skeleton");
});
