import "../../test/setup";
import { afterEach, expect, it, mock, spyOn } from "bun:test";
import i18n from "i18next";

mock.module("../../utils/darkModeUtils", () => ({ listenSystemMode: () => {} }));

afterEach(() => {
  localStorage.removeItem("i18nextLng");
  mock.restore();
});

it("can start in Chinese and switch to English without any translation requests", async () => {
  localStorage.setItem("i18nextLng", "zh-CN");
  const fetch = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));
  const { bootstrapApp } = await import("../bootstrap");
  bootstrapApp();

  await i18n.changeLanguage("zh-CN");
  expect(i18n.t("bootstrap.loading")).toBe("正在加载…");
  await i18n.changeLanguage("en");
  expect(i18n.t("bootstrap.loading")).toBe("Loading…");
  expect(fetch).not.toHaveBeenCalled();
});
