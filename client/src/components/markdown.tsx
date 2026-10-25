import { lazy, Suspense } from "react";

let renderer: Promise<typeof import("./markdown-renderer")> | undefined;

// Start this alongside content requests, keeping the homepage free of renderers.
export function preloadMarkdown() {
  return renderer ??= import("./markdown-renderer").catch((error) => {
    renderer = undefined;
    throw error;
  });
}

const Renderer = lazy(() => preloadMarkdown().then((module) => ({ default: module.MarkdownRenderer })));

export function Markdown({ content }: { content: string }) {
  return (
    <Suspense fallback={<div className="min-h-24" aria-busy="true" />}>
      <Renderer content={content} />
    </Suspense>
  );
}
