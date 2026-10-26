import { useTranslation } from "react-i18next";

function SkeletonPost({ cover = false }: { cover?: boolean }) {
  return (
    <div className="blog-skeleton-post" aria-hidden="true">
      {cover && <div className="feed-skeleton-cover" />}
      <div className="blog-skeleton-line blog-skeleton-post-title" />
      <div className="blog-skeleton-line blog-skeleton-meta" />
      <div className="blog-skeleton-line" />
      <div className="blog-skeleton-line blog-skeleton-short" />
    </div>
  );
}

export function BlogSkeleton() {
  const { t } = useTranslation();
  return (
    <main className="blog-skeleton" role="status" aria-label={t("bootstrap.loading")} aria-busy="true">
      <div aria-hidden="true">
        <div className="blog-skeleton-nav">
          <div className="blog-skeleton-line blog-skeleton-brand" />
          <div className="blog-skeleton-menu"><div className="blog-skeleton-line" /><div className="blog-skeleton-line" /><div className="blog-skeleton-line" /></div>
        </div>
        <div className="blog-skeleton-hero">
          <div className="blog-skeleton-line blog-skeleton-title" />
          <div className="blog-skeleton-line blog-skeleton-description" />
        </div>
        <div className="blog-skeleton-content"><SkeletonPost /><SkeletonPost /></div>
      </div>
    </main>
  );
}

export function FeedListSkeleton({ layout, variant }: { layout: string; variant: string }) {
  const { t } = useTranslation();
  return (
    <div className="wauto feed-skeleton" data-layout={layout} role="status" aria-label={t("bootstrap.loading")} aria-busy="true">
      <div className="feed-skeleton-grid">
        {[0, 1, 2].map((index) => <SkeletonPost key={index} cover={variant === "mirages"} />)}
      </div>
    </div>
  );
}
