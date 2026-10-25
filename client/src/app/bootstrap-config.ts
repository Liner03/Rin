const CLIENT_CONFIG_WINDOW_KEY = "__RIN_CLIENT_CONFIG__";

type GlobalWithClientConfig = typeof globalThis & {
  [CLIENT_CONFIG_WINDOW_KEY]?: Record<string, unknown>;
};

export function readBootstrappedClientConfig() {
  const globalObject = globalThis as GlobalWithClientConfig;
  const config = globalObject[CLIENT_CONFIG_WINDOW_KEY];

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  return config;
}

export function readCachedClientConfig(): Record<string, unknown> | null {
  try {
    const cached = sessionStorage.getItem("config");
    const config: unknown = cached ? JSON.parse(cached) : null;
    return config && typeof config === "object" && !Array.isArray(config)
      ? config as Record<string, unknown>
      : null;
  } catch {
    // Storage may be disabled, or contain a truncated value from an older visit.
    return null;
  }
}
