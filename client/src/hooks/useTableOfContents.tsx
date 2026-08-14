import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface TableOfContent {
    index: number
    text: string
    marginLeft: number
    element: HTMLElement
}

const getHeaderScrollOffset = () => {
    const rawValue = getComputedStyle(document.documentElement)
        .getPropertyValue('--header-scroll-offset')
        .trim()
    const offset = Number.parseFloat(rawValue)
    return Number.isFinite(offset) ? offset : 0
}

const useTableOfContents = (selector: string) => {
    const [tableOfContents, setTableOfContents] = useState<TableOfContent[]>([])
    const [activeIndex, setActiveIndex] = useState(0)
    const { t } = useTranslation()
    const ioRef = useRef<IntersectionObserver | null>(null)
    const mutationObserverRef = useRef<MutationObserver | null>(null)
    const debounceTimer = useRef<number | undefined>(undefined)

    useEffect(() => {
        const content = document.querySelector(selector)
        if (!content) return

        const buildToc = () => {
            const headers = content.querySelectorAll<HTMLElement>(
                'h1, h2, h3, h4, h5, h6'
            )
            const tocData = Array.from(headers).map<TableOfContent>((header, i) => ({
                index: i,
                text: header.textContent || '',
                marginLeft: (Number(header.tagName.charAt(1)) - 1) * 10,
                element: header,
            }))
            setTableOfContents(tocData)
            setActiveIndex((prev) => (tocData.length > 0 ? Math.min(prev, tocData.length - 1) : 0))

            if (ioRef.current) ioRef.current.disconnect()
            ioRef.current = null

            if (tocData.length === 0) {
                return
            }

            const intersectingList = new Array<boolean>(tocData.length).fill(false)
            const observer = new IntersectionObserver(
                (entries) => {
                    if (ioRef.current !== observer) return
                    entries.forEach(({ target, isIntersecting }) => {
                        const idx = Number((target as HTMLElement).dataset.id)
                        if (idx >= 0 && idx < intersectingList.length) {
                            intersectingList[idx] = isIntersecting
                        }
                    })
                    const currentIndex = intersectingList.findIndex((item) => item)
                    let nextActiveIndex = currentIndex - 1
                    if (currentIndex === -1) {
                        nextActiveIndex = intersectingList.length - 1
                    } else if (currentIndex === 0) {
                        nextActiveIndex = 0
                    }
                    setActiveIndex(nextActiveIndex)
                },
                { rootMargin: "-20% 0px 10000px 0px", threshold: 0 }
            )
            ioRef.current = observer
            headers.forEach((header, i) => {
                header.setAttribute('data-id', i.toString())
                observer.observe(header)
            })
        }

        buildToc()

        // Markdown renders asynchronously: watch for content changes and rebuild
        // once the headers appear (debounced to avoid thrashing during rendering)
        if (mutationObserverRef.current) mutationObserverRef.current.disconnect()
        mutationObserverRef.current = new MutationObserver(() => {
            window.clearTimeout(debounceTimer.current)
            debounceTimer.current = window.setTimeout(buildToc, 120)
        })
        mutationObserverRef.current.observe(content, { childList: true, subtree: true, characterData: true })

        return () => {
            window.clearTimeout(debounceTimer.current)
            if (ioRef.current) ioRef.current.disconnect()
            if (mutationObserverRef.current) mutationObserverRef.current.disconnect()
        }
    }, [selector])

    const TOC = (
        <nav className="toc-nav">
                <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
                    {t("index.title")}
                </p>
                <ul className="space-y-[3px] border-l border-black/10 dark:border-white/10">
                    {tableOfContents.length === 0 && (
                        <li className="py-1.5 pl-4 text-[13px] leading-6 text-neutral-400 dark:text-neutral-500">{t("index.empty.title")}</li>
                    )}
                    {tableOfContents.map((item) => (
                        <li
                            key={`toc$${item.index}`}
                            className={`group relative cursor-pointer text-[13px] leading-6 transition-colors duration-150 ${
                                activeIndex === item.index
                                    ? "font-medium text-theme"
                                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                            }`}
                            style={{ paddingLeft: `calc(1rem + ${item.marginLeft}px)` }}
                            onClick={() => {
                                const top = item.element.getBoundingClientRect().top + window.scrollY - getHeaderScrollOffset()
                                window.scrollTo({
                                    top: Math.max(top, 0),
                                    behavior: 'smooth'
                                })
                            }}
                        >
                            <span
                                className={`absolute -left-px top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-theme transition-opacity duration-150 ${
                                    activeIndex === item.index ? "opacity-100" : "opacity-0"
                                }`}
                            />
                            <span className={`block py-1 transition-colors ${activeIndex === item.index ? "text-theme" : ""}`}>
                                {item.text}
                            </span>
                        </li>
                    ))}
                </ul>
            </nav>
    )

    return { TOC }
}

export default useTableOfContents
