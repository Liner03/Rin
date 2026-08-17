import { Link, useLocation } from "wouter";
import { useSiteNavItems } from "../../../hooks/useSiteConfig";

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
  const items = useSiteNavItems();

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
      className={`${menu ? "" : "hidden"} md:block cursor-pointer hover:text-theme px-2 py-4 md:p-4 text-sm ${
        selected ? "text-theme" : "text-neutral-700 dark:text-white"
      } ${itemClassName}`}
      onClick={onClick}
    >
      {title}
    </Link>
  ) : null;
}
