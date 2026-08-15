import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useSiteConfig } from "../../../hooks/useSiteConfig";
import type { SiteNavItem } from "../../../hooks/useSiteConfig";

const DEFAULT_NAV: SiteNavItem[] = [
  { label: "article.title", href: "/" },
  { label: "timeline", href: "/timeline" },
  { label: "moments.title", href: "/moments" },
  { label: "hashtags", href: "/hashtags" },
  { label: "friends.title", href: "/friends" },
  { label: "about.title", href: "/about" },
];

export function NavBar({
  menu,
  onClick,
  itemClassName = "",
}: {
  menu: boolean;
  onClick?: () => void;
  itemClassName?: string;
}) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();

  const customNav = siteConfig.nav;
  const items: Array<{ title: string; href: string; selectedPrefix?: string }> = customNav.length > 0
    ? customNav.map((item) => ({ title: item.label, href: item.href }))
    : DEFAULT_NAV.map((item) => ({
        title: t(item.label),
        href: item.href,
        selectedPrefix: item.href === "/" ? "/feed" : undefined,
      }));

  return (
    <>
      {items.map((item) => (
        <NavItem
          key={item.href}
          menu={menu}
          onClick={onClick}
          itemClassName={itemClassName}
          title={item.title}
          selected={
            item.href === "/"
              ? location === "/" || location.startsWith("/feed")
              : location === item.href || location.startsWith(item.href + "/") || (item.selectedPrefix ? location.startsWith(item.selectedPrefix) : false)
          }
          href={item.href}
        />
      ))}
    </>
  );
}

function NavItem({
  menu,
  title,
  selected,
  href,
  when = true,
  onClick,
  itemClassName = "",
}: {
  title: string;
  selected: boolean;
  href: string;
  menu?: boolean;
  when?: boolean;
  onClick?: () => void;
  itemClassName?: string;
}) {
  return when ? (
    <Link
      href={href}
      className={`${menu ? "" : "hidden"} md:block cursor-pointer hover:text-theme duration-300 px-2 py-4 md:p-4 text-sm ${
        selected ? "text-theme" : "dark:text-white"
      } ${itemClassName}`}
      state={{ animate: true }}
      onClick={onClick}
    >
      {title}
    </Link>
  ) : null;
}
