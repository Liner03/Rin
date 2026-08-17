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
};

export function getPageTemplate(id?: string | null): PageTemplateDefinition {
  return (id && PAGE_TEMPLATES[id]) || PAGE_TEMPLATES.default;
}
