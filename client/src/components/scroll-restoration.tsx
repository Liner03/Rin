import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// 在 session 内保存每个路由的滚动位置，返回时恢复（SPA 后退不丢位置）
// 保存时机在点击导航时（导航发生前 scrollY 才准确），恢复时机在路由切换后
const SCROLL_STORAGE_KEY = "rin_scroll_positions";

type ScrollMap = Record<string, number>;

function loadScrollMap(): ScrollMap {
  try {
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveScrollMap(map: ScrollMap) {
  try {
    sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage 不可用时静默降级为无恢复
  }
}

export function ScrollRestoration() {
  const [location] = useLocation();
  const scrollMap = useRef<ScrollMap>(loadScrollMap());
  const restored = useRef(false);

  // 点击站内链接时保存当前滚动位置（导航发生前）
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      const current = window.location.pathname + window.location.search;
      scrollMap.current[current] = window.scrollY;
      saveScrollMap(scrollMap.current);
    };
    document.addEventListener("click", handler, true);
    return () => {
      document.removeEventListener("click", handler, true);
    };
  }, []);

  // 路由切换后：恢复历史位置或回到顶部
  useEffect(() => {
    const saved = scrollMap.current[location];
    restored.current = false;
    if (typeof saved === "number") {
      // 页面异步渲染，内容未就绪（可滚动高度不足）时重试，最多 500ms
      const tryRestore = (attempt = 0) => {
        if (restored.current) return;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (saved <= maxScroll || attempt >= 5) {
          restored.current = true;
          window.scrollTo(0, saved);
        } else {
          window.setTimeout(() => tryRestore(attempt + 1), 100);
        }
      };
      window.requestAnimationFrame(() => tryRestore());
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return null;
}
