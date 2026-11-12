# Replay Coach 2.3.0 – Decision-level coaching

## Goal
Turn reconstructed replay evidence into a small number of prioritized, player-specific decision reviews. The coach must help a player learn from one match, not merely display action counts or export CSV.

## New decision reviews
- Inspect the exact pre-command front context for each selected-player attack.
- Flag opening another attack when multiple own targets are already active, incoming attacks are present, or a large share of the player's troops is committed.
- Flag the combination of an already-pressured target and an overloaded own front as a separate review prompt.
- Flag a 30-second window with falling own troop count, no own territory gain, and an attack object still active.
- Each prompt identifies the decision and timestamp, cites the observed state, suggests a concrete alternative decision check, gives a training task, and states confidence and limitations.
- High-priority decision reviews sort ahead of generic state observations.

## Safety of interpretation
These are evidence-backed review prompts, not claims that a move was objectively wrong. The engine snapshot does not fully establish map reachability, player vision, travel time, or counterfactual outcomes. In particular, no territory gain at +30 seconds does not prove an attack failed; an attack still in progress may simply need more time.

## Acceptance
- No selected player means no personal decision coaching.
- No pre-command front context means no front-pressure diagnosis.
- No +30 second state means no 30-second outcome claim.
- No automatic claim of an ideal move, win probability, causal success, or causal failure.
- Each decision prompt includes a timestamp, observed evidence, a possible alternative check, a training task, confidence and limitation.
- Existing import, engine verification, player selection, map, exports and platform builds remain intact.
