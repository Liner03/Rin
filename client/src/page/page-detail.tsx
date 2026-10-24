import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import type { Page } from "@rin/api";
import { client } from "../app/runtime";
import { usePublishRouteMetadata } from "../app/route-metadata";
import { Input } from "../components/input";
import { Waiting } from "../components/loading";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { getPageTemplate } from "../components/page-templates";
import { siteName } from "../utils/constants";
import { ErrorPage } from "./error";

export function PageDetail({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const [status, setStatus] = useState<"loading" | "idle">("loading");
  const [page, setPage] = useState<Page>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const request = useRef<{ slug: string; version: number; promise: ReturnType<typeof client.page.get> }>();

  usePublishRouteMetadata(page ? { kind: "page", title: page.title } : undefined);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setPage(undefined);
    setPassword("");
    setError("");
    setLoadError("");
    if (!request.current || request.current.slug !== slug || request.current.version !== reloadVersion) {
      request.current = { slug, version: reloadVersion, promise: client.page.get(decodeURI(slug)) };
    }
    request.current.promise.then(({ data, error }) => {
      if (cancelled) return;
      setPage(data);
      if (error) setLoadError(String(error.value));
      setStatus("idle");
    }).catch((error: unknown) => {
      if (cancelled) return;
      setLoadError(error instanceof Error ? error.message : String(error));
      setStatus("idle");
    });
    return () => { cancelled = true; };
  }, [slug, reloadVersion]);

  async function unlock() {
    if (!page || page.id === undefined) return;
    const { error } = await client.page.unlock(page.id, password);
    if (error) {
      setError(error.value as string);
    } else {
      setError("");
      setReloadVersion((version) => version + 1);
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
      <Waiting for={status === "idle"}>
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
