import { lazy, Suspense, type ReactNode } from "react";
import { useContext } from "react";
import type { DefaultParams, PathPattern } from "wouter";
import { Route, Switch } from "wouter";
import { AdminLayout } from "../components/admin-layout";
import Footer from "../components/footer";
import { Header } from "../components/header";
import { Padding } from "../components/padding";
import { getHeaderLayoutDefinition } from "../components/site-header/layout-registry";
import { Tips, TipsPage } from "../components/tips";
import useTableOfContents from "../hooks/useTableOfContents";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { ErrorPage } from "../page/error";
import { FeedPage, TOCHeader } from "../page/feed";
import { FeedsPage } from "../page/feeds";
import { LoginPage } from "../page/login";
import { ProfileContext } from "../state/profile";
import { tryInt } from "../utils/int";
import { useTranslation } from "react-i18next";

// 非首屏页面懒加载，避免写作编辑器（Monaco/mermaid）等进入公共 bundle
const AdminCategoriesPage = lazy(() => import("../page/admin-categories").then((m) => ({ default: m.AdminCategoriesPage })));
const AdminPagesPage = lazy(() => import("../page/admin-pages").then((m) => ({ default: m.AdminPagesPage })));
const CallbackPage = lazy(() => import("../page/callback").then((m) => ({ default: m.CallbackPage })));
const CategoryPage = lazy(() => import("../page/category").then((m) => ({ default: m.CategoryPage })));
const CompatTasksPage = lazy(() => import("../page/compat-tasks").then((m) => ({ default: m.CompatTasksPage })));
const FriendsPage = lazy(() => import("../page/friends").then((m) => ({ default: m.FriendsPage })));
const HashtagPage = lazy(() => import("../page/hashtag").then((m) => ({ default: m.HashtagPage })));
const HashtagsPage = lazy(() => import("../page/hashtags").then((m) => ({ default: m.HashtagsPage })));
const HealthPage = lazy(() => import("../page/health").then((m) => ({ default: m.HealthPage })));
const MomentsPage = lazy(() => import("../page/moments").then((m) => ({ default: m.MomentsPage })));
const PageDetail = lazy(() => import("../page/page-detail").then((m) => ({ default: m.PageDetail })));
const ProfilePage = lazy(() => import("../page/profile").then((m) => ({ default: m.ProfilePage })));
const QueueStatusPage = lazy(() => import("../page/queue-status").then((m) => ({ default: m.QueueStatusPage })));
const SearchPage = lazy(() => import("../page/search").then((m) => ({ default: m.SearchPage })));
const Settings = lazy(() => import("../page/settings").then((m) => ({ default: m.Settings })));
const TimelinePage = lazy(() => import("../page/timeline").then((m) => ({ default: m.TimelinePage })));
const WritingPage = lazy(() => import("../page/writing").then((m) => ({ default: m.WritingPage })));

