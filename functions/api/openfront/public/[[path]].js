import { getRoutePath, jsonError } from "../../../_lib/openfront.js";

const PREFIX = "/api/openfront/public/";

export async function onRequest({ request }) {
  if (request.method !== "GET") {
    return jsonError("Only public GET requests are supported.", 405);
  }

  const route = getRoutePath(request, PREFIX);
  const isGame = /^game\/[A-Za-z0-9_-]{4,80}$/.test(route);
  const isPlayer = /^player\/[A-Za-z0-9_-]{4,80}$/.test(route);
  const isPlayerGames = /^player\/[A-Za-z0-9_-]{4,80}\/games$/.test(route);
  if (!isGame && !isPlayer && !isPlayerGames) {
    return jsonError("This OpenFront public endpoint is not allowlisted.", 404);
  }

  const incoming = new URL(request.url);
  const upstream = new URL(route, "https://api.openfront.io/public/");
  const cursor = incoming.searchParams.get("cursor");
  if (isPlayerGames && cursor) {
    if (cursor.length > 2048) return jsonError("Cursor is too long.", 400);
    upstream.searchParams.set("cursor", cursor);
  }

  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers: { Accept: "application/json" },
      redirect: "error",
    });
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (isGame && contentLength > 100 * 1024 * 1024) {
      return jsonError("Replay is larger than the 100 MB mobile web limit. Use the Windows desktop edition.", 413);
    }
    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    if (contentLength > 0) headers.set("X-Replay-Content-Length", String(contentLength));
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return jsonError("OpenFront public API request failed: " + String(error instanceof Error ? error.message : error));
  }
}
