# OpenFront Replay Coach 2.2.2 – Strategic review

## Purpose
Extend the 2.2.1 delayed-action review with exact target-aware player state and source-backed economy / unit composition observations.

## Engine data retained per sampled frame
- Player state: gold, gross gold earned, trade gold, train gold, piracy gold, troops, tiles and alive state.
- Diplomacy / pressure context: allies, alliances, targets, betrayals, traitor state, decay and doomsday-clock flags.
- Active attack state: attack IDs, attacker/target small IDs, remaining troops and retreating state.
- Owned unit stock: counts and troops by unit type, plus units under construction.

## Target-aware attack review
For an attack intent with a player target:
- Resolve the public target ID to the replay header's stable small ID.
- Compare the target's territory, gold and troops 10 / 30 seconds after the action.
- Compare the acting player's state over the same windows.
- Retain whether the target remained alive and whether an attack against that target was still active / retreating at the sampled frame.
- Neutral-land attacks or unresolved target IDs are not assigned a player target outcome.

These are time-window observations, not causal proof. Other attackers, passive captures, simultaneous actions and delayed movement may affect the same states. The absence of an active attack at +30 seconds is not itself success or failure.

## Economy and unit-stock review
- Report cumulative gross gold earned over the observed match.
- Show trade, train and piracy revenue as documented sub-counters of gross earned gold.
- Compare observed stock of cities, factories, ports, warships, transports, trade ships, defense posts, SAM launchers, missile silos and trains from the first to last sampled frames.
- Do not call gross income net profit, and do not infer ROI or individual construction costs from stock changes.

## Acceptance criteria
- Engine remains pinned to `bc3e3334c573c4959ec6a6745df6826d07233b4d`.
- Replay hash status remains driven by the original processor's successful completion.
- The selected player's sample includes all players so target changes can be compared.
- Attack targets resolve only through exact replay-header player IDs.
- Missing sample windows are reported as unavailable, not zero.
- A targeted attack can show target change, own change, live attack count and retreat status separately.
- Economy counters are explicitly labelled gross / source counters.
- Unit stock is described as sampled stock, not build totals or efficiency.
- Existing imports, player selection, replay launch, exports and Windows smoke test remain functional.
