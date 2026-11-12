# UX Overhaul 2.2.4

## Product direction

One React application and one coaching experience, with platform-specific adapters:
- Windows continues to use Electron preload, native file dialogs and the Windows installer/portable package.
- Android and other modern browsers use the browser adapter, device file picker and PWA shell.
- Both editions use the same action decoder, coaching insights and pinned original replay engine.

## Main usability changes

- The match header and actions are consolidated to avoid repeated match metadata.
- Player selection reruns the engine review for the selected player; it no longer only changes the selected name in the UI.
- Engine verification status remains visible while switching between analysis tabs.
- Analysis tabs use simpler labels: Coach, Match, Economy, Military and Timeline.
- Economy shows gross recorded income sources, gold balance changes, build actions and sampled unit stock.
- Military shows active outgoing attacks, committed troops, incoming pressure and targets already attacked by other players.
- All state summaries keep their evidence limitations visible; they are not presented as causal proof or automatic win ratings.
- Mobile navigation becomes a fixed bottom bar with safe-area spacing. Cards, tabs, tables and match controls adapt to narrow screens.
- Heavy replay-engine code is lazy-loaded when an engine simulation is actually started, keeping the initial dashboard bundle lighter.

## Mobile / PWA

- PWA manifest with 192px, 512px and maskable 512px PNG icons.
- Service worker caches the app shell and compiled static bundles only.
- Browser file picker supports local OpenFront API GameRecord JSON files.
- Same-origin Cloudflare Pages Functions proxy only allowlisted public game/player GET endpoints and official manifest-listed static assets.
- The service worker never stores replay JSON or public game/player API responses.

## Validation gates

A 2.2.4 merge requires all of the following on the same commit:
1. Windows build, NSIS installer, portable ZIP and packaged renderer smoke test.
2. Browser/PWA TypeScript and build, icon/offline shell smoke test and Cloudflare Pages Functions integration test.
3. Pinned upstream engine revision, TypeScript validation and worker bundling.
