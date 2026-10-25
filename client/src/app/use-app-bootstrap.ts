import { useEffect, useRef, useState } from "react";
import { ConfigWrapper } from "@rin/config";
import type { Profile } from "../state/profile";
import { defaultClientConfig } from "../state/config";
import { applyThemeColor } from "../utils/theme-color";
import { readBootstrappedClientConfig, readCachedClientConfig } from "./bootstrap-config";
import { client } from "./runtime";

export const CLIENT_CONFIG_TIMEOUT_MS = 8_000;
type ConfigStatus = "loading" | "ready" | "error";

function applyViewportScaling() {
  const highResolutionThreshold = 2560;
  document.documentElement.style.fontSize = window.screen.width >= highResolutionThreshold ? "125%" : "100%";
}

export function useAppBootstrap() {
  const profileRequested = useRef(false);
  const [profile, setProfile] = useState<Profile | undefined | null>(undefined);
  // Cached visits can render immediately while the async script refreshes configuration.
  const [initialConfig] = useState(() => readBootstrappedClientConfig() ?? readCachedClientConfig());
  const [config, setConfig] = useState(() => new ConfigWrapper(initialConfig ?? {}, defaultClientConfig));
  const [configStatus, setConfigStatus] = useState<ConfigStatus>(initialConfig ? "ready" : "loading");

  useEffect(() => {
    applyViewportScaling();
    if (profileRequested.current) return;
    profileRequested.current = true;

    client.user.profile().then(({ data }) => {
      setProfile(data ? {
        id: data.id,
        avatar: data.avatar || "",
        permission: data.permission,
        name: data.username,
      } : null);
    }).catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    const updateClientConfig = (nextConfig: Record<string, unknown>) => {
      const serialized = JSON.stringify(nextConfig);
      try {
        sessionStorage.setItem("config", serialized);
      } catch {
        // The page still works when browser storage is unavailable or full.
      }
      setConfig(current => JSON.stringify(current.config) === serialized
        ? current
        : new ConfigWrapper(nextConfig, defaultClientConfig));
      applyThemeColor(typeof nextConfig["theme.color"] === "string" ? nextConfig["theme.color"] : undefined);
      setConfigStatus("ready");
    };

    if (initialConfig) updateClientConfig(initialConfig);
    const bootstrapped = readBootstrappedClientConfig();
    if (bootstrapped) {
      updateClientConfig(bootstrapped);
      return;
    }

    // Subscribe on every effect setup, including React StrictMode's second setup.
    const script = document.getElementById("rin-client-config");
    const onError = () => setConfigStatus(current => current === "ready" ? current : "error");
    const onLoad = () => {
      const nextConfig = readBootstrappedClientConfig();
      if (nextConfig) updateClientConfig(nextConfig);
      else onError();
      clearTimeout(timeout);
    };
    const timeout = setTimeout(onError, CLIENT_CONFIG_TIMEOUT_MS);
    script?.addEventListener("load", onLoad);
    script?.addEventListener("error", onError);
    if (!script) onError();

    return () => {
      clearTimeout(timeout);
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
    };
  }, [initialConfig]);

  return { config, configStatus, profile };
}
