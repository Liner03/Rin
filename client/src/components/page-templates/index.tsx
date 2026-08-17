import type { ReactNode } from "react";
import type { Page } from "@rin/api";
import { Markdown } from "../markdown";

export interface PageTemplateProps {
  page: Page;
}

export interface PageTemplateDefinition {
  id: string;
  /** 模板显示名（i18n key） */
  title: string;
  render: (props: PageTemplateProps) => ReactNode;
}

// 自定义字段展示块
function PageFields({ fields }: { fields: Page["fields"] }) {
  if (!fields || fields.length === 0) {
    return null;
  }
  return (
    <dl className="mb-6 grid gap-2 text-sm t-secondary sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.name} className="flex gap-2 border-b border-dashed border-black/10 pb-2 dark:border-white/10">
          <dt className="shrink-0 font-medium t-primary">{field.name}</dt>
          <dd className="min-w-0 break-words">{typeof field.value === "object" ? JSON.stringify(field.value) : String(field.value ?? "")}</dd>
        </div>
      ))}
    </dl>
  );
}

// 默认模板：标准文章式布局
function DefaultTemplate({ page }: PageTemplateProps) {
  return (
    <main className="flex w-full flex-col items-center">
      <div className="wauto py-4 text-3xl font-bold t-primary">
        {page.title}
      </div>
      <div className="wauto">
        <PageFields fields={page.fields} />
      </div>
      <article className="wauto t-primary">
        <Markdown content={page.content} />
      </article>
    </main>
  );
}

// 宽版模板：正文不限宽（占满内容区）
function WideTemplate({ page }: PageTemplateProps) {
  return (
    <main className="flex w-full flex-col items-center">
      <div className="w-full max-w-5xl px-4 py-4 text-3xl font-bold t-primary">
        {page.title}
      </div>
      <div className="w-full max-w-5xl px-4">
        <PageFields fields={page.fields} />
      </div>
      <article className="w-full max-w-5xl px-4 t-primary">
        <Markdown content={page.content} />
      </article>
    </main>
  );
}

// ============================================================================
// 作品集模板：JSON 字段驱动卡片网格
// 字段约定：
//   subtitle (str)  —— 副标题
//   gallery  (json) —— 项目数组，每项 { title?, image?, url?, desc? }
// ============================================================================

interface GalleryItem {
  title?: string;
  image?: string;
  url?: string;
  desc?: string;
}

function getField<T>(fields: Page["fields"], name: string): T | undefined {
  const field = fields?.find((f) => f.name === name);
  return field ? (field.value as T) : undefined;
}

function PortfolioTemplate({ page }: PageTemplateProps) {
  const subtitle = getField<string>(page.fields, "subtitle");
  const galleryRaw = getField<unknown>(page.fields, "gallery");
  const items: GalleryItem[] = Array.isArray(galleryRaw)
    ? galleryRaw.filter((item): item is GalleryItem => typeof item === "object" && item !== null)
    : [];
  const otherFields = (page.fields ?? []).filter((f) => f.name !== "subtitle" && f.name !== "gallery");

  return (
    <main className="flex w-full flex-col items-center">
      <div className="w-full max-w-5xl px-4 py-4 text-3xl font-bold t-primary">
        {page.title}
      </div>
      {subtitle ? (
        <p className="w-full max-w-5xl px-4 pb-2 text-base text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </p>
      ) : null}
      {items.length > 0 ? (
        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const card = (
              <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-black/10 bg-w transition-shadow hover:shadow-lg dark:border-white/10">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.title ?? ""}
                    loading="lazy"
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-theme/15 to-theme/5 text-3xl">
                    {item.title?.[0] ?? "•"}
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1 p-4">
                  {item.title ? (
                    <p className="text-sm font-semibold t-primary">{item.title}</p>
                  ) : null}
                  {item.desc ? (
                    <p className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">{item.desc}</p>
                  ) : null}
                </div>
              </div>
            );
            return item.url ? (
              <a key={index} href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                {card}
              </a>
            ) : (
              <div key={index}>{card}</div>
            );
          })}
        </div>
      ) : null}
      {otherFields.length > 0 ? (
        <div className="w-full max-w-5xl px-4">
          <PageFields fields={otherFields} />
        </div>
      ) : null}
      <article className="w-full max-w-5xl px-4 pb-8 t-primary">
        <Markdown content={page.content} />
      </article>
    </main>
  );
}

export const PAGE_TEMPLATES: Record<string, PageTemplateDefinition> = {
  default: {
    id: "default",
    title: "page_templates.default",
    render: DefaultTemplate,
  },
  wide: {
    id: "wide",
    title: "page_templates.wide",
    render: WideTemplate,
  },
  portfolio: {
    id: "portfolio",
    title: "page_templates.portfolio",
    render: PortfolioTemplate,
  },
};

export function getPageTemplate(id?: string | null): PageTemplateDefinition {
  return (id && PAGE_TEMPLATES[id]) || PAGE_TEMPLATES.default;
}
