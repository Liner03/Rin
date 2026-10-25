import type { FeedListResponse, Page } from "@rin/api";
import { useContext, useEffect, useRef, useState } from "react"
import { Helmet } from 'react-helmet'
import { Link, useSearch } from "wouter"
import { FeedCard } from "../components/feed_card"
import { Button } from "../components/button"
import { Waiting } from "../components/loading"
import { client } from "../app/runtime"
import { ProfileContext } from "../state/profile"

import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants"
import { getPageTemplate } from "../components/page-templates"
import { tryInt } from "../utils/int"
import { useTranslation } from "react-i18next";
import { isTransientContentError } from "../api/public-content-cache";

type FeedType = 'draft' | 'unlisted' | 'normal'

export function FeedsPage() {
    const { t } = useTranslation()
    const siteConfig = useSiteConfig();
    const query = new URLSearchParams(useSearch());
    const profile = useContext(ProfileContext);
    const listState = query.get("type") as FeedType || 'normal'
    const [reloadVersion, setReloadVersion] = useState(0)
    const page = tryInt(1, query.get("page"))
    const limit = tryInt(siteConfig.pageSize, query.get("limit"))
    const key = `${page} ${listState} ${limit}`
    const [result, setResult] = useState<{ key: string; data?: FeedListResponse; failed?: boolean }>(() => ({
        key, data: client.feed.getCachedList({ page, limit, type: listState })
    }))
    const feedListClass = siteConfig.feedLayout === "masonry" ? "wauto columns-1 gap-5 ani-show md:columns-2" : "wauto flex flex-col ani-show";
    const data = result.key === key ? result.data : client.feed.getCachedList({ page, limit, type: listState });
    const loadFailed = result.key === key && result.failed;
    const currentFeeds = data ?? { size: 0, data: [], hasNext: false };
    const currentFeedData = Array.isArray(currentFeeds.data) ? currentFeeds.data : [];
    const request = useRef<{ key: string; promise: ReturnType<typeof client.feed.list> }>()
    const [frontPage, setFrontPage] = useState<Page>();
    useEffect(() => {
        let cancelled = false;
        if (siteConfig.frontPage && listState === 'normal') {
            client.page.get(siteConfig.frontPage).then(({ data }) => {
                if (!cancelled && data && !data.locked) setFrontPage(data);
            }).catch(() => {});
        } else {
            setFrontPage(undefined);
        }
        return () => {
            cancelled = true;
        };
    }, [siteConfig.frontPage, listState]);
    useEffect(() => {
        let cancelled = false
        const params = { page, limit, type: listState }
        const requestKey = `${key} ${reloadVersion}`
        setResult({ key, data: client.feed.getCachedList(params) })
        // Reuse the request during StrictMode replay; retries get a fresh version.
        if (!request.current || request.current.key !== requestKey) {
            request.current = { key: requestKey, promise: client.feed.list(params) }
        }
        request.current.promise.then(({ data, error }) => {
            if (cancelled) return
            if (error || !data) {
                const cached = error && isTransientContentError(error.status) ? client.feed.getCachedList(params) : undefined
                setResult({ key, data: cached, failed: !cached })
            } else {
                setResult({ key, data })
            }
        }).catch(() => {
            if (!cancelled) {
                const cached = client.feed.getCachedList(params)
                setResult({ key, data: cached, failed: !cached })
            }
        })
        return () => { cancelled = true }
    }, [limit, page, listState, key, reloadVersion])
    return (
        <>
            <Helmet>
                <title>{`${t('article.title')} - ${siteConfig.name}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t('article.title')} />
                <meta property="og:image" content={siteConfig.avatar} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
                {siteConfig.keywords && <meta name="keywords" content={siteConfig.keywords} />}
                {siteConfig.description && <meta name="description" content={siteConfig.description} />}
            </Helmet>
            {siteConfig.frontPage && frontPage && listState === 'normal' ? (
                <main className="w-full flex flex-col justify-center items-center mb-8">
                    {getPageTemplate(frontPage.template).render({ page: frontPage })}
                </main>
            ) : (
            <Waiting for={data || loadFailed}>
                <main className="w-full flex flex-col justify-center items-center mb-8">
                    {loadFailed ? (
                        <div role="alert" className="wauto flex flex-col items-center gap-4 rounded-2xl bg-w p-6">
                            <p>{t('article.load_failed')}</p>
                            <Button title={t('error.retry')} onClick={() => setReloadVersion((version) => version + 1)} />
                        </div>
                    ) : <>
                    <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-bold">
                        <p>
                            {listState === 'draft' ? t('draft_bin') : listState === 'normal' ? t('article.title') : t('unlisted')}
                        </p>
                        <div className="flex flex-row justify-between">
                            <p className="text-sm mt-4 text-neutral-500 font-normal">
                                {t('article.total$count', { count: currentFeeds.size })}
                            </p>
                            {profile?.permission &&
                                <div className="flex flex-row space-x-4">
                                    <Link href={listState === 'draft' ? '/?type=normal' : '/?type=draft'} className={`text-sm mt-4 text-neutral-500 font-normal ${listState === 'draft' ? "text-theme" : ""}`}>
                                        {t('draft_bin')}
                                    </Link>
                                    <Link href={listState === 'unlisted' ? '/?type=normal' : '/?type=unlisted'} className={`text-sm mt-4 text-neutral-500 font-normal ${listState === 'unlisted' ? "text-theme" : ""}`}>
                                        {t('unlisted')}
                                    </Link>
                                </div>
                            }
                        </div>
                    </div>
                        <div className={feedListClass}>
                            {currentFeedData.map(({ id, ...feed }, index) => (
                                <FeedCard key={id} id={id} {...feed} imagePriority={index === 0} />
                            ))}
                        </div>
                        <div className="wauto flex flex-row items-center mt-4 ani-show">
                            {page > 1 &&
                                <Link href={`/?type=${listState}&page=${(page - 1)}`}
                                    className={`text-sm font-normal rounded-full px-4 py-2 text-white bg-theme mirages-pager-btn`}>
                                    {t('previous')}
                                </Link>
                            }
                            <div className="flex-1" />
                            {currentFeeds.hasNext &&
                                <Link href={`/?type=${listState}&page=${(page + 1)}`}
                                    className={`text-sm font-normal rounded-full px-4 py-2 text-white bg-theme mirages-pager-btn`}>
                                    {t('next')}
                                </Link>
                            }
                        </div>
                    </>}
                </main>
            </Waiting>
            )}
        </>
    )
}
