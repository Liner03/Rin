import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import type { CategoryDetail } from "@rin/api";
import { client } from "../app/runtime";
import { usePublishRouteMetadata } from "../app/route-metadata";
import { FeedCard } from "../components/feed_card";
import { Waiting } from "../components/loading";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants";
import { ErrorPage } from "./error";

export function CategoryPage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const [status, setStatus] = useState<"loading" | "idle">("loading");
  const [category, setCategory] = useState<CategoryDetail>();
  const [error, setError] = useState("");
  const request = useRef<{ slug: string; promise: ReturnType<typeof client.category.get> }>();
  const feedListClass = siteConfig.feedLayout === "masonry" ? "wauto columns-1 gap-5 md:columns-2" : "wauto flex flex-col";
  const categoryFeeds = Array.isArray(category?.feeds) ? category.feeds : [];
  usePublishRouteMetadata(category ? {
    kind: "category",
    title: category.name,
    description: category.description ?? undefined,
  } : status === "idle" ? { kind: "error", title: t("error.title") } : undefined);
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setCategory(undefined);
    setError("");
    if (!request.current || request.current.slug !== slug) {
      request.current = { slug, promise: client.category.get(decodeURI(slug)) };
    }
    request.current.promise.then(({ data, error }) => {
      if (cancelled) return;
      setCategory(data);
      if (error) setError(String(error.value));
      setStatus("idle");
    }).catch((error: unknown) => {
      if (cancelled) return;
      setError(error instanceof Error ? error.message : String(error));
      setStatus("idle");
    });
    return () => { cancelled = true; };
  }, [slug]);
  return (
    <>
      <Helmet>
        <title>{`${category?.name || ""} - ${siteConfig.name}`}</title>
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={category?.name} />
        <meta property="og:image" content={siteConfig.avatar} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={document.URL} />
      </Helmet>
      <Waiting for={status === "idle"}>
        {category ? <main className="w-full flex flex-col justify-center items-center mb-8">
          <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-bold">
            <p>
              {category?.name}
            </p>
            <div className="flex flex-row justify-between">
              <p className="text-sm mt-4 text-neutral-500 font-normal">
                {t("article.total$count", { count: categoryFeeds.length })}
              </p>
            </div>
          </div>
          <div className={feedListClass}>
            {categoryFeeds.map(({ id, ...feed }) => (
              <FeedCard key={id} id={id} {...feed} />
            ))}
          </div>
        </main> : <ErrorPage error={error || t("error.not_found")} />}
      </Waiting>
    </>
  );
}
