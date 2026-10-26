import { useTranslation } from "react-i18next";
import { Button } from "./button";

export function CachedContentError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return <div role="alert" className="wauto mx-auto flex flex-col items-center gap-4 rounded-2xl bg-w p-6">
    <h2 className="text-lg font-medium t-primary">{error}</h2>
    <Button title={t("error.retry")} onClick={onRetry} />
  </div>;
}
