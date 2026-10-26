import type { TimelineItem } from "@rin/api"
import {useEffect, useMemo, useRef, useState} from "react"
import {Helmet} from 'react-helmet'
import {Link} from "wouter"
import {Waiting} from "../components/loading"
import {Button} from "../components/button"
import { client } from "../app/runtime"
import { isTransientContentError } from "../api/public-content-cache"
import {useSiteConfig} from "../hooks/useSiteConfig";
import {siteName} from "../utils/constants"
import {useTranslation} from "react-i18next";

export function TimelinePage() {
    const [data, setData] = useState<TimelineItem[] | undefined>(() => client.feed.getCachedTimeline())
    const [error, setError] = useState("")
    const [reloadVersion, setReloadVersion] = useState(0)
    const request = useRef<{ version: number; promise: ReturnType<typeof client.feed.timeline> }>()
    const { t } = useTranslation()
    const siteConfig = useSiteConfig();
    const loadFailedMessage = t("article.load_failed")
    const feeds = useMemo(() => data?.reduce<Record<number, TimelineItem[]>>((groups, item) => {
        const year = new Date(item.createdAt).getFullYear()
        ;(groups[year] ||= []).push(item)
        return groups
    }, {}), [data])
    const length = data?.length ?? 0

    useEffect(() => {
        let cancelled = false
        setData(client.feed.getCachedTimeline())
        setError("")
        if (!request.current || request.current.version !== reloadVersion) {
            request.current = { version: reloadVersion, promise: client.feed.timeline() }
        }
        function fail(message: string, transient: boolean) {
            if (cancelled) return
            const cached = transient ? client.feed.getCachedTimeline() : undefined
            setData(cached)
            setError(cached ? "" : message)
        }
        request.current.promise.then(({ data, error }) => {
            if (cancelled) return
            if (error) fail(String(error.value), isTransientContentError(error.status))
            else if (Array.isArray(data)) setData(data)
            else fail(loadFailedMessage, false)
        }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error), true))
        return () => { cancelled = true }
    }, [reloadVersion, loadFailedMessage])
    return (
        <>
            <Helmet>
                <title>{`${t('timeline')} - ${siteConfig.name}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t('timeline')} />
                <meta property="og:image" content={siteConfig.avatar} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={data !== undefined || Boolean(error)}>
                {error ? <div role="alert" className="wauto mx-auto flex flex-col items-center gap-4 rounded-2xl bg-w p-6">
                    <p>{error}</p>
                    <Button title={t("error.retry")} onClick={() => setReloadVersion((version) => version + 1)} />
                </div> : <main className="w-full flex flex-col justify-center items-center mb-8 ani-show">
                    <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-bold">
                        <p>
                            {t('timeline')}
                        </p>
                        <div className="flex flex-row justify-between">
                            <p className="text-sm mt-4 text-neutral-500 font-normal">
                                {t('article.total$count', { count: length })}
                            </p>
                        </div>
                    </div>
                    {feeds && Object.keys(feeds).sort((a, b) => parseInt(b) - parseInt(a)).map(year => (
                        <div key={year} className="wauto flex flex-col justify-center items-start">
                            <h1 className="flex flex-row items-center space-x-2">
                                <span className="text-2xl font-bold t-primary ">
                                    {t('year$year', { year: year })}
                                </span>
                                <span className="text-sm t-secondary">
                                    {t('article.total_short$count', { count: feeds[+year]?.length })}
                                    </span>
                            </h1>
                            <div className="w-full flex flex-col justify-center items-start my-4">
                                {feeds[+year]?.map(({ id, title, createdAt }) => (
                                    <FeedItem key={id} id={id.toString()} title={title || t('unlisted')}
                                              createdAt={new Date(createdAt)}/>
                                ))}
                            </div>
                        </div>
                    ))}
                </main>}
            </Waiting>
        </>
    )
}

export function FeedItem({ id, title, createdAt }: { id: string, title: string, createdAt: Date }) {
    const formatter = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: '2-digit' });
    return (
        <div className="flex min-w-0 flex-row pl-8">
            <div className="flex shrink-0 flex-row items-center">
                <div className="w-2 h-2 bg-theme rounded-full"></div>
            </div>
            <div className="m-2 flex min-w-0 flex-1 flex-row items-center space-x-4 rounded-2xl duration-300">
                <span className="shrink-0 text-sm t-secondary" title={new Date(createdAt).toLocaleString()}>
                    {formatter.format(new Date(createdAt))}
                </span>
                <Link href={`/feed/${id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-base t-primary hover:text-theme text-pretty [overflow-wrap:anywhere]">
                    {title}
                </Link>
            </div>
        </div>
    )
}
