import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { client } from "../../../app/runtime";
import { useSiteConfig } from "../../../hooks/useSiteConfig";
import { firstSegmentOf, isMiragesArticlePage, miragesStaticTitleKey } from "./mirages-routes";

export function MiragesHero() {
  const { t, i18n } = useTranslation();
  const siteConfig = useSiteConfig();
  const [location] = useLocation();
  const [feed, setFeed] = useState<{ title: string; createdAt: string; user?: { username?: string }; hashtags?: { name: string }[]; pv?: number } | null>(null);

  const isHome = location === "/";
  const isFeedRoute = location.startsWith("/feed/");
  const isTagRoute = location.startsWith("/hashtag/");
  const firstSegment = firstSegmentOf(location);
  const staticTitleKey = miragesStaticTitleKey(firstSegment);
  const staticTitle = staticTitleKey ? t(staticTitleKey) : undefined;
  const isArticlePage = isFeedRoute || isMiragesArticlePage(location);

  useEffect(() => {
    setFeed(null);
    if (!isArticlePage) {
      return;
    }
    const id = isFeedRoute ? location.split("/")[2] : firstSegment;
    let cancelled = false;
    client.feed
      .get(id)
      .then(({ data }) => {
        if (!cancelled && data && typeof data !== "string") {
          setFeed({ title: data.title || "", createdAt: data.createdAt, user: data.user, hashtags: data.hashtags, pv: data.pv });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location]);

  let title: string;
  if (isHome) {
    title = siteConfig.name;
  } else if (isFeedRoute) {
    title = feed?.title || "";
  } else if (isTagRoute) {
    title = decodeURIComponent(location.split("/")[2] || "");
  } else if (staticTitle) {
    title = staticTitle;
  } else {
    title = feed?.title || "";
  }

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "long", day: "numeric" }).format(date);
  };

  const categoryName = feed?.hashtags?.[0]?.name || "";

  return (
    <div className="relative flex h-[338px] items-center justify-center overflow-hidden bg-[#1e1e1f] md:h-[445px]">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: isHome && siteConfig.avatar
            ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${siteConfig.avatar})`
            : "linear-gradient(135deg, #1e1e1f 0%, #2c2a2a 100%)",
        }}
      />
      <div className="relative z-10 px-6 text-center">
        <h1 className="text-[28px] font-normal text-white md:text-[40px]">{title}</h1>
        {isHome && siteConfig.description ? (
          <p className="mt-4 text-sm text-neutral-200 md:text-[15px]">{siteConfig.description}</p>
        ) : null}
        {isArticlePage && feed ? (
          <p className="mt-4 text-[13px] text-white/90 md:text-[13px]">
            {feed.user?.username ? `${feed.user.username} • ` : ""}
            {feed.createdAt ? `${formatDate(feed.createdAt)} • ` : ""}
            {feed.pv !== undefined ? `${t("count.pv")}: ${feed.pv} • ` : ""}
            {categoryName}
          </p>
        ) : null}
      </div>
    </div>
  );
}
