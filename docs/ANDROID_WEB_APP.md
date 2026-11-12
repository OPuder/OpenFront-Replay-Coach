# Android / Browser Edition

The Android edition is the same React application as the Windows desktop edition. It runs in a current mobile browser and does not require an APK or Play Store installation.

## What users do

1. Open the published HTTPS address in Chrome on Android, Safari on iPhone/iPad, or a modern desktop browser.
2. Paste an OpenFront game link or choose a local API replay JSON through the browser's file picker.
3. Use the same coaching, economy, military, timeline and replay review screens as on Windows.
4. Optionally use the browser's **Add to Home screen** command. This creates an app-like shortcut; it is not required.

The PWA caches only its own HTML, JavaScript, CSS and icon shell. Replay JSON files, public game/player API responses and personal files are not stored by the service worker.

## Why the app uses Cloudflare Pages Functions

OpenFront's public API explicitly limits which browser origins may call it. A static app on an unrelated GitHub Pages hostname is not an allowed origin. The PWA therefore uses a same-origin Cloudflare Pages Functions proxy.

The proxy is intentionally restricted:
- GET /api/openfront/public/game/{id}
- GET /api/openfront/public/player/{id}
- GET /api/openfront/public/player/{id}/games?cursor=...
- GET /api/openfront/bootstrap
- GET /api/openfront/assets/{path} only when the path is present in OpenFront's current public asset manifest

It rejects other API paths and non-GET methods. It does not proxy game actions, account sessions, login tokens, private player information, or write requests. Replay files stay in the user's browser and are processed locally by the bundled replay engine.

## One-time publishing setup

The repository contains the Cloudflare Pages build and Functions. A repository owner must connect it to a Cloudflare account once; that account authorization cannot be performed from the GitHub repository alone.

1. In Cloudflare, open **Workers & Pages → Create → Pages → Connect to Git**.
2. Select OPuder/OpenFront-Replay-Coach.
3. Set the production branch to main.
4. Set the build command to bash scripts/build-cloudflare.sh.
5. Set the build output directory to dist.
6. Set the root directory to / and create the Pages project.

Cloudflare Pages detects and deploys the functions/ directory alongside the static dist/ output. The build script initializes the exact pinned OpenFront submodule, installs dependencies, builds the replay workers and renderer, and runs the PWA/proxy smoke test.

After the first deployment Cloudflare provides an HTTPS URL similar to https://project-name.pages.dev. That is the link to share with friends. They do not need Git, Node.js, an APK or a developer setup. A custom domain can be attached later in Cloudflare.

## Limits and differences

- The Android edition requires internet access for OpenFront's public API and engine assets. The cached shell can open offline, but replay simulation and public-data loading cannot run without a connection.
- Local API replay JSON is supported by the browser file picker. Very large replays may exceed mobile memory or the hosting platform's response limits; use the Windows desktop edition for those.
- The desktop edition continues to use its Electron preload and local file dialogs. The browser adapter is activated only when Electron has not provided window.replayAPI.
- The Android edition is a responsive browser/PWA release, not a native Android APK.
