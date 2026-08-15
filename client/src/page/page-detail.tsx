import { useEffect, useState } from "react"
import { Helmet } from 'react-helmet'
import { useTranslation } from "react-i18next"
import { client } from "../app/runtime"
import { Markdown } from "../components/markdown"
import { Waiting } from "../components/loading"
import { Input } from "../components/input"
import type { Page } from "@rin/api";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants";

export function PagePage({ slug }: { slug: string }) {
    const { t } = useTranslation()
    const siteConfig = useSiteConfig();
    const [status, setStatus] = useState<'loading' | 'idle'>('idle')
    const [page, setPage] = useState<Page>()
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")

    function fetchPage() {
        const slugDecoded = decodeURI(slug)
        client.page.get(slugDecoded).then(({ data, error }) => {
            if (data) {
                setPage(data)
                setStatus('idle')
            } else if (error) {
                setStatus('idle')
                setPage(undefined)
            }
        })
    }

    useEffect(() => {
        setStatus('loading')
        fetchPage()
    }, [slug])

    async function unlock() {
        if (!page || page.id === undefined) return;
        const { error } = await client.page.unlock(page.id, password);
        if (error) {
            setError(error.value as string);
        } else {
            setError("");
            fetchPage();
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
            <Waiting for={status === 'idle'}>
                {page?.locked ? (
                    <div className="mx-auto mt-16 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/10 bg-w p-8 text-center dark:border-white/10">
                        <p className="text-lg font-semibold t-primary">{page.title}</p>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("password_required")}</p>
                        <Input value={password} setValue={setPassword} placeholder={t("password")} variant="flat" />
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <button
                            onClick={unlock}
                            className="rounded-xl bg-theme px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-theme-hover"
                        >
                            {t("unlock")}
                        </button>
                    </div>
                ) : page ? (
                    <main className="flex w-full flex-col items-center">
                        <div className="wauto py-4 text-4xl font-bold t-primary">
                            {page.title}
                        </div>
                        <article className="wauto t-primary">
                            <Markdown content={page.content} />
                        </article>
                    </main>
                ) : null}
            </Waiting>
        </>
    )
}
