# Blog domain redirects

This fork uses a small Worker to permanently redirect `lin03.cn` and
`www.lin03.cn` to `https://blog.lin03.cn`, preserving paths, query strings and
HTTP methods with status 308. It has no database, storage or cron bindings.

The explicit account in `wrangler.jsonc` is `1428637891@qq.com's Account`.
These settings are specific to this fork. Verify the account before deploying:

```sh
bunx wrangler whoami --config scripts/redirects/wrangler.jsonc
bun test scripts/redirects/worker.test.ts
bunx wrangler deploy --config scripts/redirects/wrangler.jsonc
```

Wrangler's [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
manage the apex DNS record and TLS certificate. `www` already has a DNS record,
so a Worker route handles `www.lin03.cn/*` while preserving that record. The
`www` DNS record must remain proxied through Cloudflare for the route to run.
Deploy from an interactive terminal to review any DNS conflicts. Only the two
configured hostnames should be changed.

This Worker is deployed separately from `rin-blog`. Blog deployments do not
need to redeploy it, and the destination hostname is deliberately not attached
to the redirect Worker.
