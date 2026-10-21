import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FlatPanel, Input } from "@rin/ui";
import type { ContentField, Page } from "@rin/api";
import { client } from "../app/runtime";
import { PAGE_TEMPLATES } from "../components/page-templates";
import { useAlert } from "../components/dialog";
import { MarkdownEditor } from "../components/markdown_editor";

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
  const [template, setTemplate] = useState("default");
  const [fields, setFields] = useState<ContentField[]>([]);

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
    setTemplate("default");
    setFields([]);
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
      template,
      fields,
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
    setTemplate(page.template || "default");
    setFields(Array.isArray(page.fields) ? page.fields : []);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-black/10 bg-secondary/50 px-4 py-3 text-sm leading-6 text-neutral-600 dark:border-white/10 dark:text-neutral-400">
        {t("pages.vs_posts_hint")}
      </div>
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
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="rounded-xl border border-black/10 bg-secondary px-3 py-2 text-sm t-primary dark:border-white/10"
            >
              {Object.values(PAGE_TEMPLATES).map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{t(tpl.title)}</option>
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
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-theme/70">{t("pages.fields")}</p>
          <div className="flex flex-col gap-2">
            {fields.map((field, index) => (
              <div key={index} className="grid grid-cols-[1fr_5.5rem_2fr_auto] items-center gap-2">
                <Input
                  value={field.name}
                  setValue={(value) => {
                    const next = [...fields];
                    next[index] = { ...next[index], name: value };
                    setFields(next);
                  }}
                  placeholder={t("pages.field_name")}
                  variant="flat"
                />
                <select
                  value={field.type}
                  onChange={(e) => {
                    const next = [...fields];
                    next[index] = { ...next[index], type: e.target.value as ContentField["type"] };
                    setFields(next);
                  }}
                  className="rounded-xl border border-black/10 bg-secondary px-2 py-2 text-sm t-primary dark:border-white/10"
                >
                  <option value="str">str</option>
                  <option value="int">int</option>
                  <option value="float">float</option>
                  <option value="json">json</option>
                </select>
                <Input
                  value={String(field.value ?? "")}
                  setValue={(value) => {
                    const next = [...fields];
                    const raw = value;
                    const parsed = next[index].type === "int"
                      ? parseInt(raw) || 0
                      : next[index].type === "float"
                        ? parseFloat(raw) || 0
                        : next[index].type === "json"
                          ? (() => { try { return JSON.parse(raw); } catch { return raw; } })()
                          : raw;
                    next[index] = { ...next[index], value: parsed };
                    setFields(next);
                  }}
                  placeholder={t("pages.field_value")}
                  variant="flat"
                />
                <button
                  type="button"
                  onClick={() => setFields(fields.filter((_, i) => i !== index))}
                  aria-label={t("delete.title")}
                  className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                >
                  <i className="ri-delete-bin-2-line text-base" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFields([...fields, { name: "", type: "str", value: "" }])}
              className="self-start rounded-xl border border-dashed border-black/20 px-4 py-2 text-sm text-neutral-500 transition-colors hover:border-theme hover:text-theme dark:border-white/20"
            >
              {t("pages.add_field")}
            </button>
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
          {buildPageTree(pages).map((page) => (
            <PageRow key={page.id} node={page} depth={0} onEdit={edit} onDelete={remove} />
          ))}
        </div>
      </FlatPanel>
      <AlertUI />
    </div>
  );
}

type PageNode = Page & { children: PageNode[] };

function buildPageTree(list: Page[]): PageNode[] {
  const nodes = new Map<number, PageNode>();
  for (const item of list) {
    nodes.set(item.id, { ...item, children: [] });
  }
  const roots: PageNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parent);
    if (parent && node.parent !== 0) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function PageRow({
  node,
  depth,
  onEdit,
  onDelete,
}: {
  node: PageNode;
  depth: number;
  onEdit: (page: Page) => void;
  onDelete: (page: Page) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 py-3" style={{ marginLeft: depth * 20 }}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium t-primary">
            {depth > 0 ? "└ " : ""}{node.title}
            {node.status === "draft" && (
              <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
                {t("draft")}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            /page/{node.slug || node.id} · {t("pages.order")}: {node.order}
          </p>
        </div>
        <Link
          href={`/page/${node.slug || node.id}`}
          className="rounded-lg px-3 py-1.5 text-sm text-theme hover:bg-neutral-100 dark:hover:bg-white/5"
        >
          {t("pages.view")}
        </Link>
        <button
          onClick={() => onEdit(node)}
          className="rounded-lg px-3 py-1.5 text-sm t-primary hover:bg-neutral-100 dark:hover:bg-white/5"
        >
          {t("update.title")}
        </button>
        <button
          onClick={() => onDelete(node)}
          className="rounded-lg px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          {t("delete.title")}
        </button>
      </div>
      {node.children.length > 0 && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <PageRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
