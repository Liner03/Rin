import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { completeAfterResponse } from "../utils/background";
import { buildClientConfigResponse } from "./config-helpers";

const BROWSER_CACHE_POLICY = "public, max-age=0, must-revalidate";
const EDGE_TTL_SECONDS = 30;

function cacheKey(c: AppContext) {
    return new Request(new URL("/api/config/client/bootstrap.js", c.req.url));
}

async function openCache() {
    if (typeof caches === "undefined") return undefined;
    try {
        return await caches.open("rin-client-bootstrap-v1");
    } catch (error) {
        console.error("Bootstrap cache unavailable", error);
        return undefined;
    }
}

export async function invalidateClientBootstrap(c: AppContext) {
    try {
        const cache = await openCache();
        await cache?.delete(cacheKey(c));
    } catch (error) {
        console.error("Bootstrap cache invalidation failed", error);
    }
}

export async function clientBootstrapResponse(c: AppContext) {
    const cache = await openCache();
    const key = cacheKey(c);
    try {
        const hit = await cache?.match(key);
        if (hit) {
            const response = new Response(hit.body, hit);
            response.headers.set("cache-control", BROWSER_CACHE_POLICY);
            return response;
        }
    } catch (error) {
        console.error("Bootstrap cache lookup failed", error);
    }

    const profile = <T>(name: string, task: () => Promise<T>) => profileAsync(c, name, task);
    const config = await profileAsync(c, "bootstrap_client_config", () => buildClientConfigResponse(
        c.get("clientConfig"), c.get("serverConfig"), c.get("env"), profile,
    ));
    const script = await profileAsync(c, "bootstrap_script", () => {
        const serialized = JSON.stringify(config)
            .replace(/</g, "\\u003C").replace(/>/g, "\\u003E").replace(/&/g, "\\u0026")
            .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        // Discover the Mirages hero while scripts/translations are still loading.
        return `globalThis.__RIN_CLIENT_CONFIG__=${serialized};\n` +
            `(function(){var c=globalThis.__RIN_CLIENT_CONFIG__;if(typeof document!=="undefined"&&location.pathname==="/"&&c["header.layout"]==="mirages"){var src=c["site.hero_image"]||c["site.avatar"];if(src){var l=document.createElement("link");l.rel="preload";l.as="image";l.href=src;l.fetchPriority="high";document.head.appendChild(l);}}})();`;
    });
    const response = new Response(script, {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": BROWSER_CACHE_POLICY },
    });
    if (cache) {
        const cached = response.clone();
        cached.headers.set("cache-control", `public, max-age=${EDGE_TTL_SECONDS}`);
        await completeAfterResponse(c, cache.put(key, cached).catch((error) => {
            console.error("Bootstrap cache write failed", error);
        }));
    }
    return response;
}
