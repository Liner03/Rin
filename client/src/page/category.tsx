import { useEffect, useRef, useState } from "react"
import { Helmet } from 'react-helmet'
import { useTranslation } from "react-i18next"
import type { CategoryDetail } from "@rin/api";
import { FeedCard } from "../components/feed_card"
import { Waiting } from "../components/loading"
import { client } from "../app/runtime"
import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants";

export function CategoryPage({ slug }: { slug: string }) {
    const { t } = useTranslation()
    const siteConfig = useSiteConfig();
    const [status, setStatus] = useState<'loading' | 'idle'>('idle')
    const [category, setCategory] = useState<CategoryDetail>()
    const feedListClass = siteConfig.feedLayout === "masonry" ? "wauto columns-1 gap-5 md:columns-2" : "wauto flex flex-col";
    const categoryFeeds = Array.isArray(category?.feeds) ? category.feeds : [];
    const ref = useRef("")
    function fetchFeeds() {
        const slugDecoded = decodeURI(slug)
        client.category.get(slugDecoded).then(({ data }) => {
            if (data) {
                setCategory(data)
                setStatus('idle')
            }
        })
    }
    useEffect(() => {
        if (ref.current === slug) return
        setStatus('loading')
        fetchFeeds()
        ref.current = slug
    }, [slug])
    return (
        <>
            <Helmet>
                <title>{`${category?.name} - ${siteConfig.name}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={category?.name} />
                <meta property="og:image" content={siteConfig.avatar} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={category || status === 'idle'}>
                <main className="w-full flex flex-col justify-center items-center mb-8">
                    <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-bold">
                        <p>
                            {category?.name}
                        </p>
                        <div className="flex flex-row justify-between">
                            <p className="text-sm mt-4 text-neutral-500 font-normal">
                                {t('article.total$count', { count: categoryFeeds.length })}
                            </p>
                        </div>
                    </div>
                    <Waiting for={status === 'idle'}>
                        <div className={feedListClass}>
                            {categoryFeeds.map(({ id, ...feed }) => (
                                <FeedCard key={id} id={id} {...feed} />
                            ))}
                        </div>
                    </Waiting>
                </main>
            </Waiting>
        </>
    )
}
