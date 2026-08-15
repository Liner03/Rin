import i18n from 'i18next';
import _ from 'lodash';
import {useCallback, useEffect, useState} from "react";
import {Helmet} from "react-helmet";
import {useTranslation} from "react-i18next";
import Loading from 'react-loading';
import {ShowAlertType, useAlert} from '../components/dialog';
import {Checkbox, Input} from "../components/input";
import { DateTimeInput, FlatMetaRow, FlatPanel } from "@rin/ui";
import { client } from "../app/runtime";
import {Cache} from '../utils/cache';
import {useSiteConfig} from "../hooks/useSiteConfig";
import {siteName} from "../utils/constants";
import { MarkdownEditor } from '../components/markdown_editor';

async function publish({
  title,
  alias,
  listed,
  content,
  summary,
  tags,
  categories,
  password,
  cover,
  draft,
  createdAt,
  onCompleted,
  showAlert
}: {
  title: string;
  listed: boolean;
  content: string;
  summary: string;
  tags: string[];
  categories: number[];
  password: string;
  cover: string;
  draft: boolean;
  alias?: string;
  createdAt?: Date;
  onCompleted?: () => void;
  showAlert: ShowAlertType;
}) {
  const t = i18n.t
  const { data, error } = await client.feed.create(
    {
      title,
      alias,
      content,
      summary,
      tags,
      categories,
      password: password || undefined,
      cover: cover || undefined,
      listed,
      draft,
      createdAt: createdAt?.toISOString(),
    }
  );
  if (onCompleted) {
    onCompleted();
  }
  if (error) {
    showAlert(error.value as string);
  }
  if (data) {
    showAlert(t("publish.success"), () => {
      Cache.with().clear();
      window.location.href = "/feed/" + data.insertedId;
    });
  }
}

async function update({
  id,
  title,
  alias,
  content,
  summary,
  tags,
  categories,
  password,
  cover,
  listed,
  draft,
  createdAt,
  onCompleted,
  showAlert
}: {
  id: number;
  listed: boolean;
  title?: string;
  alias?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  categories?: number[];
  /** 空字符串表示清除密码，undefined 表示保持不变 */
  password?: string;
  cover?: string;
  draft?: boolean;
  createdAt?: Date;
  onCompleted?: () => void;
  showAlert: ShowAlertType;
}) {
  const t = i18n.t
  const { error } = await client.feed.update(
    id,
    {
      title,
      alias,
      content,
      summary,
      tags,
      categories,
      password,
      cover,
      listed,
      draft,
      createdAt: createdAt?.toISOString(),
    }
  );
  if (onCompleted) {
    onCompleted();
  }
  if (error) {
    showAlert(error.value as string);
  } else {
    showAlert(t("update.success"), () => {
      Cache.with(id).clear();
      window.location.href = "/feed/" + id;
    });
  }
}

