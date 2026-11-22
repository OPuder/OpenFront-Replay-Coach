# Branch-history archive manifest

Created: 2026-11-22  
Repository: OPuder/OpenFront-Replay-Coach  
Main snapshot: `d040f248c84889b39212acad68e96236622d42cb`  
Archive commit: `c6ed592a1d34ba881e493520eb70568c61d5d1ac`

## Purpose and recovery

This branch is a history-preservation anchor for the 26 remote branches listed below.
The archive commit has the current `main` commit as its first parent and every listed
branch HEAD as an additional parent. This makes the original commits and their full
ancestry reachable from this one branch without merging their old file trees into
the current application.

**Important:** This is a Git-history archive, not a claim that every historical
branch's file changes are present in `main`. The application tree at the archive
commit is based on `main`. The listed commits can be restored as branches later,
for example: `git branch <branch-name> <commit-sha>`.

## Preserved branch heads

| Original branch | Preserved HEAD | Scope |
|---|---|---|
| `archive/integration-replay-coach-mainline-2026-11-22` | `d54b84d617c733c5f463029ac33e7c3d3ec3e27a` | Historical integration snapshot |
| `auto-release-on-main-2.2.5` | `bec5ae3886dc33301dfe992e43464fc0e9578fe9` | Older release automation |
| `automation/openfront-engine-latest` | `843a0df3319c34ea3f047c8c25f12958b745f4e3` | Historical engine discovery/catalog |
| `chore/free-agent-workflow-foundation` | `64e4c6144fbde571d117cfbe84a4b9c055f0b2ce` | Agent documentation and PR template |
| `chore/verify-permanent-android-signing` | `b9dede6a90ae189ff16f188b3a1fee2cac34a493` | Older Android signing workflow |
| `ci/retain-replay-validation-reports` | `030a64de98ef7a3e2ce02d7e13d0c8175d46a124` | Replay validation artifact workflow |
| `coach-phase-survival-fix-2.2.9` | `bc7220a29b2a6c725e835a6e0d2b8975e3fc5255` | Older coaching UX/phase fix |
| `coach-training-loop-redesign` | `572e7ebffa141b43793207b8b57adfcc26f31454` | Older training-loop UX |
| `feat/evidence-backed-strengths` | `aac41ea21b2071979621578b3ea65ba041236f27` | Evidence-backed strengths |
| `feat/multi-match-session-persistence` | `15b9e5bb90a2ec1746e01e4f6f96f878945788ad` | Historical match persistence implementation |
| `feat/spawn-map-coaching` | `ac8e57796b7787beea9f9091204e19e97921c5dd` | Spawn map plus engine/workflow history |
| `feature/build-fix` | `ce538384cb65086c5f13f5f6d0b3f310f51d67e6` | Deferred release and workflow validation work |
| `feature/cline-fixes` | `871a1e5eb932d8935d0a1c93bb9c4d714f71a984` | Historical Cline/replay fixes |
| `feature/release-update-system` | `0246550e2d97810604454f34035976e9b82497f8` | Deferred release/update validation work |
| `fix/release-upgrade-gate-hardening` | `955353632e5ae7119cd920b2112ccb60f9096511` | Older release-upgrade gate |
| `fix/resume-partial-replay-imports` | `42e0fa622ca88ff77b9bd7fa08a9cce8e276634b` | Partial import recovery and batch analysis |
| `fix/signed-android-release-upgrade-mainline` | `0fa27a7944ea5058c008ea3450527dec929296e2` | Signed Android release upgrade test |
| `fix/stabilize-android-emulator-ci` | `2958543774e86f0983d1e7f897617f80e0f27ff0` | Android emulator stabilization |
| `fix/startup-responsiveness-and-replay-export` | `6d3d774d5d64eaa765dbda5f7a57b6eab665221f` | Startup and replay JSON export fixes |
| `fix/updater-contract-portable-message` | `19d947135bd67ec5c272d89a0ca0e93eb57b89a0` | Merged in PR #160 |
| `longitudinal-player-history-2.2.9` | `f1c4fd79a885152687b40445f9f6acfb8bd303b1` | Older longitudinal dashboard |
| `perf/concurrency-aware-analysis-eta` | `33cec570b1543d9be4af535dd11759f2f09e0497` | Partial import and concurrent ETA work |
| `phase-skill-profile-2.2.8` | `d867f36f6718adcada6b4b7a19773aa9566000d7` | Older phase skill profile UI |
| `release/cleanup-v2` | `67e89213a38243e0e99438ccc63855a3adc82cbd` | Release workflow cleanup snapshot |
| `test/android-release-apk-upgrade` | `c98b66ff9ed0a17d9f2077591da5d9d762669d83` | Android signed APK upgrade test |
| `ux-simplification-visual-analytics` | `50a6747dcfaef8536454895b58b070155a7b5c6a` | Older visual analytics UX |

## Cleanup decision

- Keep `main`.
- Keep this branch: `archive/branch-history-consolidation-2026-11-22`.
- The 26 original refs can be deleted after the local bundle backup and preflight
  checks in the supplied PowerShell cleanup command.
- No changes to application source or GitHub Actions were made by this archive operation.
- Workflow/release changes remain archived for later deliberate review.
