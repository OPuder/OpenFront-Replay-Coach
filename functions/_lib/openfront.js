const OPENFRONT_HOME = "https://openfront.io/";
const OPENFRONT_API = "https://api.openfront.io/public/";
let bootstrapCache = null;
let bootstrapFetchedAt = 0;

function readBalancedObject(source, start) {
  const open = source.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

export async function getOpenFrontBootstrap(origin) {
  if (bootstrapCache && Date.now() - bootstrapFetchedAt < 6 * 60 * 60 * 1000) {
    return bootstrapCache;
  }

  const response = await fetch(OPENFRONT_HOME, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: OPENFRONT_HOME,
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) {
    throw new Error("OpenFront bootstrap returned HTTP " + response.status);
  }
  const html = await response.text();
  const marker = html.indexOf("assetManifest:");
  if (marker < 0) throw new Error("OpenFront asset manifest was not found");
  const json = readBalancedObject(html, marker + "assetManifest:".length);
  if (!json) throw new Error("OpenFront asset manifest is incomplete");

  const manifest = JSON.parse(json);
  const cdnMatch = html.match(/cdnBase:\s*("(?:\\.|[^"\\])*")/);
  const cdnBase = cdnMatch ? JSON.parse(cdnMatch[1]) : "";
  bootstrapCache = { manifest, upstreamCdnBase: cdnBase };
  bootstrapFetchedAt = Date.now();
  return {
    ...bootstrapCache,
    // Relative to this Pages deployment; manifest URLs remain root-relative.
    cdnBase: "/api/openfront/assets",
  };
}

export function jsonError(message, status = 502) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function getRoutePath(request, prefix) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(prefix)) return "";
  try {
    return decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return "";
  }
}
