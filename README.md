# OpenFront Replay Coach

**Replay analysis and tactical coaching for OpenFront — Windows and Android.**

The Replay Coach reconstructs supported OpenFront game records with the original, pinned OpenFront engine. It turns recorded decisions into a readable match review: what happened, when it happened, which fronts were active and which game-state changes can be verified.

## Choose your edition

| Edition | Download | Installation |
| --- | --- | --- |
| **Windows Installer** | `OpenFront Replay Coach Setup.exe` | Normal Windows setup |
| **Windows Portable** | `OpenFront Replay Coach-win.zip` | Extract and run |
| **Android APK** | `OpenFront-Replay-Coach-Android.apk` | Install the APK once on the phone |

All three editions are published together in each successful GitHub Release. Windows checks for updates at startup and installs them automatically; the update button can also apply a release that appeared while the app was open. The Windows portable edition updates its extracted program files without touching user data. Android downloads and verifies the APK automatically when a new release is detected, then opens Android's required installation confirmation. Android needs no Cloudflare account, no Play Store account and no separate server. Friends can download the APK directly from Releases.

**Android setup:** [docs/ANDROID_WEB_APP.md](docs/ANDROID_WEB_APP.md)  
**Maintainer setup (permanent APK signing):** [docs/ANDROID_SIGNING.md](docs/ANDROID_SIGNING.md)

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

1. Download the installer or portable ZIP from [GitHub Releases](https://github.com/OPuder/OpenFront-Replay-Coach/releases).
2. Install it, or extract the ZIP and start the application.
3. Paste an OpenFront game link or open a supported replay JSON.
4. Select your player in the match review.

The Windows package includes the pinned replay engine. Node.js, npm, Git and a separate OpenFront installation are not required.

## Android quick start

1. Download `OpenFront-Replay-Coach-<version>-Android.apk` from the same GitHub Release.
2. Open the APK on the phone and confirm Android's installation prompt. Depending on the device, Android may ask you to allow installation from the browser or file manager used to open the APK.
3. Start **OpenFront Replay Coach**, enter your OpenFront profile or paste a match link, then select your player.

The Android app uses Capacitor's native HTTP stack for public OpenFront game/player data and official engine assets. It does not depend on a Cloudflare proxy. The APK is a direct download, not a Play Store listing.

**Automatic updates:** The first move from an older release to the updater-enabled bootstrap version still requires one manual install. After that, Windows installer and portable editions check on startup and install verified GitHub releases in the background. Android checks on startup, downloads the signed APK, verifies its SHA-256 digest and opens the Android package installer; Android still requires the user to confirm installation. Existing Android installations can only be updated in place when every APK uses the same permanent signing key. A first switch from a debug-signed APK to the permanent key requires one uninstall/reinstall. Maintainers: see [the signing setup](docs/ANDROID_SIGNING.md). See [the update architecture](docs/AUTO_UPDATES.md) for details.

## Data and privacy

- Replay files selected from the device are processed locally by the app and are not uploaded to a Coach-owned storage service.
- The Android app calls only OpenFront's public game/player API and public engine assets. It does not use account sessions, login tokens or game-write endpoints.
- - The original engine version must match the replay's recorded engine commit before a full hash-verified replay is claimed.

## Limits

- Full state reconstruction requires a supported API GameRecord and compatible engine version.
- OpenFront data and engine assets require an internet connection. A replay file already on the device can be opened locally, but live player/game history and the original engine still need internet access.
- Very large replays can exceed mobile memory. Use the Windows desktop edition for large files.
- The Android edition is an installable APK; it is not a Play Store release.

## Development and validation

The OpenFront engine is pinned to commit:

`bc3e3334c573c4959ec6a6745df6826d07233b4d`

Every main-branch release validates the pinned engine, Windows installer, Windows portable package and Android APK. The workflow publishes only after all required build and smoke-test jobs succeed.

## License

The OpenFront engine is included as a pinned upstream submodule. Its AGPL-3.0 license text is shipped in the Windows package. See the upstream project and the license file for the applicable terms.
