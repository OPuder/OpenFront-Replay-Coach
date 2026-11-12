# Replay Coach – actionable debrief

## Product rule

The first screen after a match should answer three questions:

1. What is the single most useful moment to review?
2. What did the original game engine show immediately before and after that decision?
3. What one behaviour should the player practise next match?

Replay counts, totals and raw action timelines are supporting evidence. They must not replace a clear coaching conclusion.

## Evidence requirements

- Personal decision coaching is only generated for the selected player.
- Tactical findings are generated only after the matching original engine reproduces the recorded replay hashes.
- A decision card must name the exact command time and target, show the pre-command state and state the observed outcome window.
- A commanded troop amount is distinct from troops currently available and troops already travelling.
- A new front means a target that was not already represented by an active outgoing attack. Reinforcing an existing target must not be mislabeled as opening another front.
- Prefer the strongest example of a pattern over the earliest example.
- Show at most five engine findings in the primary debrief. Put generic action-log observations in a collapsed secondary section.
- The match summary must select one lead review finding and one matching training focus. If the replay is not verified, it must explain why it cannot provide a tactical diagnosis.

## Interpretation limits

A replay command is evidence that an order was issued, not proof that the player lost all troops sent, that the target was reachable, or that the order caused the subsequent state change.

A +30 second state delta is an observation window, not necessarily a completed battle. Active attack objects may still be travelling. Do not infer a failed attack from no territory gain at that point.

A troop commitment ratio is an estimate formed from the engine's available troop count, existing outgoing attack objects and the new command size. It is a review heuristic, not a universal optimal threshold.

The engine snapshot does not establish everything a human player knew or could see: map visibility, travel time, terrain, diplomacy, enemy intent and the value of diversion may require separate analysis.

## Current decision patterns

- New target while another target is already active and the new order consumes a high share of the estimated army.
- New target while incoming pressure exists and the remaining available reserve is small relative to the incoming force.
- Target already under attack by other players while the player's own force is stretched.
- Reduced own troop count without own territory growth at +30 seconds while an attack on that target remains active.

Each item is a review prompt with a concrete alternative decision check, one training task, confidence and a limitation. These patterns do not automatically label a command as a mistake.
