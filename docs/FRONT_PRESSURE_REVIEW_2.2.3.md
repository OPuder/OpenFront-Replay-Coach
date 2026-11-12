# OpenFront Replay Coach 2.2.3 – Front pressure review

## Purpose
Add a time-local view of the selected player's active attack fronts immediately before each attack command and the pressure already applied to the target by other players.

## Evidence captured at the frame before an attack command
- Selected player: distinct active target count, outgoing attack count and committed troops, incoming attack count and incoming attack troops.
- Target player: all incoming attack count and troops, plus incoming attacks from players other than the selected player.
- Other attackers: distinct attacker count, their names, attack count, combined troops and retreating attack count.

## Coaching interpretation
- Show when the target was already attacked by other players.
- Show when the selected player opened an attack while already operating other active targets.
- Show simultaneous incoming attack pressure on the selected player.
- Use this as a review prompt to examine reserve distribution and target selection.

## Limits
- Attack objects are not the same as geographically separate fronts.
- Attack troop counts are the troop counts in the reconstructed active attack objects at the sampled frame.
- They do not include units that are merely available at home or that may be sent later.
- The sample cannot infer distance, reachability, travel path, terrain, combat outcome or win probability.
- A target already attacked by another player may be an opportunity or a warning; do not grade either automatically.
- Missing frame data remains unavailable; it must not be converted to zero.

## Acceptance criteria
- The observation frame is the frame immediately before the selected player's attack intent.
- Own outgoing and incoming attack pressure are reported separately.
- Target pressure from the selected player's own attack is excluded from the "other players" subtotal.
- The UI labels the subtotal unambiguously as other players' troops.
- Missing target/player context does not crash the analysis.
- Existing target result windows (+10s/+30s), hash verification and original engine pin remain unchanged.
- Renderer TypeScript, Electron TypeScript, original engine build, Windows packaging and packaged renderer smoke test all pass.
