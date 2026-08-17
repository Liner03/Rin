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

function getArray<T>(fields: Page["fields"], name: string): T[] {
  const raw = getField<unknown>(fields, name);
  return Array.isArray(raw) ? raw.filter((item): item is T => typeof item === "object" && item !== null) : [];
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


// ============================================================================
// 链接导航模板：links 字段驱动链接卡片矩阵
//   links (json): [{ title, url, desc?, icon? }]
// ============================================================================

interface LinkItem {
  title?: string;
  url?: string;
  desc?: string;
  icon?: string;
}

function LinksTemplate({ page }: PageTemplateProps) {
  const subtitle = getField<string>(page.fields, "subtitle");
  const links: LinkItem[] = getArray<LinkItem>(page.fields, "links");
  const otherFields = (page.fields ?? []).filter((f) => f.name !== "subtitle" && f.name !== "links");

  return (
    <main className="flex w-full flex-col items-center">
      <div className="wauto py-4 text-3xl font-bold t-primary">{page.title}</div>
      {subtitle ? <p className="wauto pb-2 text-base text-neutral-500 dark:text-neutral-400">{subtitle}</p> : null}
      {links.length > 0 ? (
        <div className="grid wauto grid-cols-1 gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link, index) => {
            const card = (
              <div className="flex h-full items-center gap-3 rounded-xl border border-black/10 bg-w p-4 transition-shadow hover:shadow-md dark:border-white/10">
                {link.icon ? (
                  <img src={link.icon} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme/10 text-lg font-semibold text-theme">
                    {link.title?.[0] ?? "•"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium t-primary">{link.title}</p>
                  {link.desc ? <p className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">{link.desc}</p> : null}
                </div>
                <i className="ri-arrow-right-up-line ml-auto shrink-0 text-neutral-400" />
              </div>
            );
            return link.url ? (
              <a key={index} href={link.url} target="_blank" rel="noopener noreferrer">
                {card}
              </a>
            ) : (
              <div key={index}>{card}</div>
            );
          })}
        </div>
      ) : null}
      {otherFields.length > 0 ? (
        <div className="wauto"><PageFields fields={otherFields} /></div>
      ) : null}
      <article className="wauto pb-8 t-primary"><Markdown content={page.content} /></article>
    </main>
  );
}

// ============================================================================
// 相册模板：gallery 字段驱动瀑布流
//   gallery (json): [{ image, caption? }]
// ============================================================================

interface GalleryImage {
  image?: string;
  caption?: string;
}

function GalleryTemplate({ page }: PageTemplateProps) {
  const subtitle = getField<string>(page.fields, "subtitle");
  const images: GalleryImage[] = getArray<GalleryImage>(page.fields, "gallery").filter((item) => item.image);
  const otherFields = (page.fields ?? []).filter((f) => f.name !== "subtitle" && f.name !== "gallery");

  return (
    <main className="flex w-full flex-col items-center">
      <div className="wauto py-4 text-3xl font-bold t-primary">{page.title}</div>
      {subtitle ? <p className="wauto pb-2 text-base text-neutral-500 dark:text-neutral-400">{subtitle}</p> : null}
      {images.length > 0 ? (
        <div className="wauto columns-2 gap-3 py-4 [column-fill:balance] lg:columns-3">
          {images.map((item, index) => (
            <figure key={index} className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
              <img src={item.image} alt={item.caption ?? ""} loading="lazy" className="w-full object-cover" />
              {item.caption ? (
                <figcaption className="px-3 py-2 text-[12px] text-neutral-500 dark:text-neutral-400">{item.caption}</figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}
      {otherFields.length > 0 ? (
        <div className="wauto"><PageFields fields={otherFields} /></div>
      ) : null}
      <article className="wauto pb-8 t-primary"><Markdown content={page.content} /></article>
    </main>
  );
}

// ============================================================================
// 时间线模板：events 字段驱动纵向时间轴
//   events (json): [{ date, title, desc? }]
// ============================================================================

interface TimelineEvent {
  date?: string;
  title?: string;
  desc?: string;
}

function TimelineTemplate({ page }: PageTemplateProps) {
  const subtitle = getField<string>(page.fields, "subtitle");
  const events: TimelineEvent[] = getArray<TimelineEvent>(page.fields, "events");
  const otherFields = (page.fields ?? []).filter((f) => f.name !== "subtitle" && f.name !== "events");

  return (
    <main className="flex w-full flex-col items-center">
      <div className="wauto py-4 text-3xl font-bold t-primary">{page.title}</div>
      {subtitle ? <p className="wauto pb-2 text-base text-neutral-500 dark:text-neutral-400">{subtitle}</p> : null}
      {events.length > 0 ? (
        <div className="relative wauto py-4 pl-6">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-black/10 dark:bg-white/10" />
          {events.map((event, index) => (
            <div key={index} className="relative pb-6 last:pb-0">
              <span className="absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-theme bg-w" />
              <div className="flex flex-wrap items-baseline gap-x-3">
                {event.date ? <span className="text-[12px] font-medium text-theme">{event.date}</span> : null}
                {event.title ? <span className="text-sm font-semibold t-primary">{event.title}</span> : null}
              </div>
              {event.desc ? <p className="mt-1 text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">{event.desc}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {otherFields.length > 0 ? (
        <div className="wauto"><PageFields fields={otherFields} /></div>
      ) : null}
      <article className="wauto pb-8 t-primary"><Markdown content={page.content} /></article>
    </main>
  );
}

// ============================================================================
// 简历模板：experience + skills 字段驱动双栏
//   experience (json): [{ period, role, company, desc? }]
//   skills     (json): [{ name, level }]  level 0-100
// ============================================================================

interface ExperienceItem {
  period?: string;
  role?: string;
  company?: string;
  desc?: string;
}

interface SkillItem {
  name?: string;
  level?: number;
}

function ResumeTemplate({ page }: PageTemplateProps) {
  const experience: ExperienceItem[] = getArray<ExperienceItem>(page.fields, "experience");
  const skills: SkillItem[] = getArray<SkillItem>(page.fields, "skills");
  const otherFields = (page.fields ?? []).filter((f) => f.name !== "experience" && f.name !== "skills");

  return (
    <main className="flex w-full flex-col items-center">
      <div className="wauto py-4 text-3xl font-bold t-primary">{page.title}</div>
      {(experience.length > 0 || skills.length > 0) ? (
        <div className="grid wauto gap-6 py-4 lg:grid-cols-2">
          {experience.length > 0 ? (
            <section>
              <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">Experience</p>
              <div className="flex flex-col gap-4">
                {experience.map((item, index) => (
                  <div key={index} className="border-l-2 border-theme/30 pl-3">
                    {item.period ? <p className="text-[12px] font-medium text-theme">{item.period}</p> : null}
                    <p className="mt-0.5 text-sm font-semibold t-primary">
                      {item.role}
                      {item.company ? <span className="font-normal text-neutral-500 dark:text-neutral-400"> · {item.company}</span> : null}
                    </p>
                    {item.desc ? <p className="mt-1 text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">{item.desc}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {skills.length > 0 ? (
            <section>
              <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">Skills</p>
              <div className="flex flex-col gap-3">
                {skills.map((skill, index) => (
                  <div key={index}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="t-primary">{skill.name}</span>
                      <span className="text-neutral-400">{skill.level ?? 0}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                      <div className="h-full rounded-full bg-theme" style={{ width: `${Math.min(100, Math.max(0, skill.level ?? 0))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      {otherFields.length > 0 ? (
        <div className="wauto"><PageFields fields={otherFields} /></div>
      ) : null}
      <article className="wauto pb-8 t-primary"><Markdown content={page.content} /></article>
    </main>
  );
}

// ============================================================================
// 音乐收藏模板：tracks 字段驱动歌单网格
//   tracks (json): [{ title, artist, cover?, url? }]
// ============================================================================

interface TrackItem {
  title?: string;
  artist?: string;
  cover?: string;
  url?: string;
}

function MusicTemplate({ page }: PageTemplateProps) {
  const subtitle = getField<string>(page.fields, "subtitle");
  const tracks: TrackItem[] = getArray<TrackItem>(page.fields, "tracks");
  const otherFields = (page.fields ?? []).filter((f) => f.name !== "subtitle" && f.name !== "tracks");

  return (
    <main className="flex w-full flex-col items-center">
      <div className="wauto py-4 text-3xl font-bold t-primary">{page.title}</div>
      {subtitle ? <p className="wauto pb-2 text-base text-neutral-500 dark:text-neutral-400">{subtitle}</p> : null}
      {tracks.length > 0 ? (
        <div className="grid wauto grid-cols-2 gap-3 py-4 sm:grid-cols-3 lg:grid-cols-4">
          {tracks.map((track, index) => {
            const card = (
              <div className="group overflow-hidden rounded-xl border border-black/10 bg-w transition-shadow hover:shadow-md dark:border-white/10">
                {track.cover ? (
                  <div className="relative">
                    <img src={track.cover} alt={track.title ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                      <i className="ri-play-circle-fill text-4xl text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-theme/15 to-theme/5">
                    <i className="ri-music-2-line text-3xl text-theme/50" />
                  </div>
                )}
                <div className="p-3">
                  <p className="truncate text-sm font-medium t-primary">{track.title}</p>
                  {track.artist ? <p className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">{track.artist}</p> : null}
                </div>
              </div>
            );
            return track.url ? (
              <a key={index} href={track.url} target="_blank" rel="noopener noreferrer">{card}</a>
            ) : (
              <div key={index}>{card}</div>
            );
          })}
        </div>
      ) : null}
      {otherFields.length > 0 ? (
        <div className="wauto"><PageFields fields={otherFields} /></div>
      ) : null}
      <article className="wauto pb-8 t-primary"><Markdown content={page.content} /></article>
    </main>
  );
}

// ============================================================================
// 文档模板：sections 字段驱动侧栏目录 + 正文
//   sections (json): [{ id, title }]  正文用对应标题生成锚点
// ============================================================================

interface DocSection {
  id?: string;
  title?: string;
}

function DocsTemplate({ page }: PageTemplateProps) {
  const sections: DocSection[] = getArray<DocSection>(page.fields, "sections");
  const otherFields = (page.fields ?? []).filter((f) => f.name !== "sections");

  return (
    <main className="flex w-full flex-col items-center">
      <div className="wauto py-4 text-3xl font-bold t-primary">{page.title}</div>
      <div className="flex wauto gap-8 py-4">
        {sections.length > 0 ? (
          <nav className="hidden w-44 shrink-0 lg:block">
            <ul className="sticky top-24 flex flex-col gap-1 border-l border-black/10 dark:border-white/10">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block py-0.5 pl-3 text-[13px] text-neutral-500 transition-colors hover:text-theme dark:text-neutral-400"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <article className="min-w-0 flex-1 t-primary">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              {section.title ? <h2 className="mb-2 text-xl font-bold">{section.title}</h2> : null}
            </section>
          ))}
          <Markdown content={page.content} />
        </article>
      </div>
      {otherFields.length > 0 ? (
        <div className="wauto"><PageFields fields={otherFields} /></div>
      ) : null}
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
  links: {
    id: "links",
    title: "page_templates.links",
    render: LinksTemplate,
  },
  gallery: {
    id: "gallery",
    title: "page_templates.gallery",
    render: GalleryTemplate,
  },
  timeline: {
    id: "timeline",
    title: "page_templates.timeline",
    render: TimelineTemplate,
  },
  resume: {
    id: "resume",
    title: "page_templates.resume",
    render: ResumeTemplate,
  },
  music: {
    id: "music",
    title: "page_templates.music",
    render: MusicTemplate,
  },
  docs: {
    id: "docs",
    title: "page_templates.docs",
    render: DocsTemplate,
  },
};

export function getPageTemplate(id?: string | null): PageTemplateDefinition {
  return (id && PAGE_TEMPLATES[id]) || PAGE_TEMPLATES.default;
}
