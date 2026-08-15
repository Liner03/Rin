import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FlatPanel, Input } from "@rin/ui";
import { client } from "../app/runtime";
import { useAlert } from "../components/dialog";
import type { Category } from "@rin/api";

export function AdminCategoriesPage() {
  const { t } = useTranslation();
  const { showAlert, AlertUI } = useAlert();
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [parent, setParent] = useState(0);
  const [order, setOrder] = useState(0);

  const loadCategories = useCallback(async () => {
    const { data } = await client.category.list();
    if (data) setCategories(data);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function resetForm() {
    setEditingId(undefined);
    setName("");
    setSlug("");
    setDescription("");
    setParent(0);
    setOrder(0);
  }

  async function save() {
    if (!name.trim()) {
      showAlert(t("title_empty"));
      return;
    }
    const body = {
      name,
      slug: slug || undefined,
      description,
      parent,
      order,
    };
    const { error } = editingId
      ? await client.category.update(editingId, body)
      : await client.category.create(body);
    if (error) {
      showAlert(error.value as string);
    } else {
      showAlert(t("update.success"), () => {
        resetForm();
        loadCategories();
      });
    }
  }

  async function remove(category: Category) {
    const { error } = await client.category.delete(category.id);
    if (error) {
      showAlert(error.value as string);
    } else {
      loadCategories();
    }
  }

  function edit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setSlug(category.slug || "");
    setDescription(category.description || "");
    setParent(category.parent);
    setOrder(category.order);
  }

  const tree = buildCategoryTree(categories);

  return (
    <div className="flex flex-col gap-4">
      <FlatPanel className="p-4">
        <p className="text-sm font-semibold t-primary">{editingId ? t("update.title") : t("publish.title")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input value={name} setValue={setName} placeholder={t("categories.name")} variant="flat" />
          <Input value={slug} setValue={setSlug} placeholder={t("alias")} variant="flat" />
          <Input value={description} setValue={setDescription} placeholder={t("categories.description")} variant="flat" />
          <div className="flex items-center gap-3">
            <select
              value={parent}
              onChange={(e) => setParent(parseInt(e.target.value) || 0)}
              className="w-full rounded-xl border border-black/10 bg-secondary px-3 py-2 text-sm t-primary dark:border-white/10"
            >
              <option value={0}>{t("pages.no_parent")}</option>
              {categories.filter((c) => c.id !== editingId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Input value={String(order)} setValue={(v) => setOrder(parseInt(v) || 0)} placeholder={t("pages.order")} variant="flat" />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
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
      </FlatPanel>

      <FlatPanel className="p-4">
        {tree.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">{t("categories.empty")}</p>
        )}
        {tree.map((category) => (
          <CategoryRow
            key={category.id}
            node={category}
            depth={0}
            onEdit={edit}
            onDelete={remove}
          />
        ))}
      </FlatPanel>
      <AlertUI />
    </div>
  );
}

type CategoryNode = Category & { children: CategoryNode[] };

function buildCategoryTree(list: Category[]): CategoryNode[] {
  const nodes = new Map<number, CategoryNode>();
  for (const item of list) {
    nodes.set(item.id, { ...item, children: [] });
  }
  const roots: CategoryNode[] = [];
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

function CategoryRow({
  node,
  depth,
  onEdit,
  onDelete,
}: {
  node: CategoryNode;
  depth: number;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 py-2.5" style={{ marginLeft: depth * 20 }}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium t-primary">{node.name}</p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {node.slug} · {t("categories.posts")}: {node.count}
          </p>
        </div>
        <Link
          href={`/category/${node.slug || node.id}`}
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
          {t("delete")}
        </button>
      </div>
      {node.children.length > 0 && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <CategoryRow
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
