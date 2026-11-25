# Replay Coach 2.2.0 – Review and coaching overhaul

## Baseline
- Preserve the deterministic OpenFront engine integration pinned to `bc3e3334c573c4959ec6a6745df6826d07233b4d`.
- Preserve the 2.1.7 release and its `main` branch unchanged while work happens on `coach-review-overhaul-2.2.0`.
- Existing review UI mixes match metadata, engine diagnostics, simulation samples, coach cards, aggregate metrics and raw action tables.

## Correctness blockers
1. `ReplaySimulation.ts` currently sets `status: "verified"` when `recordedHashCount > 0`. That count only proves hashes exist. It does not prove calculated values match. The status must be unverified until per-turn comparison is implemented and all expected hashes match.
2. The message claiming all saved hash checkpoints matched is therefore unsupported and must be removed.
3. Action before/after deltas must not be presented as exact action outcomes when only sampled frames are used. Capture exact adjacent frames for each selected-player intent or mark unavailable.
4. A build must never be called economically good/bad without an observed state/economic baseline.

## Product information architecture
1. Match overview: map, mode, duration, result/players and simulation verification summary.
2. Coach first: concise strengths, review points, concrete evidence, confidence and actionable learning.
3. Decision timeline: chronological player-only events with links to relevant replay timestamps.
4. Economy and expansion: state-backed trends (gold, tiles, troops, buildings); show "not available" rather than infer.
5. Military and diplomacy: attack/boat outcomes, costs, losses, target changes and alliance context where snapshots support them.
6. Statistics: compact charts and action composition with explicit labels.
7. Technical details: raw action list, commit, hashes, worker details and diagnostics collapsed by default.

## Coaching contract
Every finding includes:
- exact time and action/decision;
- evidence from decoded intents and/or verified engine state;
- why it matters;
- what the player could compare or do differently;
- confidence/source coverage;
- limitations.
Never infer attack success from an attack intent, boat arrival from a boat intent, economic efficiency from build count, or inactivity from action gaps alone.

## Acceptance checks
- A replay with no hashes is unverified.
- A replay with any hash mismatch is unverified and reports the first mismatch.
- A replay is verified only after every expected hash was compared and matched by the pinned engine.
- The selected player's actions are isolated by exact clientID.
- Action outcome comparisons use exact before/after state frames; otherwise they display as unavailable.
- No fabricated tactical grades or counterfactuals.
- Technical detail is collapsed by default.
- Existing import, profile, map preview, export and original replay launching still work.
- Windows build, portable ZIP, installer and clean-machine smoke test pass before release.
