const SOURCE_HOSTS = new Set(["lin03.cn", "www.lin03.cn"]);

export default {
  fetch(request: Request): Response {
    const target = new URL(request.url);
    if (!SOURCE_HOSTS.has(target.hostname)) {
      return new Response("Not found", { status: 404 });
    }

    target.protocol = "https:";
    target.hostname = "blog.lin03.cn";
    target.port = "";
    // Preserve paths, query strings and request methods when changing the host.
    return Response.redirect(target.href, 308);
  },
};
