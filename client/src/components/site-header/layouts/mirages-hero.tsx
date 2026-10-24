import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useRouteMetadata } from "../../../app/route-metadata";
import { useSiteConfig } from "../../../hooks/useSiteConfig";
import { firstSegmentOf, miragesStaticTitleKey } from "./mirages-routes";

export function MiragesHero() {
  const { t, i18n } = useTranslation();
  const siteConfig = useSiteConfig();
  const [location] = useLocation();
  const metadata = useRouteMetadata();

  const isHome = location === "/";
  const isTagRoute = location.startsWith("/hashtag/");
  const firstSegment = firstSegmentOf(location);
  const staticTitleKey = miragesStaticTitleKey(firstSegment);
  const staticTitle = staticTitleKey ? t(staticTitleKey) : undefined;

  let title: string;
  if (isHome) {
    title = siteConfig.name;
  } else if (metadata) {
    title = metadata.title;
  } else if (isTagRoute) {
    title = decodeURIComponent(location.split("/")[2] || "");
  } else if (staticTitle) {
    title = staticTitle;
  } else {
    title = "";
  }

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "long", day: "numeric" }).format(date);
  };

  const description = isHome ? siteConfig.description : metadata?.description;
  const backgroundImage = isHome ? siteConfig.heroImage || siteConfig.avatar : metadata?.coverImage;
  const articleDetails = metadata?.kind === "post" ? [
    metadata.author,
    metadata.createdAt ? formatDate(metadata.createdAt) : undefined,
    metadata.pv !== undefined ? `${t("count.pv")}: ${metadata.pv}` : undefined,
    metadata.categoryName,
  ].filter(Boolean).join(" • ") : "";

  return (
    <div className="mirages-hero relative flex h-[338px] items-center justify-center overflow-hidden bg-[#1e1e1f] md:h-[445px] md:pt-[60px]" data-cover={backgroundImage ? "true" : "false"}>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: backgroundImage
            ? `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url(${backgroundImage})`
            : undefined,
        }}
      />
      <div className="relative z-10 px-6 text-center">
        <h1 className="text-[28px] font-normal leading-normal text-white md:text-[40px] md:font-light">{title}</h1>
        {description ? (
          <p className="mt-3 text-sm text-neutral-200 md:text-[15px]">{description}</p>
        ) : null}
        {articleDetails ? (
          <p className="mt-3 text-[13px] text-white/90 md:text-[13px]">
            {articleDetails}
          </p>
        ) : null}
      </div>
    </div>
  );
}
