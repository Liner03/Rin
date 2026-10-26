import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { gravatarUrl } from "../utils/gravatar";

export function GravatarInput({ onChange }: { onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const generate = async () => {
    if (!inputRef.current?.reportValidity()) return;
    setBusy(true);
    setFailed(false);
    try {
      onChange(await gravatarUrl(email));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 space-y-2 border-t border-black/10 pt-4 dark:border-white/10">
      <label htmlFor={id} className="block text-sm font-medium t-primary">{t("settings.site.avatar.gravatar.title")}</label>
      <p id={`${id}-hint`} className="text-sm t-secondary">{t("settings.site.avatar.gravatar.desc")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input ref={inputRef} id={id} type="email" required value={email} disabled={busy}
          aria-describedby={`${id}-hint`} placeholder="you@example.com"
          onChange={(event) => { setEmail(event.target.value); setFailed(false); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void generate(); } }}
          className="min-w-0 flex-1 rounded-xl border border-black/10 bg-w px-4 py-3 text-base t-primary outline-none focus:border-theme focus:ring-2 focus:ring-theme/10 dark:border-white/10" />
        <button type="button" onClick={() => void generate()} disabled={busy || !email.trim()}
          className="rounded-xl bg-theme px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {t("settings.site.avatar.gravatar.button")}
        </button>
      </div>
      {failed && <p role="alert" className="text-sm t-primary">{t("settings.site.avatar.gravatar.failed")}</p>}
    </div>
  );
}
