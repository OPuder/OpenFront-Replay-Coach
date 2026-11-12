import { getOpenFrontBootstrap, getRoutePath, jsonError } from "../../../_lib/openfront.js";

const PREFIX = "/api/openfront/assets/";

export async function onRequest({ request }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError("Only static GET requests are supported.", 405);
  }

  const assetPath = getRoutePath(request, PREFIX);
  if (!assetPath || assetPath.length > 500 || assetPath.includes("..") || assetPath.includes("\\\\")) {
    return jsonError("Invalid OpenFront asset path.", 400);
  }

  try {
    const origin = new URL(request.url).origin;
    const bootstrap = await getOpenFrontBootstrap(origin);
    const allowedPath = assetPath.replace(/^\\/+/, "");
    const isListed = Object.values(bootstrap.manifest).some(value => {
      const text = String(value ?? "");
      if (!text) return false;
      if (/^https?:\\/\\//i.test(text)) return new URL(text).pathname.replace(/^\\/+/, "") === allowedPath;
      return text.replace(/^\\/+/, "") === allowedPath;
    });
    if (!isListed) return jsonError("Asset is not present in the official OpenFront manifest.", 404);

    const base = bootstrap.upstreamCdnBase || "https://openfront.io/";
    const upstream = base.replace(/\\/+$/, "") + "/" + allowedPath;
    const response = await fetch(upstream, {
      method: request.method,
      headers: { Accept: request.headers.get("Accept") || "*/*" },
      redirect: "error",
    });
    if (!response.ok) {
      return jsonError("OpenFront asset returned HTTP " + response.status + ".", response.status);
    }
    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return jsonError("OpenFront asset request failed: " + String(error instanceof Error ? error.message : error));
  }
}
