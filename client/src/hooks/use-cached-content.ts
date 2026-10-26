import type { ApiResponse } from "@rin/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTransientContentError } from "../api/public-content-cache";

interface Resource<T> {
  // Include every parameter that changes the response, including the viewer.
  key: string;
  getCached: () => T | undefined;
  load: () => Promise<ApiResponse<T>>;
  enabled?: boolean;
}

interface Result<T> {
  key: string;
  data?: T;
  loading: boolean;
  error?: string;
}

export function useCachedContent<T>({ key, getCached, load, enabled = true }: Resource<T>) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Result<T>>(() => {
    const data = enabled ? getCached() : undefined;
    return { key, data, loading: enabled && data === undefined };
  });
  const callbacks = useRef({ getCached, load });
  callbacks.current = { getCached, load };
  const request = useRef<{ key: string; version: number; promise: Promise<ApiResponse<T>> }>();
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      request.current = undefined;
      setResult({ key: "", loading: false });
      return;
    }
    let cancelled = false;
    const resource = callbacks.current;
    const cached = resource.getCached();
    setResult({ key, data: cached, loading: cached === undefined });
    if (!request.current || request.current.key !== key || request.current.version !== version) {
      request.current = { key, version, promise: resource.load() };
    }
    function fail(message: string, transient: boolean) {
      if (cancelled) return;
      const data = transient ? resource.getCached() : undefined;
      setResult({ key, data, loading: false, error: data === undefined ? message : undefined });
    }
    request.current.promise.then(({ data, error }) => {
      if (cancelled) return;
      if (error) fail(error.value, isTransientContentError(error.status));
      else if (data === undefined) fail("Not found", false);
      else setResult({ key, data, loading: false });
    }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error), true));
    return () => { cancelled = true; };
  }, [key, enabled, version]);

  if (!enabled) return { data: undefined, loading: false, error: undefined, reload };
  if (result.key !== key) {
    const data = getCached();
    return { data, loading: data === undefined, error: undefined, reload };
  }
  return { data: result.data, loading: result.loading, error: result.error, reload };
}
