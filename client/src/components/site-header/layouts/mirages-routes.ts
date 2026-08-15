const MIRAGES_STATIC_TITLE_KEYS: Record<string, string> = {
  timeline: "timeline",
  moments: "moments.title",
  friends: "friends.title",
  hashtags: "hashtags",
  about: "about.title",
  archives: "archives",
  login: "login.title",
  profile: "profile.title",
};

const MIRAGES_LIST_SEGMENTS: string[] = ["timeline", "moments", "friends", "hashtags", "hashtag"];
const MIRAGES_NON_ARTICLE_SEGMENTS: string[] = ["admin", "callback", "user", "search"];
const MIRAGES_STATIC_SEGMENTS = Object.keys(MIRAGES_STATIC_TITLE_KEYS);

export const firstSegmentOf = (location: string) => location.split("/")[1] || "";

function isMiragesStaticSegment(segment: string): boolean {
  return MIRAGES_STATIC_SEGMENTS.includes(segment);
}

export function isMiragesListPage(location: string): boolean {
  return MIRAGES_LIST_SEGMENTS.includes(firstSegmentOf(location));
}

export function isMiragesArticlePage(location: string): boolean {
  const segment = firstSegmentOf(location);
  return (
    segment.length > 0 &&
    !MIRAGES_LIST_SEGMENTS.includes(segment) &&
    !MIRAGES_STATIC_SEGMENTS.includes(segment) &&
    !MIRAGES_NON_ARTICLE_SEGMENTS.includes(segment)
  );
}

export function miragesStaticTitleKey(segment: string): string | undefined {
  return isMiragesStaticSegment(segment) ? MIRAGES_STATIC_TITLE_KEYS[segment] : undefined;
}
