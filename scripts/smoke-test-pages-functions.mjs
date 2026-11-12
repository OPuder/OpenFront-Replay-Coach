import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = {
  "maps/world/thumbnail.webp": "/_assets/maps/world/thumbnail.abc123.webp",
  "flags/1_East Anglia.svg": "/_assets/flags/1_East%20Anglia.def456.svg",
};
const calls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method ?? "GET" });
  if (url === "https://openfront.io/") {
    return new Response(
      "window.BOOTSTRAP_CONFIG = { assetManifest: " + JSON.stringify(manifest) +
      ', cdnBase: "https://cdn.example/game_assets" };',
      { headers: { "Content-Type": "text/html" } },
    );
  }
  if (url.startsWith("https://api.openfront.io/public/game/TooLarge")) {
    return new Response("large", {
      headers: { "Content-Type": "application/json", "Content-Length": String(251 * 1024 * 1024) },
    });
  }
  if (url.startsWith("https://api.openfront.io/public/game/")) {
    return Response.json({ gameId: "Game_123", info: {}, turns: [] });
  }
  if (url.startsWith("https://api.openfront.io/public/player/Player_123/games")) {
    return Response.json({ results: [], nextCursor: null });
  }
  if (url.startsWith("https://api.openfront.io/public/player/")) {
    return Response.json({ username: "TestPlayer", publicId: "Player_123" });
  }
  if (url.startsWith("https://cdn.example/game_assets/_assets/")) {
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { "Content-Type": "image/webp" },
    });
  }
  throw new Error("Unexpected upstream request: " + url);
};

try {
  const bootstrapModule = await import(pathToFileURL(path.join(root, "functions/api/openfront/bootstrap.js")));
  const publicModule = await import(pathToFileURL(path.join(root, "functions/api/openfront/public/[[path]].js")));
  const assetsModule = await import(pathToFileURL(path.join(root, "functions/api/openfront/assets/[[path]].js")));

  const bootstrapResponse = await bootstrapModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/bootstrap"),
  });
  assert.equal(bootstrapResponse.status, 200);
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrap.cdnBase, "/api/openfront/assets");
  assert.equal(bootstrap.manifest["maps/world/thumbnail.webp"], "/_assets/maps/world/thumbnail.abc123.webp");
  assert.equal(bootstrap.manifest["flags/1_East Anglia.svg"], "/_assets/flags/1_East%20Anglia.def456.svg");

  const gameResponse = await publicModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/public/game/Game_123"),
  });
  assert.equal(gameResponse.status, 200);
  assert.equal((await gameResponse.json()).gameId, "Game_123");

  const profileResponse = await publicModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/public/player/Player_123"),
  });
  assert.equal(profileResponse.status, 200);
  assert.equal((await profileResponse.json()).username, "TestPlayer");

  const gamesResponse = await publicModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/public/player/Player_123/games?cursor=next-page"),
  });
  assert.equal(gamesResponse.status, 200);
  assert.ok(calls.some(call => call.url.includes("cursor=next-page")), "Player history cursor was not forwarded");

  const deniedMethod = await publicModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/public/game/Game_123", { method: "POST" }),
  });
  assert.equal(deniedMethod.status, 405);

  const deniedRoute = await publicModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/public/admin/secrets"),
  });
  assert.equal(deniedRoute.status, 404);

  const oversizedReplay = await publicModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/public/game/TooLarge_123"),
  });
  assert.equal(oversizedReplay.status, 413);

  const assetResponse = await assetsModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/assets/_assets/flags/1_East%20Anglia.def456.svg"),
  });
  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get("content-type"), "image/webp");
  assert.ok(calls.some(call => call.url === "https://cdn.example/game_assets/_assets/flags/1_East%20Anglia.def456.svg"));

  const unknownAsset = await assetsModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/assets/_assets/private/secret.bin"),
  });
  assert.equal(unknownAsset.status, 404);

  const traversalAsset = await assetsModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/assets/_assets/%2e%2e/private.bin"),
  });
  assert.equal(traversalAsset.status, 400);

  const deniedAssetMethod = await assetsModule.onRequest({
    request: new Request("https://pwa.example/api/openfront/assets/_assets/maps/world/thumbnail.abc123.webp", { method: "POST" }),
  });
  assert.equal(deniedAssetMethod.status, 405);

  console.log("Cloudflare Pages Functions integration test passed.");
} finally {
  globalThis.fetch = originalFetch;
}