// 写作页面
export function WritingPage({ id }: { id?: number }) {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const cache = Cache.with(id);
  const [title, setTitle] = cache.useCache("title", "");
  const [summary, setSummary] = cache.useCache("summary", "");
  const [tags, setTags] = cache.useCache("tags", "");
  const [alias, setAlias] = cache.useCache("alias", "");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [removePassword, setRemovePassword] = useState(false);
  const [cover, setCover] = cache.useCache("cover", "");
  const [categories, setCategories] = useState<number[]>([]);
  const [categoryList, setCategoryList] = useState<Array<{ id: number; name: string; parent: number }>>([]);
  const [draft, setDraft] = useState(false);
  const [listed, setListed] = useState(true);
  const [content, setContent] = cache.useCache("content", "");
  const [createdAt, setCreatedAt] = useState<Date | undefined>(new Date());
  const [publishing, setPublishing] = useState(false)
  const { showAlert, AlertUI } = useAlert()
  function publishButton() {
    if (publishing) return;
    const tagsplit =
      tags
        .split("#")
        .filter((tag) => tag !== "")
        .map((tag) => tag.trim()) || [];
    if (id !== undefined) {
      setPublishing(true)
      update({
        id,
        title,
        content,
        summary,
        alias,
        tags: tagsplit,
        categories,
        password: removePassword ? "" : password || undefined,
        cover,
        draft,
        listed,
        createdAt,
        onCompleted: () => {
          setPublishing(false)
        },
        showAlert
      });
    } else {
      if (!title) {
        showAlert(t("title_empty"))
        return;
      }
      if (!content) {
        showAlert(t("content.empty"))
        return;
      }
      setPublishing(true)
      publish({
        title,
        content,
        summary,
        tags: tagsplit,
        categories,
        password,
        cover,
        draft,
        alias,
        listed,
        createdAt,
        onCompleted: () => {
          setPublishing(false)
        },
        showAlert
      });
    }
  }

  useEffect(() => {
    client.category.list().then(({ data }) => {
      if (data) setCategoryList(data);
    });
  }, []);

  useEffect(() => {
    if (id) {
      client.feed
        .get(id)
        .then(({ data }) => {
          if (data) {
            if (title == "" && data.title) setTitle(data.title);
            if (tags == "" && Array.isArray(data.hashtags))
              setTags(data.hashtags.map(({ name }: {name: string}) => `#${name}`).join(" "));
            if (alias == "" && data.slug) setAlias(data.slug);
            if (content == "") setContent(data.content);
            if (summary == "") setSummary(data.summary || "");
            if (cover == "" && data.cover) setCover(data.cover);
            if (Array.isArray(data.categories))
              setCategories(data.categories.map(({ id }: {id: number}) => id));
            setHasPassword(Boolean(data.hasPassword));
            setListed(data.listed === 1);
            setDraft(data.draft === 1);
            setCreatedAt(new Date(data.createdAt));
          }
        });
    }
  }, []);
  const debouncedUpdate = useCallback(
    _.debounce(() => {
      import("mermaid").then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
        });
        mermaid.run({
          suppressErrors: true,
          nodes: document.querySelectorAll("pre.mermaid_default")
        }).then(() => {
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
          });
          mermaid.run({
            suppressErrors: true,
            nodes: document.querySelectorAll("pre.mermaid_dark")
          });
        })
      });
    }, 100),
    []
  );
  useEffect(() => {
    debouncedUpdate();
  }, [content, debouncedUpdate]);
  function PublishButton({ className }: { className?: string }) {
    return (
      <button
        onClick={publishButton}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-theme px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-theme-hover active:bg-theme-active disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
        disabled={publishing}
      >
        {publishing && <Loading type="spin" height={16} width={16} />}
        <span>{t('publish.title')}</span>
      </button>
    );
  }

  function MetaInput({ className }: { className?: string }) {
    return (
        <FlatPanel className={className}>
          <div className="flex flex-row gap-4 border-b border-black/5 pb-5 dark:border-white/5 items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-theme/70">{t('writing')}</p>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {id !== undefined ? t("update.title") : t("publish.title")}
              </p>
            </div>
            <PublishButton className="w-auto" />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <Input
                id={id}
                value={title}
                setValue={setTitle}
                placeholder={t("title")}
                variant="flat"
                className="text-base"
              />
            </div>
            <Input
              id={id}
              value={summary}
              setValue={setSummary}
              placeholder={t("summary")}
              variant="flat"
            />
            <Input
              id={id}
              value={alias}
              setValue={setAlias}
              placeholder={t("alias")}
              variant="flat"
            />
            <Input
              id={id}
              value={password}
              setValue={setPassword}
              placeholder={t("password")}
              variant="flat"
            />
            {id !== undefined && hasPassword && (
              <FlatMetaRow
                className="cursor-pointer rounded-none border-0 bg-transparent px-0 py-2 sm:rounded-2xl sm:border sm:bg-secondary sm:px-4 sm:py-3"
                onClick={() => setRemovePassword(!removePassword)}
              >
                <p>{t("password_remove")}</p>
                <Checkbox
                  id="removePassword"
                  value={removePassword}
                  setValue={setRemovePassword}
                  placeholder={t("password_remove")}
                />
              </FlatMetaRow>
            )}
            <Input
              id={id}
              value={tags}
              setValue={setTags}
              placeholder={t("tags")}
              variant="flat"
              className="lg:col-span-2"
            />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-theme/70">{t("cover.title")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={id}
                value={cover}
                setValue={setCover}
                placeholder={t("cover.placeholder")}
                variant="flat"
              />
              <button
                type="button"
                onClick={() => {
                  const extracted = extractFirstImageUrl(content);
                  if (extracted) {
                    setCover(extracted);
                  } else {
                    showAlert(t("cover.not_found"));
                  }
                }}
                className="shrink-0 rounded-xl border border-black/10 bg-secondary px-4 py-2 text-sm t-primary transition-colors hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/5"
              >
                {t("cover.extract")}
              </button>
              {cover && (
                <button
                  type="button"
                  onClick={() => setCover("")}
                  className="shrink-0 rounded-xl border border-black/10 bg-secondary px-4 py-2 text-sm t-primary transition-colors hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/5"
                >
                  {t("cover.clear")}
                </button>
              )}
            </div>
            {cover && (
              <img
                src={cover}
                alt={t("cover.preview")}
                className="mt-3 h-40 w-full rounded-xl border border-black/10 object-cover dark:border-white/10"
              />
            )}
          </div>

          {categoryList.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-theme/70">{t("categories.title")}</p>
              <div className="flex flex-wrap gap-2">
                {buildCategoryTree(categoryList).map((category) => (
                  <CategoryCheckbox
                    key={category.id}
                    category={category}
                    depth={0}
                    selected={categories}
                    setSelected={setCategories}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-2 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(18rem,2fr)]">
            <FlatMetaRow
              className="cursor-pointer rounded-none border-0 bg-transparent px-0 py-2 sm:rounded-2xl sm:border sm:bg-secondary sm:px-4 sm:py-3"
              onClick={() => setDraft(!draft)}
            >
              <p>{t('visible.self_only')}</p>
              <Checkbox
                id="draft"
                value={draft}
                setValue={setDraft}
                placeholder={t('draft')}
              />
            </FlatMetaRow>
            <FlatMetaRow
              className="cursor-pointer rounded-none border-0 bg-transparent px-0 py-2 sm:rounded-2xl sm:border sm:bg-secondary sm:px-4 sm:py-3"
              onClick={() => setListed(!listed)}
            >
              <p>{t('listed')}</p>
              <Checkbox
                id="listed"
                value={listed}
                setValue={setListed}
                placeholder={t('listed')}
              />
            </FlatMetaRow>
            <FlatMetaRow className="gap-3 rounded-none border-0 bg-transparent px-0 py-2 sm:rounded-2xl sm:border sm:bg-secondary sm:px-4 sm:py-3 xl:col-span-1">
              <p className="mr-2 whitespace-nowrap">
                {t('created_at')}
              </p>
              <DateTimeInput value={createdAt} onChange={setCreatedAt} className="w-full max-w-[16rem]" />
            </FlatMetaRow>
          </div>
        </FlatPanel>
    )
  }

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - ${siteConfig.name}`}</title>
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={t('writing')} />
        <meta property="og:image" content={siteConfig.avatar} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={document.URL} />
      </Helmet>
      <div className="mt-2 flex flex-col gap-4 t-primary sm:gap-6">
        {MetaInput({ className: "p-4 sm:p-5 md:p-6" })}

        <FlatPanel className="overflow-hidden p-0">
          <MarkdownEditor content={content} setContent={setContent} height='680px' />
        </FlatPanel>
      </div>
      <AlertUI />
    </>
  );
}

type CategoryNode = { id: number; name: string; parent: number; children: CategoryNode[] };

function extractFirstImageUrl(content: string): string | null {
  const match = content.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  return match ? match[1] : null;
}

function buildCategoryTree(list: Array<{ id: number; name: string; parent: number }>): CategoryNode[] {
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

function CategoryCheckbox({
  category,
  depth,
  selected,
  setSelected,
}: {
  category: CategoryNode;
  depth: number;
  selected: number[];
  setSelected: (value: number[]) => void;
}) {
  const toggle = () => {
    if (selected.includes(category.id)) {
      setSelected(selected.filter((id) => id !== category.id));
    } else {
      setSelected([...selected, category.id]);
    }
  };
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <label className="flex cursor-pointer items-center gap-1.5 py-0.5">
        <input
          type="checkbox"
          checked={selected.includes(category.id)}
          onChange={toggle}
          className="h-3.5 w-3.5 rounded border-neutral-300 text-theme focus:ring-theme"
        />
        <span className="text-sm text-neutral-700 dark:text-neutral-300">{category.name}</span>
      </label>
      {category.children.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {category.children.map((child) => (
            <CategoryCheckbox
              key={child.id}
              category={child}
              depth={depth + 1}
              selected={selected}
              setSelected={setSelected}
            />
          ))}
        </div>
      )}
    </div>
  );
}
