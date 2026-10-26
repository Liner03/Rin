import type { Comment, Feed } from "@rin/api";
import type { ReactNode } from "react";
import { useContext, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { Trans, useTranslation } from "react-i18next";
import { Modal } from "@rin/ui";
import Popup from "reactjs-popup";
import { Link, useLocation } from "wouter";
import { ContentAvatar } from "../components/content-avatar";
import { useAlert, useConfirm } from "../components/dialog";
import { HashTag } from "../components/hashtag";
import { Waiting } from "../components/loading";
import { Markdown, preloadMarkdown } from "../components/markdown";
import { client } from "../app/runtime";
import { usePublishRouteMetadata } from "../app/route-metadata";
import { ClientConfigContext } from "../state/config";
import { ProfileContext } from "../state/profile";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { siteName } from "../utils/constants";
import { timeago } from "../utils/timeago";
import { Button } from "../components/button";
import { Input } from "../components/input";
import { Tips } from "../components/tips";
import { AdjacentSection } from "../components/adjacent_feed.tsx";
import { extractFirstMarkdownImageUrl } from "../utils/image-upload";
import { isTransientContentError } from "../api/public-content-cache";
import { useCachedContent } from "../hooks/use-cached-content";

export function FeedPage({ id, TOC }: { id: string, TOC: ReactNode }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const profile = useContext(ProfileContext);
  const [feed, setFeed] = useState<Feed | undefined>(() => client.feed.getCached(id));
  const [error, setError] = useState<{ message: string; retryable: boolean }>();
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const request = useRef<{ id: string; version: number; promise: ReturnType<typeof client.feed.get> }>();
  const [, setLocation] = useLocation();
  const { showAlert, AlertUI } = useAlert();
  const { showConfirm, ConfirmUI } = useConfirm();
  const [top, setTop] = useState<number>(0);
  const config = useContext(ClientConfigContext);
  const counterEnabled = config.getBoolean('counter.enabled');
  const hasAISummary = Boolean(feed?.ai_summary?.trim());
  const showAISummaryState = feed?.ai_summary_status === "pending" || feed?.ai_summary_status === "processing" || feed?.ai_summary_status === "failed";
  const hashtags = Array.isArray(feed?.hashtags) ? feed.hashtags : [];
  const headImage = feed?.cover || extractFirstMarkdownImageUrl(feed?.content ?? "");
  usePublishRouteMetadata(feed ? {
    kind: "post",
    title: feed.title ?? "",
    coverImage: headImage,
    author: feed.user?.username,
    createdAt: feed.createdAt,
    categoryName: feed.categories?.[0]?.name || hashtags[0]?.name,
    pv: counterEnabled ? feed.pv : undefined,
  } : error ? { kind: "error", title: t("error.title") } : undefined);
  function deleteFeed() {
    // Confirm
    showConfirm(
      t("article.delete.title"),
      t("article.delete.confirm"),
      () => {
        if (!feed) return;
        client.feed
          .delete(feed.id)
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(t("delete.success"));
              setLocation("/");
            }
          });
      })
  }
  function topFeed() {
    const isUnTop = !(top > 0)
    const topNew = isUnTop ? 1 : 0;
    // Confirm
    showConfirm(
      isUnTop ? t("article.top.title") : t("article.untop.title"),
      isUnTop ? t("article.top.confirm") : t("article.untop.confirm"),
      () => {
        if (!feed) return;
        client.feed
          .setTop(feed.id, topNew)
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(isUnTop ? t("article.top.success") : t("article.untop.success"));
              setTop(topNew);
            }
          });
      })
  }
  useEffect(() => {
    let cancelled = false;
    const cached = client.feed.getCached(id);
    setFeed(cached);
    setTop(cached?.top || 0);
    setError(undefined);
    setPassword("");
    setUnlockError("");
    preloadMarkdown().catch((error) => console.error("Failed to preload Markdown", error));
    // Reuse this load during StrictMode's effect replay; an unlock starts a new version.
    if (!request.current || request.current.id !== id || request.current.version !== reloadVersion) {
      request.current = { id, version: reloadVersion, promise: client.feed.get(id) };
    }
    function restoreCachedFeed() {
      // Another tab may have populated the cache after this page began loading.
      const fallback = client.feed.getCached(id);
      if (!fallback) return false;
      setFeed(fallback);
      setTop(fallback.top || 0);
      setError(undefined);
      return true;
    }
    request.current.promise
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          if (isTransientContentError(error.status) && restoreCachedFeed()) return;
          setFeed(undefined);
          setError({
            message: error.value,
            retryable: isTransientContentError(error.status),
          });
        } else if (data && typeof data !== "string") {
          setFeed(data);
          setTop(data.top || 0);
        } else {
          setFeed(undefined);
          setError({ message: "Not found", retryable: false });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && !restoreCachedFeed()) {
          setFeed(undefined);
          setError({ message: error instanceof Error ? error.message : String(error), retryable: true });
        }
      });
    return () => { cancelled = true; };
  }, [id, reloadVersion]);
  async function unlock() {
    if (!feed) return;
    const { error } = await client.feed.unlock(feed.id, password);
    if (error) {
      setUnlockError(error.value as string);
    } else {
      setUnlockError("");
      setReloadVersion((version) => version + 1);
    }
  }
  return (
    <Waiting for={feed || error}>
      {feed && (
        <Helmet>
          <title>{`${feed.title ?? "Unnamed"} - ${siteConfig.name}`}</title>
          <meta property="og:site_name" content={siteName} />
          <meta property="og:title" content={feed.title ?? ""} />
          <meta property="og:image" content={headImage ?? siteConfig.avatar} />
          <meta property="og:type" content="article" />
          <meta property="og:url" content={document.URL} />
          <meta
            name="og:description"
            content={
              feed.content.length > 200
                ? feed.content.substring(0, 200)
                : feed.content
            }
          />
          <meta name="author" content={feed.user?.username ?? ""} />
          <meta
            name="keywords"
            content={[siteConfig.keywords, hashtags.map(({ name }) => name).join(", ")].filter(Boolean).join(", ")}
          />
          <meta
            name="description"
            content={
              feed.content.length > 200
                ? feed.content.substring(0, 200)
                : feed.content
            }
          />
        </Helmet>
      )}
      <div className="w-full flex flex-row justify-center ani-show">
        {error && (
          <>
            <div className="flex flex-col wauto rounded-2xl bg-w m-2 p-6 items-center justify-center space-y-2">
              <h1 className="text-xl font-bold t-primary">{error.message === "Request timed out" ? t("error.request_timeout") : error.message}</h1>
              {error.message === "Not found" && id === "about" && (
                <Tips value={t("about.notfound")} />
              )}
              {error.retryable && (
                <Button title={t("error.retry")} onClick={() => setReloadVersion((version) => version + 1)} />
              )}
              <Button
                title={t("index.back")}
                onClick={() => (window.location.href = "/")}
              />
            </div>
          </>
        )}
        {feed && !error && feed.locked && (
          <div className="flex flex-col wauto rounded-2xl bg-w m-2 p-8 items-center justify-center space-y-3 text-center">
            <h1 className="text-xl font-bold t-primary">{feed.title}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("password_required")}</p>
            <Input value={password} setValue={setPassword} placeholder={t("password")} type="password" variant="flat" className="w-full max-w-xs" />
            {unlockError && <p className="text-sm text-red-500">{unlockError}</p>}
            <Button title={t("unlock")} onClick={unlock} />
          </div>
        )}
        {feed && !error && !feed.locked && (
          <>
            <div className="xl:w-64" />
            <main className="wauto">
              <article
                className="rounded-2xl bg-w m-2 px-6 py-4"
                aria-label={feed.title ?? "Unnamed"}
              >
                <div className="flex justify-between">
                  <div>
                    <div className="mt-1 mb-1 flex gap-1">
                      <p
                        className="text-gray-400 text-[12px]"
                        title={new Date(feed.createdAt).toLocaleString()}
                      >
                        {t("feed_card.published$time", {
                          time: timeago(feed.createdAt),
                        })}
                      </p>

                      {feed.createdAt !== feed.updatedAt && (
                        <p
                          className="text-gray-400 text-[12px]"
                          title={new Date(feed.updatedAt).toLocaleString()}
                        >
                          {t("feed_card.updated$time", {
                            time: timeago(feed.updatedAt),
                          })}
                        </p>
                      )}
                    </div>
                    {counterEnabled && <p className='text-[12px] text-gray-400 font-normal link-line'>
                      <span> {t("count.pv")} </span>
                      <span>
                        {feed.pv}
                      </span>
                      <span> |</span>
                      <span> {t("count.uv")} </span>
                      <span>
                        {feed.uv}
                      </span>
                    </p>}
                    <div className="flex flex-row items-center">
                      <h1 className="text-2xl font-bold t-primary break-all">
                        {feed.title}
                      </h1>
                      <div className="flex-1 w-0" />
                    </div>
                  </div>
                  <div className="pt-2">
                    {profile?.permission && (
                      <div className="flex gap-2">
                        <button
                          aria-label={top > 0 ? t("untop.title") : t("top.title")}
                          onClick={topFeed}
                          className={`flex-1 flex flex-col items-end justify-center px-2 py rounded-full transition ${top > 0 ? "bg-theme text-white hover:bg-theme-hover active:bg-theme-active" : "bg-secondary bg-button dark:text-neutral-400"}`}
                        >
                          <i className="ri-skip-up-line" />
                        </button>
                        <Link
                          aria-label={t("edit")}
                          href={`/admin/writing/${feed.id}`}
                          className="flex-1 flex flex-col items-end justify-center px-2 py bg-secondary bg-button rounded-full transition"
                        >
                          <i className="ri-edit-2-line dark:text-neutral-400" />
                        </Link>
                        <button
                          aria-label={t("delete.title")}
                          onClick={deleteFeed}
                          className="flex-1 flex flex-col items-end justify-center px-2 py bg-secondary bg-button rounded-full transition"
                        >
                          <i className="ri-delete-bin-7-line text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {(hasAISummary || showAISummaryState) && (
                  <div className="my-4 p-4 rounded-xl bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-100 dark:border-purple-800/30">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <i className="ri-sparkling-2-fill text-purple-500" />
                        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                          {t('ai_summary.title')}
                        </span>
                      </div>
                      {showAISummaryState ? (
                        <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-white/10 dark:text-purple-300">
                          {t(`ai_summary.status.${feed.ai_summary_status}`)}
                        </span>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed t-secondary [overflow-wrap:anywhere]">
                      {hasAISummary ? feed.ai_summary : t(`ai_summary.message.${feed.ai_summary_status}`)}
                    </p>
                    {feed.ai_summary_status === "failed" && feed.ai_summary_error ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-rose-600 dark:text-rose-300 [overflow-wrap:anywhere]">
                        {feed.ai_summary_error}
                      </p>
                    ) : null}
                  </div>
                )}
                <Markdown content={feed.content} />
                {siteConfig.headerLayout === "mirages" && (
                  <p className="mirages-copyright">
                    <Trans
                      i18nKey="mirages.copyright"
                      values={{ title: feed.title, username: feed.user?.username ?? t("anonymous"), url: document.URL }}
                      components={{
                        titleLink: <a href={document.URL} />,
                        urlLink: <a href={document.URL} />,
                      }}
                    />
                  </p>
                )}
                <div className="mt-6 flex flex-col gap-2">
                  {hashtags.length > 0 && (
                    <div className="flex flex-row flex-wrap gap-x-2">
                      {hashtags.map(({ name }, index) => (
                        <HashTag key={index} name={name} />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-row items-center">
                    <ContentAvatar
                      src={feed.user?.avatar}
                      name={feed.user?.username || t("anonymous")}
                      className="w-8 h-8 text-sm"
                    />
                    <div className="ml-2">
                      <span className="text-gray-400 text-sm cursor-default">
                        {feed.user?.username}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
              {id !== "about" && <AdjacentSection id={id} />}
              {feed && <Comments id={`${feed.id}`} />}
              <div className="h-16" />
            </main>
            {TOC && (
              <div className="w-80 hidden lg:block relative">
                <div
                  className={`start-0 end-0 top-[5.5rem] sticky`}
                >
                  {TOC}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <AlertUI />
      <ConfirmUI />
    </Waiting>
  );
}

export function TOCHeader({ TOC }: { TOC: ReactNode }) {
  const [isOpened, setIsOpened] = useState(false);

  if (!TOC) {
    return null;
  }

  return (
    <div className="shrink-0 lg:hidden">
      <button
        onClick={() => setIsOpened(true)}
        className="w-10 h-10 rounded-full flex flex-row items-center justify-center"
      >
        <i className="ri-menu-2-line text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 ri-lg md:ri-sm md:t-secondary"></i>
      </button>
      <Modal
        isOpen={isOpened}
        onRequestClose={() => setIsOpened(false)}
        contentLabel="Table of contents"
        size="lg"
        panelClassName="p-4"
      >
        <div className="w-[80vw] sm:w-[60vw] lg:w-[40vw] overflow-clip relative t-primary">
          {TOC}
        </div>
      </Modal>
    </div>
  );
}

const commentFieldClass = "w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-sm t-primary outline-none transition-colors placeholder:text-neutral-500 focus:border-black/40 focus:ring-2 focus:ring-theme/60 dark:border-white/15 dark:placeholder:text-neutral-400 dark:focus:border-white/40 dark:focus:ring-theme/70";

function CommentInput({
  id,
  onRefresh,
}: {
  id: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestWebsite, setGuestWebsite] = useState("");
  const [moreOpen, setMoreOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const successTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    return () => {
      window.clearTimeout(successTimer.current);
    };
  }, []);
  const profile = useContext(ProfileContext);
  const [, setLocation] = useLocation();
  const config = useContext(ClientConfigContext);
  // guest comments enabled by default; admin can disable via client config `comment.guest.enabled=false`
  const rawGuest = config.get('comment.guest.enabled');
  const guestEnabled = rawGuest !== false && rawGuest !== 'false';
  function errorHumanize(error: string) {
    if (error === "Unauthorized") return t("login.required");
    else if (error === "Content is required") return t("comment.empty");
    else if (error === "Guest name is required") return t("comment.guest_name_required");
    return error;
  }
  function showSuccess() {
    setSuccess(true);
    window.clearTimeout(successTimer.current);
    successTimer.current = window.setTimeout(() => setSuccess(false), 2500);
  }
  function submit() {
    if (submitting) return;
    if (!content.trim()) {
      setError(t("comment.empty"));
      return;
    }
    setSubmitting(true);
    setError("");
    if (profile) {
      client.comment
        .create(parseInt(id), { content })
        .then(({ error }) => {
          if (error) {
            setError(errorHumanize(error.value as string));
            setSubmitting(false);
          } else {
            setContent("");
            setSubmitting(false);
            showSuccess();
            onRefresh();
          }
        });
    } else if (guestEnabled) {
      if (!guestName.trim()) {
        setError(t("comment.guest_name_required"));
        setSubmitting(false);
        return;
      }
      if (guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
        setError(t("comment.email_invalid"));
        setSubmitting(false);
        return;
      }
      client.comment
        .create(parseInt(id), {
          content,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || undefined,
          guestWebsite: guestWebsite.trim() || undefined,
        })
        .then(({ error }) => {
          if (error) {
            setError(errorHumanize(error.value as string));
            setSubmitting(false);
          } else {
            setContent("");
            setGuestName("");
            setGuestEmail("");
            setGuestWebsite("");
            setSubmitting(false);
            showSuccess();
            onRefresh();
          }
        });
    } else {
      setLocation('/login');
    }
  }
  return (
    <div className="w-full pt-6">
      {profile ? (
        <div className="flex flex-col">
          <textarea
            id="comment"
            aria-label={t("comment.placeholder.title")}
            placeholder={t("comment.placeholder.title")}
            className={`${commentFieldClass} h-24 resize-y`}
            value={content}
            onChange={(e) => { setContent(e.target.value); setError(""); }}
          />
          <div className="mt-3 flex items-center justify-end gap-3">
            {success && <p aria-live="polite" className="text-[13px] font-medium text-theme">{t("comment.success")}</p>}
            {error && <p role="alert" className="text-[13px] text-red-500">{error}</p>}
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="min-h-11 rounded-xl bg-theme-hover px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-theme-active active:bg-theme-active disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("comment.submit")}
            </button>
          </div>
        </div>
      ) : guestEnabled ? (
        <div className="flex flex-col">
          <input
            id="guest-name"
            type="text"
            aria-label={t("comment.guest_name_placeholder")}
            placeholder={t("comment.guest_name_placeholder")}
            className={commentFieldClass}
            value={guestName}
            onChange={(e) => { setGuestName(e.target.value); setError(""); }}
          />
          {moreOpen && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                aria-label={t("comment.guest_email_placeholder")}
                placeholder={t("comment.guest_email_placeholder")}
                className={commentFieldClass}
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
              <input
                type="url"
                aria-label={t("comment.guest_website_placeholder")}
                placeholder={t("comment.guest_website_placeholder")}
                className={commentFieldClass}
                value={guestWebsite}
                onChange={(e) => setGuestWebsite(e.target.value)}
              />
            </div>
          )}
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            className="-mx-2 mt-2 self-start px-2 py-1.5 text-[13px] text-neutral-500 transition-colors hover:text-theme dark:text-neutral-400 dark:hover:text-theme"
          >
            {moreOpen ? t("comment.less_options") : t("comment.more_options")}
          </button>
          <textarea
            id="comment"
            aria-label={t("comment.placeholder.title")}
            placeholder={t("comment.placeholder.title")}
            className={`${commentFieldClass} mt-3 h-24 resize-y`}
            value={content}
            onChange={(e) => { setContent(e.target.value); setError(""); }}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
              {t("comment.email_hint")} ·{" "}
              <button
                type="button"
                onClick={() => setLocation('/login')}
                className="-mx-1.5 px-1.5 py-1 transition-colors hover:text-theme"
              >
                {t("comment.login_link")}
              </button>
            </p>
            <div className="flex items-center gap-3">
              {success && <p aria-live="polite" className="text-[13px] font-medium text-theme">{t("comment.success")}</p>}
              {error && <p role="alert" className="text-[13px] text-red-500">{error}</p>}
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="min-h-11 rounded-xl bg-theme-hover px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-theme-active active:bg-theme-active disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("comment.submit")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("comment.login_hint")}</p>
          <button
            type="button"
            onClick={() => setLocation('/login')}
            className="rounded-xl bg-theme px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-theme-hover active:bg-theme-active"
          >
            {t("login.required")}
          </button>
        </div>
      )}
    </div>
  );
}

function Comments({ id }: { id: string }) {
  const config = useContext(ClientConfigContext);
  const feedId = Number(id);
  const { data, loading, error, reload: loadComments } = useCachedContent({
    key: `comments:${id}`,
    enabled: config.getBoolean("comment.enabled") && Number.isSafeInteger(feedId),
    getCached: () => client.comment.getCached(feedId),
    load: () => client.comment.list(feedId),
  });
  const comments = Array.isArray(data) ? data : [];
  const { t } = useTranslation();
  return (
    <>
      {config.getBoolean('comment.enabled') &&
        <section className="mx-auto w-full max-w-[642px]" aria-label={t("comment.title")}>
          <div className="flex items-center gap-3 border-t border-dashed border-black/10 pt-6 dark:border-white/10">
            <h2 className="text-[15px] font-semibold t-primary">
              {t("comment.count", { count: comments.length })}
            </h2>
          </div>
          {error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-red-500">{error}</p>
              <button
                type="button"
                onClick={loadComments}
                className="rounded-xl border border-black/10 px-4 py-1.5 text-sm t-primary transition-colors hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/5"
              >
                {t("reload")}
              </button>
            </div>
          )}
          {!loading && !error && comments.length === 0 && (
            <p className="py-6 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
              {t("comment.empty_state")}
            </p>
          )}
          {comments.length > 0 && (
            <div className="w-full divide-y divide-dashed divide-black/10 dark:divide-white/10">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onRefresh={loadComments}
                />
              ))}
            </div>
          )}
          <CommentInput id={id} onRefresh={loadComments} />
        </section>
      }
    </>
  );
}

function CommentItem({
  comment,
  onRefresh,
}: {
  comment: Comment;
  onRefresh: () => void;
}) {
  const { showConfirm, ConfirmUI } = useConfirm();
  const { showAlert, AlertUI } = useAlert();
  const { t } = useTranslation();
  const profile = useContext(ProfileContext);
  const commenterName = comment.user?.username || comment.guestName || t("anonymous");
  function deleteComment() {
    showConfirm(
      t("delete.comment.title"),
      t("delete.comment.confirm"),
      async () => {
        client.comment
          .delete(comment.id)
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              onRefresh();
            }
          });
      })
  }
  return (
    <div className="flex flex-row items-start gap-3 py-4">
      <ContentAvatar
        src={comment.user?.avatar}
        name={commenterName}
        className="mt-0.5 h-9 w-9 shrink-0 text-sm"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-row items-center gap-2">
          <span className="text-sm font-medium t-primary">
            {commenterName}
          </span>
          {comment.guestWebsite && (
            <a
              href={comment.guestWebsite}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={commenterName}
              className="text-neutral-500 transition-colors hover:text-theme dark:text-neutral-400"
            >
              <i className="ri-external-link-line text-sm"></i>
            </a>
          )}
          <span
            title={new Date(comment.createdAt).toLocaleString()}
            className="text-xs text-neutral-500 dark:text-neutral-400"
          >
            {timeago(comment.createdAt)}
          </span>
          <div className="flex-1 w-0" />
          {(profile?.permission || (comment.user && profile?.id == comment.user.id)) && (
            <Popup
              arrow={false}
              trigger={
                <button
                  type="button"
                  aria-label={t("comment.actions")}
                  className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-secondary hover:text-theme dark:text-neutral-400"
                >
                  <i className="ri-more-fill text-base"></i>
                </button>
              }
              position="left center"
            >
              <div className="flex flex-row self-end mr-2">
                <button
                  onClick={deleteComment}
                  aria-label={t("delete.comment.title")}
                  className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                >
                  <i className="ri-delete-bin-2-line text-base"></i>
                </button>
              </div>
            </Popup>
          )}
        </div>
        <p className="mt-1 break-words text-[14px] leading-6 t-primary">{comment.content}</p>
      </div>
      <ConfirmUI />
      <AlertUI />
    </div>
  );
}
