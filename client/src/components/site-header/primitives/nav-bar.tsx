import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { DEFAULT_NAV, useSiteConfig } from "../../../hooks/useSiteConfig";

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
  const items = customNav.length > 0
    ? customNav.map((item) => ({ title: item.label, href: item.href, selectedPrefix: undefined }))
    : DEFAULT_NAV.map((item) => ({
        title: t(item.label),
        href: item.href,
        selectedPrefix: item.selectedPrefix,
      }));

  return (
    <>
      {items.map((item, index) => (
        <NavItem
          key={`${item.href}#${index}`}
          menu={menu}
          onClick={onClick}
          itemClassName={itemClassName}
          title={item.title}
          selected={isNavSelected(location, item.href, item.selectedPrefix)}
          href={item.href}
        />
      ))}
    </>
  );
}

function isNavSelected(location: string, href: string, selectedPrefix?: string) {
  if (href === "/") {
    return location === "/" || location.startsWith("/feed");
  }
  return location === href || location.startsWith(href + "/") || (selectedPrefix ? location.startsWith(selectedPrefix) : false);
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
