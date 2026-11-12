# OpenFront Replay Coach

**Replay analysis and tactical coaching for OpenFront — on Windows and on your phone.**

The Replay Coach reconstructs supported OpenFront game records with the original, pinned OpenFront engine. It turns recorded decisions into a readable match review: what happened, when it happened, which fronts were active and which game-state changes can be verified.

## Choose your edition

| Edition | How to use it | Installation |
| --- | --- | --- |
| **Windows Desktop** | Download the installer or portable ZIP from Releases | Installer or unzip-and-run |
| **Android / Browser** | Open the published HTTPS address in Chrome | No APK or installation required |
| **iPhone / iPad** | Open the published HTTPS address in Safari | No App Store installation required |

The browser edition is a Progressive Web App (PWA). You can use it directly in a browser. Adding it to the home screen is optional and only creates an app-like shortcut.

**Android publishing guide:** [docs/ANDROID_WEB_APP.md](docs/ANDROID_WEB_APP.md)

## What the Coach shows

- A personal match report based on the selected player's actions.
- Original-engine state reconstruction and replay hash verification.
- Territory, gold, troop and unit-count changes.
- Gross income observations, separated by recorded income source.
- Active attacks, committed attack troops, incoming pressure and other players already attacking a target.
- A chronological timeline and a compact replay review.
- CSV and replay JSON export.

The interface separates verified facts from observations and coaching prompts. It does not invent reachability, combat outcomes, win probabilities or hypothetical winning moves.

## Windows quick start

1. Download the Windows installer or portable ZIP from [GitHub Releases](https://github.com/OPuder/OpenFront-Replay-Coach/releases).
2. Install it, or extract the ZIP and start the application.
3. Paste an OpenFront game link or open a supported replay JSON.
4. Select your player in the match review.

The Windows package includes the pinned replay engine. Node.js, npm, Git and a separate OpenFront installation are not required.

## Android / browser quick start

After the web edition has been published to Cloudflare Pages:

1. Open the Cloudflare Pages HTTPS address in your mobile browser.
2. Paste an OpenFront match link or choose a supported API GameRecord JSON from the device.
3. Select your player and browse the Coach, Match, Economy, Military and Timeline views.
4. Optionally choose **Add to Home screen** in your browser.

Friends only need the published link. They do not need Git, Node.js, an APK or a developer setup.

The repository includes the Cloudflare Pages Functions, PWA manifest, service worker and build pipeline. The one-time Cloudflare connection is an owner action; see [the publishing guide](docs/ANDROID_WEB_APP.md).

## Data and privacy

- Replay files selected from the device are processed in the app and are not uploaded to a Coach-owned storage service.
- The mobile edition uses a same-origin proxy for OpenFront's public game/player API and official engine assets. It does not expose private endpoints, login tokens, account sessions or game-write operations.
- The service worker caches only the app shell and static assets. It does not cache replay JSON or public game/player API responses.
- The original engine version must match the replay's recorded engine commit before a full hash-verified replay is claimed.

## Limits

- Full state reconstruction requires a supported API GameRecord and compatible engine version.
- The browser edition requires an internet connection for OpenFront data and engine assets. Only the app shell and already cached static files are available offline.
- Very large replays can exceed mobile memory or hosting limits. Use the Windows desktop edition for large files.
- The browser edition is a responsive PWA, not a native Android APK.

## Development and validation

The OpenFront engine is pinned to commit:

bc3e3334c573c4959ec6a6745df6826d07233b4d

The repository validates three independent targets:
- Windows installer and portable ZIP, including a packaged-renderer smoke test.
- Browser/PWA build, icons, offline shell and Cloudflare proxy integration tests.
- Exact pinned OpenFront engine compatibility and replay-worker build.

See [Android web publishing](docs/ANDROID_WEB_APP.md) and the version notes in the docs folder.

## License

The OpenFront engine is included as a pinned upstream submodule. Its AGPL-3.0 license text is shipped in the Windows package. See the upstream project and the license file for the applicable terms.
