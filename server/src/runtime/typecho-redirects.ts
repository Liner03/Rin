/** Legacy Typecho permalinks; restored media uses the `typecho/` R2 prefix. */
export function typechoRedirectPath(pathname: string): string | null {
  const post = pathname.match(/^\/archives\/([1-9]\d*)\/?$/);
  if (post) return `/feed/${post[1]}`;

  const page = pathname.match(/^\/([^/]+)\.html\/?$/);
  if (page && page[1] !== "index") return `/page/${page[1]}`;

  const tag = pathname.match(/^\/tag\/([^/]+)\/?$/);
  if (tag) return `/hashtag/${tag[1]}`;

  const category = pathname.match(/^\/category\/([^/]+)\/$/);
  if (category) return `/category/${category[1]}`;

  if (/^\/usr\/uploads\/[^/].+/.test(pathname)) {
    return `/api/blob/typecho${pathname}`;
  }

  return null;
}
