import { getOpenFrontBootstrap, jsonError } from "../../_lib/openfront.js";

export async function onRequest({ request }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError("Only GET is supported.", 405);
  }
  try {
    const result = await getOpenFrontBootstrap(new URL(request.url).origin);
    const manifest = Object.fromEntries(Object.entries(result.manifest).map(([key, value]) => {
      let path = String(value ?? "");
      if (/^https?:\\/\\//i.test(path)) path = new URL(path).pathname;
      return [key, path.startsWith("/") ? path : "/" + path];
    }));
    return new Response(JSON.stringify({
      manifest,
      cdnBase: result.cdnBase,
    }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError("OpenFront asset manifest could not be loaded: " + String(error instanceof Error ? error.message : error));
  }
}
