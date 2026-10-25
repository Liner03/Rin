import "../../test/setup";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { PublicContentCache } from "../public-content-cache";

const isText = (data: unknown): data is string => typeof data === "string";
const storagePrototype = Object.getPrototypeOf(localStorage);

function storeArticle(cache: PublicContentCache, text: string) {
  cache.finish(cache.begin("article:1"), text, true);
}

beforeEach(() => localStorage.clear());

describe("cross-tab cache invalidation", () => {
  it("observes other-tab mutations after a quota failure and retries persistence on recovery", () => {
    const tabA = new PublicContentCache("https://blog.example");
    const tabB = new PublicContentCache("https://blog.example");
    const setItem = localStorage.setItem.bind(localStorage);
    const write = spyOn(storagePrototype, "setItem").mockImplementation((key: string, value: string) => {
      if (!key.endsWith(":generation")) throw new Error("QuotaExceededError");
      setItem(key, value);
    });
    try {
      storeArticle(tabA, "Old body");
      expect(tabA.get("article:1", isText)).toBe("Old body");
      write.mockImplementation(setItem);
      const oldRequest = tabA.begin("article:1");
      tabB.clear();
      expect(tabA.get("article:1", isText)).toBeUndefined();
      tabA.finish(oldRequest, "Old response", true);
      expect(tabA.get("article:1", isText)).toBeUndefined();

      storeArticle(tabA, "Fresh body");
      expect(new PublicContentCache("https://blog.example").get("article:1", isText)).toBe("Fresh body");
    } finally { write.mockRestore(); }
  });

  it.each(["after read", "before write"])("cannot undo a mutation interleaved %s during request completion", (interleaving) => {
    const tabA = new PublicContentCache("https://blog.example");
    const tabB = new PublicContentCache("https://blog.example");
    storeArticle(tabA, "Old body");
    const oldRequest = tabA.begin("article:1");
    const getItem = localStorage.getItem.bind(localStorage);
    const setItem = localStorage.setItem.bind(localStorage);
    let interleave = () => {
      interleave = () => {};
      tabB.clear();
    };
    const read = interleaving === "after read" ? spyOn(storagePrototype, "getItem").mockImplementation((key: string) => {
      const value = getItem(key);
      interleave();
      return value;
    }) : undefined;
    const write = interleaving === "before write" ? spyOn(storagePrototype, "setItem").mockImplementation((key: string, value: string) => {
      interleave();
      setItem(key, value);
    }) : undefined;
    try {
      tabA.finish(oldRequest, "Old response", true);
      expect(tabA.get("article:1", isText)).toBeUndefined();
      expect(tabB.get("article:1", isText)).toBeUndefined();
      expect(new PublicContentCache("https://blog.example").get("article:1", isText)).toBeUndefined();
    } finally {
      read?.mockRestore();
      write?.mockRestore();
    }
  });

  it("frees the payload and retries when publishing invalidation hits quota", () => {
    const tabA = new PublicContentCache("https://blog.example");
    const tabB = new PublicContentCache("https://blog.example");
    storeArticle(tabA, "Old body");
    const setItem = localStorage.setItem.bind(localStorage);
    let failed = false;
    const write = spyOn(storagePrototype, "setItem").mockImplementation((key: string, value: string) => {
      if (!failed) {
        failed = true;
        throw new Error("QuotaExceededError");
      }
      setItem(key, value);
    });
    try {
      tabB.clear();
      expect(failed).toBe(true);
      expect(tabA.get("article:1", isText)).toBeUndefined();
      storeArticle(tabB, "Fresh body");
      expect(tabA.get("article:1", isText)).toBe("Fresh body");
    } finally { write.mockRestore(); }
  });

  it("stops reusing cache if invalidation cannot be published, then recovers on a shared invalidation", () => {
    const tabA = new PublicContentCache("https://blog.example");
    const tabB = new PublicContentCache("https://blog.example");
    storeArticle(tabA, "Old body");
    const oldRequest = tabA.begin("article:1");
    const write = spyOn(storagePrototype, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    try {
      tabA.clear();
      tabA.finish(oldRequest, "Old response", true);
      storeArticle(tabA, "Response while invalidation is unavailable");
      expect(tabA.get("article:1", isText)).toBeUndefined();
    } finally { write.mockRestore(); }
    tabB.clear();
    storeArticle(tabA, "Fresh body");
    expect(tabB.get("article:1", isText)).toBe("Fresh body");
  });

  it("does not reuse content when shared storage reads and writes are denied", () => {
    const cache = new PublicContentCache("https://blog.example");
    const read = spyOn(storagePrototype, "getItem").mockImplementation(() => { throw new Error("Storage denied"); });
    const write = spyOn(storagePrototype, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    try {
      storeArticle(cache, "Read body");
      expect(cache.get("article:1", isText)).toBeUndefined();
      cache.clear();
      expect(cache.get("article:1", isText)).toBeUndefined();
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it("does not cache without reserving a shared generation when storage is already full", () => {
    const tabA = new PublicContentCache("https://blog.example");
    const tabB = new PublicContentCache("https://blog.example");
    const write = spyOn(storagePrototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    let oldRequest: ReturnType<PublicContentCache["begin"]>;
    try {
      storeArticle(tabA, "Old body");
      oldRequest = tabA.begin("article:1");
      tabB.clear();
      expect(tabA.get("article:1", isText)).toBeUndefined();
    } finally { write.mockRestore(); }
    tabA.finish(oldRequest!, "Old response", true);
    expect(new PublicContentCache("https://blog.example").get("article:1", isText)).toBeUndefined();
    storeArticle(tabA, "Fresh body");
    expect(tabB.get("article:1", isText)).toBe("Fresh body");
  });

  it("revokes other tabs' memory fallback by removing a marker that cannot be updated", () => {
    const tabA = new PublicContentCache("https://blog.example");
    const tabB = new PublicContentCache("https://blog.example");
    const setItem = localStorage.setItem.bind(localStorage);
    const write = spyOn(storagePrototype, "setItem").mockImplementation((key: string, value: string) => {
      if (!key.endsWith(":generation")) throw new Error("QuotaExceededError");
      setItem(key, value);
    });
    let oldRequest: ReturnType<PublicContentCache["begin"]>;
    try {
      storeArticle(tabA, "Old body");
      expect(tabA.get("article:1", isText)).toBe("Old body");
      oldRequest = tabA.begin("article:1");
      write.mockImplementation(() => { throw new Error("QuotaExceededError"); });
      tabB.clear();
      expect(tabA.get("article:1", isText)).toBeUndefined();
    } finally { write.mockRestore(); }
    tabA.finish(oldRequest!, "Old response", true);
    expect(new PublicContentCache("https://blog.example").get("article:1", isText)).toBeUndefined();
    storeArticle(tabA, "Fresh body");
    expect(tabB.get("article:1", isText)).toBe("Fresh body");
  });
});
