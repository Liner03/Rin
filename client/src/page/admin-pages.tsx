import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FlatPanel, Input } from "@rin/ui";
import type { ContentField, Page } from "@rin/api";
import { client } from "../app/runtime";
import { PAGE_TEMPLATES } from "../components/page-templates";
import { useAlert } from "../components/dialog";
import { MarkdownEditor } from "../components/markdown_editor";
import { buildHierarchy, getValidParentOptions, type HierarchyNode } from "../utils/hierarchy";

type FieldDraft = Omit<ContentField, "value"> & { value: string };

function parseField(draft: FieldDraft): ContentField {
  let value: ContentField["value"] = draft.value;
  if (draft.type === "json") {
    value = JSON.parse(draft.value);
  } else if (draft.type === "int" || draft.type === "float") {
    value = Number(draft.value);
    if (!draft.value.trim() || !Number.isFinite(value) || (draft.type === "int" && !Number.isSafeInteger(value))) {
      throw new Error("Invalid numeric field");
    }
  }
  return { ...draft, name: draft.name.trim(), value };
}

export function AdminPagesPage() {
  const { t } = useTranslation();
  const { showAlert, AlertUI } = useAlert();
  const [pages, setPages] = useState<Page[]>([]);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [removePassword, setRemovePassword] = useState(false);
  const [order, setOrder] = useState(0);
  const [parent, setParent] = useState(0);
  const [status, setStatus] = useState<"publish" | "draft" | "hidden" | "private">("publish");
  const [template, setTemplate] = useState("default");
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const tree = useMemo(() => buildHierarchy(pages), [pages]);
  const parentOptions = useMemo(() => getValidParentOptions(pages, editingId), [pages, editingId]);

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
    setHasPassword(false);
    setRemovePassword(false);
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
    const parsedFields: ContentField[] = [];
    for (const field of fields.filter((item) => item.name.trim())) {
      try {
        parsedFields.push(parseField(field));
      } catch {
        showAlert(t("pages.invalid_field_value", { name: field.name, type: field.type }));
        return;
      }
    }
    const body = {
      title,
      slug: slug || undefined,
      content,
      password: removePassword ? "" : password || undefined,
      order,
      parent,
      status,
      template,
      fields: parsedFields,
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
    setHasPassword(Boolean(page.hasPassword));
    setRemovePassword(false);
    setOrder(page.order);
    const validParents = getValidParentOptions(pages, page.id);
    setParent(validParents.some((item) => item.id === page.parent) ? page.parent : 0);
    setStatus(page.status);
    setTemplate(page.template || "default");
    setFields((Array.isArray(page.fields) ? page.fields : []).map((field) => ({
      ...field,
      value: field.type === "json" ? JSON.stringify(field.value, null, 2) : String(field.value ?? ""),
    })));
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
            <Input value={password} setValue={setPassword} placeholder={t("password")} type="password" disabled={removePassword} variant="flat" />
            <Input value={String(order)} setValue={(v) => setOrder(parseInt(v) || 0)} placeholder={t("pages.order")} variant="flat" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {editingId !== undefined && hasPassword && (
              <label className="flex items-center gap-2 text-sm t-primary">
                <input
                  type="checkbox"
                  checked={removePassword}
                  onChange={(event) => setRemovePassword(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-neutral-300 text-theme focus:ring-theme"
                />
                {t("password_remove")}
              </label>
            )}
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
              {parentOptions.map((p) => (
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
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,2fr)_auto]">
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
                <textarea
                  value={field.value}
                  onChange={(event) => {
                    const next = [...fields];
                    next[index] = { ...next[index], value: event.target.value };
                    setFields(next);
                  }}
                  rows={field.type === "json" ? 4 : 1}
                  aria-label={`${t("pages.field_value")}: ${field.name || index + 1}`}
                  placeholder={t("pages.field_value")}
                  className="col-span-3 row-start-2 min-w-0 rounded-xl border border-black/10 bg-w px-3 py-2 text-sm t-primary focus:outline-none focus:ring-2 focus:ring-theme/10 dark:border-white/10 sm:col-span-1 sm:col-start-3 sm:row-start-1"
                />
                <button
                  type="button"
                  onClick={() => setFields(fields.filter((_, i) => i !== index))}
                  aria-label={t("delete.title")}
                  className="col-start-3 row-start-1 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 sm:col-start-4"
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
          {tree.map((page) => (
            <PageRow key={page.id} node={page} depth={0} onEdit={edit} onDelete={remove} />
          ))}
        </div>
      </FlatPanel>
      <AlertUI />
    </div>
  );
}

type PageNode = HierarchyNode<Page>;

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
