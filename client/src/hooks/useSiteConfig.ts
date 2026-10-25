import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClientConfigContext, type ConfigWrapper } from "../state/config";
import { client } from "../app/runtime";
import { normalizeFeedCardVariant } from "../components/feed-card-options";
import { normalizeFeedLayout } from "../components/feed-layout-options";

// Site configuration keys
export const SITE_CONFIG_KEYS = {
    headerBehavior: "header.behavior",
    name: "site.name",
    description: "site.description",
    avatar: "site.avatar",
    heroImage: "site.hero_image",
    heroPosition: "site.hero_position",
    keywords: "site.keywords",
    copyright: "site.copyright",
    nav: "site.nav",
    frontPage: "site.front_page",
    pageSize: "site.page_size",
    feedLayout: "feed.layout",
    feedCardVariant: "feed.card_variant",
    headerLayout: "header.layout",
    themeColor: "theme.color",
} as const;

export interface SiteNavItem {
    label: string;
    href: string;
}

// 默认导航（i18n key），自定义 site.nav 为空时使用
export const DEFAULT_NAV: Array<SiteNavItem & { selectedPrefix?: string }> = [
    { label: "article.title", href: "/", selectedPrefix: "/feed" },
    { label: "timeline", href: "/timeline" },
    { label: "moments.title", href: "/moments" },
    { label: "hashtags", href: "/hashtags" },
    { label: "friends.title", href: "/friends" },
    { label: "about.title", href: "/about" },
];

// 解析 site.nav 配置（JSON 数组字符串 或 已解析的数组），非法时返回空数组
function parseSiteNav(raw: string | unknown[] | null | undefined): SiteNavItem[] {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
        if (!raw) {
            return [];
        }
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(parsed)) {
        return [];
    }
    return parsed
        .filter((item) => item && typeof item.label === "string" && typeof item.href === "string")
        .map((item) => ({ label: item.label, href: item.href }));
}

// Hook to get site configuration
export function useSiteConfig() {
    const config = useContext(ClientConfigContext);
    const pageSizeValue = config.get<string | number>(SITE_CONFIG_KEYS.pageSize);
    const parsedPageSize =
        typeof pageSizeValue === "number"
            ? pageSizeValue
            : typeof pageSizeValue === "string"
                ? parseInt(pageSizeValue, 10)
                : NaN;

    return {
        name: config.get<string>(SITE_CONFIG_KEYS.name) || "Rin",
        description: config.get<string>(SITE_CONFIG_KEYS.description) || "",
        avatar: config.get<string>(SITE_CONFIG_KEYS.avatar) || "",
        heroImage: config.get<string>(SITE_CONFIG_KEYS.heroImage) || "",
        heroPosition: config.get<string>(SITE_CONFIG_KEYS.heroPosition) || "center",
        keywords: config.get<string>(SITE_CONFIG_KEYS.keywords) || "",
        copyright: config.get<string>(SITE_CONFIG_KEYS.copyright) || "",
        nav: parseSiteNav(config.get<string>(SITE_CONFIG_KEYS.nav)),
        frontPage: config.get<string>(SITE_CONFIG_KEYS.frontPage) || "",
        pageSize: Number.isFinite(parsedPageSize) ? parsedPageSize : 5,
        headerBehavior: config.get<string>(SITE_CONFIG_KEYS.headerBehavior) || "fixed",
        feedLayout: normalizeFeedLayout(config.get<string>(SITE_CONFIG_KEYS.feedLayout) || "list"),
        feedCardVariant: normalizeFeedCardVariant(config.get<string>(SITE_CONFIG_KEYS.feedCardVariant) || "default"),
        headerLayout: config.get<string>(SITE_CONFIG_KEYS.headerLayout) || "classic",
        themeColor: config.get<string>(SITE_CONFIG_KEYS.themeColor) || "#fc466b",
    };
}


// Share only in-flight requests within the current config, not a persistent page cache.
const navigationRequests = new WeakMap<ConfigWrapper, ReturnType<typeof client.page.list>>();

function loadNavigationPages(config: ConfigWrapper) {
    let request = navigationRequests.get(config);
    if (!request) {
        request = client.page.list().finally(() => navigationRequests.delete(config));
        navigationRequests.set(config, request);
    }
    return request;
}

// 导航项：自定义 site.nav 优先；否则默认导航 + 自动追加已发布页面（Typecho 惯例）
export function useSiteNavItems() {
    const { t } = useTranslation();
    const config = useContext(ClientConfigContext);
    const siteConfig = useSiteConfig();
    const hasCustomNav = siteConfig.nav.length > 0;
    const [pages, setPages] = useState<Array<{ title: string; slug: string | null }>>([]);

    useEffect(() => {
        if (hasCustomNav) return;
        let cancelled = false;
        loadNavigationPages(config).then(({ data }) => {
            if (!cancelled && data) {
                setPages(
                    data
                        .filter((page) => page.status === "publish" && !page.hasPassword && page.slug)
                        .map((page) => ({ title: page.title, slug: page.slug })),
                );
            }
        }).catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [config, hasCustomNav]);

    if (siteConfig.nav.length > 0) {
        return siteConfig.nav.map((item) => ({
            title: item.label,
            href: item.href,
            selectedPrefix: undefined,
        }));
    }

    // 页面项与默认项同名时替换默认项（如"关于"指向真实页面）
    const defaultItems = DEFAULT_NAV.map((item) => ({
        title: t(item.label),
        href: item.href,
        selectedPrefix: item.selectedPrefix,
    }));
    const defaultTitles = new Set(defaultItems.map((item) => item.title));

    // 页面项最多 8 个，防止导航无限膨胀（更多页面请用自定义 site.nav）
    const pageItems = pages
        .filter((page) => !defaultTitles.has(page.title))
        .slice(0, 8)
        .map((page) => ({
            title: page.title,
            href: `/page/${page.slug}`,
            selectedPrefix: undefined,
        }));

    const replaced = defaultItems.map((item) => {
        const match = pages.find((page) => page.title === item.title);
        return match ? { ...item, href: `/page/${match.slug}` } : item;
    });

    return [...replaced, ...pageItems];
}

// Hook to get a specific site config value
export function useSiteConfigValue<K extends keyof typeof SITE_CONFIG_KEYS>(
    key: K
): typeof SITE_CONFIG_KEYS[K] extends "site.page_size" ? number : string {
    const config = useContext(ClientConfigContext);
    const configKey = SITE_CONFIG_KEYS[key];

    if (key === "pageSize") {
        const value = config.get<string | number>(configKey);
        const parsed =
            typeof value === "number"
                ? value
                : typeof value === "string"
                    ? parseInt(value, 10)
                    : NaN;
        return (Number.isFinite(parsed) ? parsed : 5) as any;
    }

    return (config.get<string>(configKey) || "") as any;
}
