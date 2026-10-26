import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { client } from "../app/runtime";
import { usePublishRouteMetadata } from "../app/route-metadata";
import { FeedCard } from "../components/feed_card";
import { Waiting } from "../components/loading";
import { CachedContentError } from "../components/cached-content-error";
import { useCachedContent } from "../hooks/use-cached-content";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants";

export function CategoryPage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const identifier = decodeURI(slug);
  const { data: category, loading, error, reload } = useCachedContent({
    key: `category:${identifier}`,
    getCached: () => client.category.getCached(identifier),
    load: () => client.category.get(identifier),
  });
  const feedListClass = siteConfig.feedLayout === "masonry" ? "wauto columns-1 gap-5 md:columns-2" : "wauto flex flex-col";
  const categoryFeeds = Array.isArray(category?.feeds) ? category.feeds : [];
  usePublishRouteMetadata(category ? {
    kind: "category",
    title: category.name,
    description: category.description ?? undefined,
  } : !loading ? { kind: "error", title: t("error.title") } : undefined);
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
      <Waiting for={!loading}>
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
        </main> : <CachedContentError error={error || t("error.not_found")} onRetry={reload} />}
      </Waiting>
    </>
  );
}