export function AppRoutes() {
  const { t } = useTranslation();

  return (
    <Switch>
      <AppRoute path="/">
        <FeedsPage />
      </AppRoute>

      <AppRoute path="/timeline">
        <TimelinePage />
      </AppRoute>

      <AppRoute path="/moments">
        <MomentsPage />
      </AppRoute>

      <AppRoute path="/friends">
        <FriendsPage />
      </AppRoute>

      <AppRoute path="/hashtags">
        <HashtagsPage />
      </AppRoute>

      <AppRoute path="/hashtag/:name">
        {(params) => <HashtagPage name={params.name || ""} />}
      </AppRoute>

      <AppRoute path="/category/:slug">
        {(params) => <CategoryPage slug={params.slug || ""} />}
      </AppRoute>

      <AppRoute path="/page/:slug">
        {(params) => <PageDetail slug={params.slug || ""} />}
      </AppRoute>

      <AppRoute path="/search/:keyword">
        {(params) => <SearchPage keyword={params.keyword || ""} />}
      </AppRoute>

      <AdminRoute path="/admin/settings" requirePermission title={t("settings.title")} description={t("admin.settings_description")}>
        <Settings />
      </AdminRoute>

      <AdminRoute path="/admin/health" requirePermission title={t("health.title")} description={t("admin.health_description")}>
        <HealthPage />
      </AdminRoute>

      <AdminRoute path="/admin/queue-status" requirePermission title={t("queue_status.title")} description={t("admin.queue_status_description")}>
        <QueueStatusPage />
      </AdminRoute>

      <AdminRoute path="/admin/compat-tasks" requirePermission title={t("compat_tasks.title")} description={t("admin.compat_tasks_description")}>
        <CompatTasksPage />
      </AdminRoute>

      <AdminRoute path="/admin/writing" requirePermission title={t("writing")} description={t("admin.writing_description")}>
        <WritingPage />
      </AdminRoute>

      <AdminRoute path="/admin/writing/:id" requirePermission title={t("writing")} description={t("admin.writing_description")}>
        {({ id }) => <WritingPage id={tryInt(0, id)} />}
      </AdminRoute>

      <AdminRoute path="/admin/pages" requirePermission title={t("pages.title")} description={t("admin.pages_description")}>
        <AdminPagesPage />
      </AdminRoute>

      <AdminRoute path="/admin/categories" requirePermission title={t("categories.title")} description={t("admin.categories_description")}>
        <AdminCategoriesPage />
      </AdminRoute>

      <AppRoute path="/callback">
        <CallbackPage />
      </AppRoute>

      <AppRoute path="/login">
        <LoginPage />
      </AppRoute>

      <AppRoute path="/profile">
        <ProfilePage />
      </AppRoute>

      <TocRoute path="/feed/:id">
        {(params, toc) => <FeedPage id={params.id || ""} TOC={toc} />}
      </TocRoute>

      <TocRoute path="/:alias">
        {(params, toc) => <FeedPage id={params.alias || ""} TOC={toc} />}
      </TocRoute>

      <AppRoute path="/user/github">
        <TipsPage>
          <Tips value={t("error.api_url")} type="error" />
        </TipsPage>
      </AppRoute>

      <AppRoute path="/*/user/github">
        <TipsPage>
          <Tips value={t("error.api_url_slash")} type="error" />
        </TipsPage>
      </AppRoute>

      <AppRoute path="/user/github/callback">
        <TipsPage>
          <Tips value={t("error.github_callback")} type="error" />
        </TipsPage>
      </AppRoute>

      <AppRoute>
        <ErrorPage error={t("error.not_found")} />
      </AppRoute>
    </Switch>
  );
}

function AppRoute({
  path,
  children,
  headerComponent,
  paddingClassName,
  requirePermission,
}: {
  path?: PathPattern;
  children: ReactNode | ((params: DefaultParams) => ReactNode);
  headerComponent?: ReactNode;
  paddingClassName?: string;
  requirePermission?: boolean;
}) {
  const profile = useContext(ProfileContext);
  const siteConfig = useSiteConfig();
  const { t } = useTranslation();

  const content =
    requirePermission && !profile?.permission ? <ErrorPage error={t("error.permission_denied")} /> : children;

  return (
    <Route path={path}>
      {(params) => {
        const resolvedContent = typeof content === "function" ? content(params) : content;
        const layoutDefinition = getHeaderLayoutDefinition(siteConfig.headerLayout);

        return layoutDefinition.renderRouteShell({
          header: <Header>{headerComponent}</Header>,
          content: <Padding className={paddingClassName}><Suspense fallback={<div className="min-h-[40vh]" />}>{resolvedContent}</Suspense></Padding>,
          footer: <Footer />,
          paddingClassName,
        });
      }}
    </Route>
  );
}

function AdminRoute({
  path,
  children,
  requirePermission,
  title,
  description,
}: {
  path: PathPattern;
  children: ReactNode | ((params: DefaultParams) => ReactNode);
  requirePermission?: boolean;
  title: string;
  description: string;
}) {
  const profile = useContext(ProfileContext);
  const { t } = useTranslation();
  const content =
    requirePermission && !profile?.permission ? <ErrorPage error={t("error.permission_denied")} /> : children;

  return (
    <Route path={path}>
      {(params) => (
        <AdminLayout title={title} description={description}>
          <Suspense fallback={<div className="min-h-[40vh]" />}>
            {typeof content === "function" ? content(params) : content}
          </Suspense>
        </AdminLayout>
      )}
    </Route>
  );
}

function TocRoute({
  path,
  children,
}: {
  path: PathPattern;
  children: (params: DefaultParams, toc: ReactNode) => ReactNode;
}) {
  const { TOC } = useTableOfContents(".toc-content");

  return (
    <AppRoute path={path} headerComponent={TOCHeader({ TOC })} paddingClassName="mx-4">
      {(params) => children(params, TOC)}
    </AppRoute>
  );
}
