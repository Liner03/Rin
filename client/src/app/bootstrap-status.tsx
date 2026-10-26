import { useTranslation } from "react-i18next";

import { BlogSkeleton } from "./blog-skeleton";

export function BootstrapStatus({ failed }: { failed: boolean }) {
  const { t } = useTranslation();
  if (!failed) return <BlogSkeleton />;
  return (
    <main className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p role={failed ? "alert" : "status"}>{t(failed ? "bootstrap.failed" : "bootstrap.loading")}</p>
      {failed && (
        <button className="rounded border px-4 py-2" onClick={() => window.location.reload()}>
          {t("error.retry")}
        </button>
      )}
    </main>
  );
}
