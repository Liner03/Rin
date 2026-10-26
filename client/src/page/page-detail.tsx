import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { client } from "../app/runtime";
import { usePublishRouteMetadata } from "../app/route-metadata";
import { Input } from "../components/input";
import { Waiting } from "../components/loading";
import { preloadMarkdown } from "../components/markdown";
import { usePageContent } from "../hooks/use-page-content";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { getPageTemplate } from "../components/page-templates";
import { siteName } from "../utils/constants";
import { ErrorPage } from "./error";

export function PageDetail({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const { page, loading, error: loadError, reload } = usePageContent(decodeURI(slug));
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  usePublishRouteMetadata(page ? { kind: "page", title: page.title }
    : !loading ? { kind: "error", title: t("error.title") } : undefined);

  useEffect(() => {
    setPassword("");
    setError("");
    preloadMarkdown().catch((error) => console.error("Failed to preload Markdown", error));
  }, [slug]);

  async function unlock() {
    if (!page || page.id === undefined) return;
    const { error } = await client.page.unlock(page.id, password);
    if (error) {
      setError(error.value as string);
    } else {
      setError("");
      reload();
    }
  }

  return (
    <>
      <Helmet>
        <title>{`${page?.title || ""} - ${siteConfig.name}`}</title>
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={page?.title} />
        <meta property="og:image" content={siteConfig.avatar} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={document.URL} />
      </Helmet>
      <Waiting for={!loading}>
        {page?.locked ? (
          <div className="mx-auto mt-16 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/10 bg-w p-8 text-center dark:border-white/10">
            <p className="text-lg font-semibold t-primary">{page.title}</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("password_required")}</p>
            <Input value={password} setValue={setPassword} placeholder={t("password")} type="password" variant="flat" />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              onClick={unlock}
              className="rounded-xl bg-theme px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-theme-hover"
            >
              {t("unlock")}
            </button>
          </div>
        ) : page ? (
          getPageTemplate(page.template).render({ page })
        ) : <ErrorPage error={loadError || t("error.not_found")} />}
      </Waiting>
    </>
  );
}
