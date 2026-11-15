# Strategic coaching ↔ replay visualization contract

## Source contracts inspected

The integration consumes the actual structures produced by the coaching engine on
`feature/coaching-engine`:

- `ProCoachFinding`: `id`, `priority`, `confidence`, `title`, `decision`,
  `consequence`, `alternative`, `trainingRule`, `evidence`, `seconds`,
  `caveat`, and optional `strategicClass`.
- `EngineCoachInsight`: `id`, `kind`, `title`, `summary`, `evidence`,
  `nextStep`, `seconds`, `limitation`, and optional `priority`,
  `decision`, `alternative`, and `confidence`.
- `ReplayActionReview`: exact `frame`, `seconds`, `label`, `details`,
  `targetName`, `targetId`, and `targetSmallID` alongside before/after
  state deltas and pressure context.
- `ReplayStateSample`: `tick`, `frame`, players with numeric engine `id`,
  `clientID` and `name`, exact territory owner snapshots, and active unit
  movement targets.

The current PR #147 report returns a maximum of three prioritized findings in
`report.findings`, excluding low-priority context-only findings from the primary
set. The adapter retains that impact threshold and those findings are the source
for the three strategic cards. Its
`seconds` value is game time in seconds, not a wall-clock timestamp.

## Stable view contract

`ReplayCoachFinding` in `src/renderer/ReplayCoachIntegration.ts` is the
renderer-facing contract:

| Field | Meaning / source |
| --- | --- |
| `id` | Stable engine finding ID, scoped by `matchId` |
| `matchId` | Current imported replay's exact game ID, supplied by caller |
| `timestampSeconds` | Valid non-negative `ProCoachFinding.seconds`; otherwise null |
| `priority` | Engine priority high/medium/low |
| `confidence` | Engine confidence; unknown only when an upstream shape has no value |
| `decision` | `decision` from finding |
| `context` | Exact-time action details only when exactly one action matches; otherwise explicit unavailable-context text |
| `consequence` | `consequence` from finding |
| `alternative` | `alternative` from finding |
| `learningRule` | `trainingRule` from finding |
| `evidence` | Finding evidence plus an action/frame reference only on an unambiguous exact-second match |
| `affectedPlayers` | Selected player resolved by `clientID`; target only on a unique exact name match in the snapshot |
| `affectedOwnerIds` | Exact engine player IDs for the resolved players; used to tint their current territory |
| `uncertainty` | Upstream `caveat`, or a clear missing-data explanation |

The contract intentionally does not copy `targetSmallID` into an owner ID,
infer coordinates from player names, or derive a geographic attack path from
an attack relationship. The engine replay snapshot remains the authority for
territory and movement.

## Synchronization and UX

- Each timestamped strategic finding becomes a `pro-<finding-id>` timeline
  event. Selecting its card or timeline marker selects the same game second;
  the map uses the latest stored engine snapshot at or before that second.
- The selected finding's resolved player-owned territory receives a restrained
  highlight. This marks the players' full owned area, not a fabricated local
  target zone. The existing ownership, territory-change, and movement overlays
  remain intact.
- The first three prioritized findings are shown as compact cards. No additional
  metric dashboard is introduced.
- Decision, context, consequence, alternative, learning rule, evidence,
  timestamp, confidence, and uncertainty appear in the selected finding detail.
- Missing timestamps remain visible on a disabled card and do not create a
  fabricated time-zero marker. Ambiguous player matches are omitted rather
  than guessed.
- The external OpenFront viewer remains unsynchronized because the current
  bridge has no supported seek API. The in-app map and timeline are synchronized.

## Validation targets

- Europe: `c2R2JHZgUi`
- Levant: `dLNCLHCvMK`

The adapter tests cover exact-time evidence references, target-name ambiguity,
missing timestamps, match/player scoping, and the prohibition on treating
`targetSmallID` as a territory owner ID. The Electron UI harness covers
priority cards, selected-finding detail, affected-territory overlay, timeline
synchronization, keyboard navigation, and 320/375/768/1440 px viewports.
