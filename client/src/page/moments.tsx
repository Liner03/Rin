import { Modal } from "@rin/ui"
import type { Moment, MomentListResponse } from "@rin/api"
import { isTransientContentError } from "../api/public-content-cache"
import { shouldResetFollowingMoments } from "../api/moment-pagination"
import { useContext, useEffect, useRef, useState } from "react"
import { Helmet } from 'react-helmet'
import { client } from "../app/runtime"

import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants"
import { useTranslation } from "react-i18next"
import { ProfileContext } from "../state/profile"
import { tryInt } from "../utils/int"
import { useSearch } from "wouter"
import { useAlert, useConfirm } from "../components/dialog"
import { MarkdownEditor } from "../components/markdown_editor"
import { Button } from "../components/button"
import { Waiting } from "../components/loading"
import { MomentItem } from "../components/moment_item"

export function MomentsPage() {
    const query = new URLSearchParams(useSearch());
    const siteConfig = useSiteConfig();
    const limit = tryInt(siteConfig.pageSize, query.get("limit"))
    return <MomentsContent key={limit} limit={limit} />
}

function MomentsContent({ limit }: { limit: number }) {
    const siteConfig = useSiteConfig();
    const active = useRef(true)
    const loadingMoreRef = useRef(false)
    const [pages, setPages] = useState<Record<number, MomentListResponse>>((): Record<number, MomentListResponse> => {
        const cached = client.moments.getCachedList({ page: 1, limit })
        return cached ? { 1: cached } : {}
    })
    const moments = Array.from(new Map(Object.keys(pages).sort((a, b) => Number(a) - Number(b))
        .flatMap(page => pages[Number(page)].data).map(moment => [moment.id, moment])).values())
    const length = moments.length
    const requestVersion = useRef(0)
    const [content, setContent] = useState("")
    const [saving, setSaving] = useState(false)
    const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>(() => pages[1] ? 'success' : 'loading')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingMoment, setEditingMoment] = useState<Moment | null>(null)
    const ref = useRef("")
    const { t } = useTranslation()
    const profile = useContext(ProfileContext);
    const { showAlert, AlertUI } = useAlert()
    const { showConfirm, ConfirmUI } = useConfirm()
    
    const [currentPage, setCurrentPage] = useState(1)
    const hasNextPage = pages[currentPage]?.hasNext ?? false
    const [loadingMore, setLoadingMore] = useState(false)
    const [loadMoreError, setLoadMoreError] = useState(false)
    
    
    function fetchMoments(page = 1, append = false) {
        const isInitialLoad = page === 1 && !append
        if (!isInitialLoad && loadingMoreRef.current) return
        const version = isInitialLoad ? ++requestVersion.current : requestVersion.current
        const params = { page, limit }
        const cached = client.moments.getCachedList(params)
        const applyData = (data: MomentListResponse) => {
            if (!active.current || version !== requestVersion.current) return
            const resetFollowingPages = isInitialLoad && shouldResetFollowingMoments(cached, data)
            if (resetFollowingPages) {
                // Later pages belong to the previous first-page boundary.
                // Invalidate their pending responses as well as rendered data.
                requestVersion.current++
                loadingMoreRef.current = false
                setLoadingMore(false)
                setLoadMoreError(false)
            }
            setPages(previous => resetFollowingPages ? { 1: data } : { ...previous, [page]: data })
            setCurrentPage(previous => resetFollowingPages ? 1 : Math.max(previous, page))
            setLoadStatus('success')
        }
        if (isInitialLoad) {
            setPages(cached ? { 1: cached } : {})
            setCurrentPage(1)
            setLoadStatus(cached ? 'success' : 'loading')
            loadingMoreRef.current = false
            setLoadingMore(false)
        } else {
            if (cached) applyData(cached)
            loadingMoreRef.current = true
            setLoadingMore(true)
        }
        setLoadMoreError(false)
        const handleFailure = (transient = true) => {
            if (!active.current || version !== requestVersion.current) return
            const fallback = transient ? client.moments.getCachedList(params) : undefined
            if (fallback) applyData(fallback)
            else if (isInitialLoad) {
                requestVersion.current++
                loadingMoreRef.current = false
                setLoadingMore(false)
                setPages({})
                setLoadStatus('error')
            } else {
                setPages(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => Number(key) < page)))
                setCurrentPage(page - 1)
                setLoadMoreError(true)
            }
        }
        return client.moments.list(params).then(({ data, error }) => {
            if (!active.current || version !== requestVersion.current) return
            if (!error && data && Array.isArray(data.data)) applyData(data)
            else handleFailure(error !== undefined && isTransientContentError(error.status))
        }).catch(() => handleFailure()).finally(() => {
            if (active.current && version === requestVersion.current && !isInitialLoad) {
                loadingMoreRef.current = false
                setLoadingMore(false)
            }
        })
    }

    function loadMore() {
        if (hasNextPage && !loadingMore) {
            fetchMoments(currentPage + 1, true)
        }
    }
    
    function handleSubmit() {
        if (!content.trim()) return
        
        setSaving(true)
        
        if (editingMoment) {
            client.moments.update(editingMoment.id, { content })
            .then(({ error }) => {
                if (error) {
                    showAlert(t('update.failed$message', { message: error.value }))
                } else {
                    setContent("")
                    setEditingMoment(null)
                    setIsModalOpen(false)
                    fetchMoments(1, false)
                    showAlert(t('update.success'))
                }
            }).finally(() => {
                setSaving(false)
            })
        } else {
            client.moments.create({ content })
            .then(({ error }) => {
                if (error) {
                    showAlert(t('publish.failed$message', { message: error.value }))
                } else {
                    setContent("")
                    setIsModalOpen(false)
                    fetchMoments(1, false)
                    showAlert(t('publish.success'))
                }
            }).finally(() => {
                setSaving(false)
            })
        }
    }
    
    function handleEdit(moment: Moment) {
        setEditingMoment(moment)
        setContent(moment.content)
        setIsModalOpen(true)
    }
    
    function handleDelete(id: number) {
        showConfirm(
            t("delete.title"),
            t("delete.confirm"),
            () => {
                client.moments.delete(id).then(({ error }) => {
                    if (error) {
                        showAlert(t('delete.failed$message', { message: error.value }))
                    } else {
                        fetchMoments(1, false)
                        showAlert(t('delete.success'))
                    }
                })
            }
        )
    }
    
    function openCreateModal() {
        setEditingMoment(null)
        setContent("")
        setIsModalOpen(true)
    }
    
    useEffect(() => {
        active.current = true
        if (!ref.current) {
            ref.current = "loaded"
            void fetchMoments(1, false)
        }
        return () => { active.current = false }
    }, [])
    
    return (
        <>
            <Helmet>
                <title>{`${t('moments.title')} - ${siteConfig.name}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t('moments.title')} />
                <meta property="og:image" content={siteConfig.avatar} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={!saving && loadStatus !== 'loading'}>
                <main className="w-full flex flex-col justify-center items-center mb-8 ani-show">
                    <div className="wauto text-start text-black dark:text-white py-4 text-4xl font-bold">
                        <p>
                            {t('moments.title')}
                        </p>
                        <div className="flex flex-row justify-between items-center">
                            <p className="text-sm mt-4 text-neutral-500 font-normal">
                                {t('moments.total$count', { count: length })}
                            </p>
                            {profile?.permission && (
                                <button 
                                    onClick={openCreateModal}
                                    className="text-sm font-normal rounded-full px-4 py-2 text-white bg-theme"
                                >
                                    {t('publish.title')}
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="wauto">
                        {moments && moments.length > 0 ? (
                            <div className="space-y-6">
                                {moments.map((moment) => (
                                    <MomentItem 
                                        key={moment.id} 
                                        moment={moment} 
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                        canManage={profile?.permission || false}
                                    />
                                ))}
                            </div>
                        ) : loadStatus === 'success' ? <p className="py-12 text-center text-sm t-secondary">{t('moments.empty')}</p> : null}
                        {(loadStatus === 'error' || loadMoreError) && (
                            <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center text-sm t-secondary">
                                <p>{t('moments.load_failed')}</p>
                                <Button title={t('error.retry')} onClick={() => {
                                    if (loadMoreError) loadMore()
                                    else void fetchMoments()
                                }} />
                            </div>
                        )}
                        
                        {loadStatus === 'success' && !loadMoreError && <Waiting for={!loadingMore}>
                            <div className="py-4 text-center">
                                {!hasNextPage && moments && moments.length > 0 ? (
                                    <div className="text-gray-500 pt-6">{t('no_more')}</div>
                                ) : hasNextPage ? (
                                    <button
                                        onClick={loadMore}
                                        className="text-sm font-normal rounded-full px-4 py-2 text-white bg-theme"
                                    >
                                        {t('load_more')}
                                    </button>
                                ) : null}
                            </div>
                        </Waiting>}
                    </div>
                </main>
            </Waiting>
            
            <Modal
                isOpen={isModalOpen}
                onRequestClose={() => setIsModalOpen(false)}
                contentLabel={editingMoment ? t('moments.edit') : t('moments.publish')}
                size="lg"
                panelClassName="p-5 sm:p-6"
            >
                <div className="w-full">
                    <h2 className="mb-4 text-xl font-bold tracking-[-0.02em] t-primary">
                        {editingMoment ? t('moments.edit') : t('moments.publish')}
                    </h2>
                    
                    <div className="bg-w rounded-2xl t-primary">
                        <MarkdownEditor 
                            content={content}
                            setContent={setContent}
                            height="300px"
                        />
                    </div>
                    
                    <div className="flex justify-end mt-4 space-x-2">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="rounded-xl bg-secondary px-4 py-2 t-primary bg-button"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={saving || !content.trim()}
                            className="px-4 py-2 bg-theme text-white rounded-lg disabled:opacity-50"
                        >
                            {saving ? t('saving') : editingMoment ? t('update.title') : t('publish.title')}
                        </button>
                    </div>
                </div>
            </Modal>
            
            <AlertUI />
            <ConfirmUI />
        </>
    )
}
