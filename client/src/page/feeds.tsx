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

type FeedType = 'draft' | 'unlisted' | 'normal'

type FeedsMap = {
    [key in FeedType]: FeedListResponse
}

export function FeedsPage() {
    const { t } = useTranslation()
    const siteConfig = useSiteConfig();
    const query = new URLSearchParams(useSearch());
    const profile = useContext(ProfileContext);
    const [listState, _setListState] = useState<FeedType>(query.get("type") as FeedType || 'normal')
    const [status, setStatus] = useState<'loading' | 'idle'>('idle')
    const [loadFailed, setLoadFailed] = useState(false)
    const [reloadVersion, setReloadVersion] = useState(0)
    const [feeds, setFeeds] = useState<FeedsMap>({
        draft: { size: 0, data: [], hasNext: false },
        unlisted: { size: 0, data: [], hasNext: false },
        normal: { size: 0, data: [], hasNext: false }
    })
    const page = tryInt(1, query.get("page"))
    const limit = tryInt(siteConfig.pageSize, query.get("limit"))
    const feedListClass = siteConfig.feedLayout === "masonry" ? "wauto columns-1 gap-5 ani-show md:columns-2" : "wauto flex flex-col ani-show";
    const currentFeeds = feeds[listState] ?? { size: 0, data: [], hasNext: false };
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
        const type = query.get("type") as FeedType || 'normal'
        const key = `${page} ${type} ${limit} ${reloadVersion}`
        _setListState(type)
        setStatus('loading')
        setLoadFailed(false)
        // Reuse the request during StrictMode replay; retries get a fresh version.
        if (!request.current || request.current.key !== key) {
            request.current = { key, promise: client.feed.list({ page, limit, type }) }
        }
        request.current.promise.then(({ data, error }) => {
            if (cancelled) return
            if (error || !data) {
                setLoadFailed(true)
            } else {
                setFeeds((previous) => ({ ...previous, [type]: data }))
            }
        }).catch(() => {
            if (!cancelled) setLoadFailed(true)
        }).finally(() => {
            if (!cancelled) setStatus('idle')
        })
        return () => { cancelled = true }
    }, [limit, page, query.get("type"), reloadVersion])
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
            <Waiting for={feeds.draft.size + feeds.normal.size + feeds.unlisted.size > 0 || status === 'idle'}>
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
                    <Waiting for={status === 'idle'}>
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
                    </Waiting>
                    </>}
                </main>
            </Waiting>
            )}
        </>
    )
}
