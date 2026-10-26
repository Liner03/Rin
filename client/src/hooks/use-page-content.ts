import { client } from "../app/runtime";
import { useCachedContent } from "./use-cached-content";

export function usePageContent(identifier: string | undefined) {
  const { data: page, ...state } = useCachedContent({
    key: `page:${identifier}`,
    enabled: Boolean(identifier),
    getCached: () => identifier ? client.page.getCached(identifier) : undefined,
    load: () => client.page.get(identifier ?? ""),
  });
  return { page, ...state };
}
