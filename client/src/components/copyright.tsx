import { useMemo } from "react";

const INLINE_TAGS = new Set(["a", "span", "strong", "b", "em", "i", "small", "br", "code"]);

export function formatCopyright(value: string, year = new Date().getFullYear()) {
  const template = document.createElement("template");
  template.innerHTML = value.replace(/&copyright;/gi, "&copy;").replace(/\{\{year\}\}|\{year\}/g, String(year));

  const clean = (source: Node, target: Node) => {
    for (const node of Array.from(source.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        target.appendChild(document.createTextNode(node.textContent ?? ""));
      } else if (node instanceof HTMLElement && INLINE_TAGS.has(node.localName)) {
        const element = document.createElement(node.localName);
        if (node.localName === "a") {
          const href = node.getAttribute("href");
          if (href) {
            try {
              const url = new URL(href, window.location.origin);
              if (["http:", "https:", "mailto:"].includes(url.protocol)) element.setAttribute("href", href);
            } catch { /* Invalid links remain readable text. */ }
          }
          if (node.getAttribute("target") === "_blank") {
            element.setAttribute("target", "_blank");
            element.setAttribute("rel", "noopener noreferrer");
          }
          if (node.hasAttribute("title")) element.setAttribute("title", node.getAttribute("title")!);
        }
        clean(node, element);
        target.appendChild(element);
      }
    }
  };
  const result = document.createElement("span");
  clean(template.content, result);
  return result.innerHTML;
}

export function Copyright({ value }: { value: string }) {
  const year = new Date().getFullYear();
  const html = useMemo(() => formatCopyright(value, year), [value, year]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
