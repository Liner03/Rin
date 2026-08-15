import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FlatPanel, Input } from "@rin/ui";
import { client } from "../app/runtime";
import { useAlert } from "../components/dialog";
import { MarkdownEditor } from "../components/markdown_editor";
import type { Page } from "@rin/api";

export function AdminPagesPage() {
  const { t } = useTranslation();
  const { showAlert, AlertUI } = useAlert();
  const [pages, setPages] = useState<Page[]>([]);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [password, setPassword] = useState("");
  const [order, setOrder] = useState(0);
  const [parent, setParent] = useState(0);
  const [status, setStatus] = useState<"publish" | "draft" | "hidden" | "private">("publish");

  const loadPages = useCallback(async () => {
    const { data } = await client.page.list();
    if (data) setPages(data);
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  function resetForm() {
    setEditingId(undefined);
    setTitle("");
    setSlug("");
    setContent("");
    setPassword("");
    setOrder(0);
    setParent(0);
    setStatus("publish");
  }

  async function save() {
    if (!title.trim()) {
      showAlert(t("title_empty"));
      return;
    }
    if (!content.trim()) {
      showAlert(t("content.empty"));
      return;
    }
    const body = {
      title,
      slug: slug || undefined,
      content,
      password: password || undefined,
      order,
      parent,
      status,
    };
    const { error } = editingId
      ? await client.page.update(editingId, body)
      : await client.page.create(body);
    if (error) {
      showAlert(error.value as string);
    } else {
      showAlert(t("update.success"), () => {
        resetForm();
        loadPages();
      });
    }
  }

  async function remove(page: Page) {
    const { error } = await client.page.delete(page.id);
    if (error) {
      showAlert(error.value as string);
    } else {
      loadPages();
    }
  }

  function edit(page: Page) {
    setEditingId(page.id);
    setTitle(page.title);
    setSlug(page.slug || "");
    setContent(page.content);
    setPassword("");
    setOrder(page.order);
    setParent(page.parent);
    setStatus(page.status);
  }

  return (
    <div className="flex flex-col gap-4">
      <FlatPanel className="p-4">
        <p className="text-sm font-semibold t-primary">{editingId ? t("update.title") : t("publish.title")}</p>
        <div className="mt-4 flex flex-col gap-3">
          <Input value={title} setValue={setTitle} placeholder={t("title")} variant="flat" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input value={slug} setValue={setSlug} placeholder={t("alias")} variant="flat" />
            <Input value={password} setValue={setPassword} placeholder={t("password")} variant="flat" />
            <Input value={String(order)} setValue={(v) => setOrder(parseInt(v) || 0)} placeholder={t("pages.order")} variant="flat" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm t-primary">
              <input
                type="checkbox"
                checked={status === "draft"}
                onChange={(e) => setStatus(e.target.checked ? "draft" : "publish")}
                className="h-3.5 w-3.5 rounded border-neutral-300 text-theme focus:ring-theme"
              />
              {t("draft")}
            </label>
            <select
              value={parent}
              onChange={(e) => setParent(parseInt(e.target.value) || 0)}
              className="rounded-xl border border-black/10 bg-secondary px-3 py-2 text-sm t-primary dark:border-white/10"
            >
              <option value={0}>{t("pages.no_parent")}</option>
              {pages.filter((p) => p.id !== editingId).map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <button
              onClick={save}
              className="rounded-xl bg-theme px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-theme-hover"
            >
              {t("save")}
            </button>
            {editingId && (
              <button
                onClick={resetForm}
                className="rounded-xl bg-neutral-200 px-4 py-2 text-sm font-medium t-primary dark:bg-white/10"
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          <MarkdownEditor content={content} setContent={setContent} height="400px" />
        </div>
      </FlatPanel>

      <FlatPanel className="p-4">
        <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
          {pages.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">{t("pages.empty")}</p>
          )}
          {pages.map((page) => (
            <div key={page.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium t-primary">{page.title}</p>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  /page/{page.slug} · {page.status}
                </p>
              </div>
              <Link
                href={`/page/${page.slug || page.id}`}
                className="rounded-lg px-3 py-1.5 text-sm text-theme hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                {t("pages.view")}
              </Link>
              <button
                onClick={() => edit(page)}
                className="rounded-lg px-3 py-1.5 text-sm t-primary hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                {t("update.title")}
              </button>
              <button
                onClick={() => remove(page)}
                className="rounded-lg px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                {t("delete.title")}
              </button>
            </div>
          ))}
        </div>
      </FlatPanel>
      <AlertUI />
    </div>
  );
}
