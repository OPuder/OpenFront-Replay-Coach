# Coach-first overhaul 2.3.0

## Product goal
The first screen after a replay should give the player one useful learning moment and one repeatable training task. It must not lead with a wall of counters or generic "check the replay" advice.

## UX changes
- Lead with the highest-priority, hash-verified decision review.
- Show the decision, timestamp, observed evidence, a concrete alternative check and a next-match training task together.
- Keep the primary decision list to at most three reviews.
- Move supporting engine observations behind a disclosure.
- Collapse the Early-, Mid- and Late-Game comparison by default.
- Compare phase rates (territory per minute and gross gold per minute), not only raw totals.
- State clearly when the replay does not contain enough evidence for a personal diagnosis.

## Coaching changes
- The front-load review now gives a measurable practice rule: test a 35% home-reserve floor before opening another player target, and compare it with observed incoming attack strength.
- The rule is explicitly presented as a training experiment, not a universal optimal strategy.
- Existing replay hash verification and original engine data remain authoritative.
- No diagnosis is generated from unverified replay state.

## Deliberate limitations
The current replay snapshots do not fully encode map reachability, travel time, visibility, terrain, or counterfactual outcomes. The coach therefore must not claim that a command caused a capture/loss or that a particular alternative would have won. The next development step is to validate recommendations against multiple real replays and add evidence-backed map/path context before making stronger strategic claims.

## Validation
The pull request must pass the existing Windows, engine, Android and web/PWA workflows. No release is created from this branch.
