import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

interface RouteMetadata {
  kind: "post" | "page" | "category" | "search" | "error";
  title: string;
  description?: string;
  coverImage?: string;
  author?: string;
  createdAt?: string;
  categoryName?: string;
  pv?: number;
}

const RouteMetadataContext = createContext<RouteMetadata | undefined>(undefined);
const PublishRouteMetadataContext = createContext<Dispatch<SetStateAction<RouteMetadata | undefined>> | null>(null);

// AppRoute keys this provider by location so pending requests cannot update another route's hero.
export function RouteMetadataProvider({ children }: { children: ReactNode }) {
  const [metadata, setMetadata] = useState<RouteMetadata>();
  return (
    <PublishRouteMetadataContext.Provider value={setMetadata}>
      <RouteMetadataContext.Provider value={metadata}>{children}</RouteMetadataContext.Provider>
    </PublishRouteMetadataContext.Provider>
  );
}

export function useRouteMetadata() {
  return useContext(RouteMetadataContext);
}

export function usePublishRouteMetadata(metadata: RouteMetadata | undefined) {
  const publish = useContext(PublishRouteMetadataContext);
  const { kind, title, description, coverImage, author, createdAt, categoryName, pv } = metadata ?? {};
  useEffect(() => {
    publish?.(kind ? { kind, title: title ?? "", description, coverImage, author, createdAt, categoryName, pv } : undefined);
    return () => publish?.(undefined);
  }, [publish, kind, title, description, coverImage, author, createdAt, categoryName, pv]);
}
