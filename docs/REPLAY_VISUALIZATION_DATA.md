# Replay visualization: data contract and limitations

## Exact territory source

The pinned OpenFront replay decoder reconstructs each frame as a `ReplayFrame`. Its `tileState` is the actual per-tile `Uint16Array`, not an estimate derived from player tile totals. The source engine's tile layout defines bits 0–11 as `ownerID`, bit 13 as fallout and bit 14 as defense bonus. The Coach masks only the owner bits (`0x0fff`) and stores a run-length encoded owner grid with the replay map dimensions. Run-length encoding preserves the full grid without retaining a second full `Uint16Array` for every sample.

Player names and palette colors come from the exact replay header's `PlayerStatic` entries. If the snapshot is missing, malformed, or dimensions do not match the tile buffer, the map reports that no territory snapshot is available.

## Attack and movement evidence

OpenFront `PlayerState.outgoingAttacks` exposes attacker/target player IDs, troop count, attack ID and retreat state. The Coach shows those as attack relationships, not as a fabricated geographic route.

OpenFront `UnitState` exposes `pos`, `targetTile` and `isActive`. When an active unit has a valid explicit target tile, the Coach draws the direction between those exact tile references and labels it as an engine-reported unit target. These lines are not relabelled as an attack path. The snapshot also shows the attack relationship list from the player state.

Territory changes are visible by moving between recorded replay samples. Samples are taken at the existing simulation cadence and around player actions; the selected timeline moment uses the latest stored territory snapshot at or before that time. It does not interpolate ownership between snapshots.

## Original OpenFront viewer synchronization

The existing platform bridge exposes only `openOfficialReplay(gameId)`. The browser adapter opens `https://openfront.io/#replay-viewer=<gameId>`; there is no seek/time argument, postMessage contract, viewer instance handle, or documented seek API in this repository. Therefore the Coach synchronizes the selected moment with its own territory and event panel but does **not** claim to seek the external viewer. The UI explicitly discloses this limitation. A real external seek requires a supported OpenFront integration/API; guessing URL parameters or injecting keyboard events would be unreliable and is intentionally not implemented.

## Dashboard training focus

The longitudinal report already excludes unverified/incomparable matches and groups recurring findings by stable finding ID. The dashboard now presents up to three training goals from that verified report, including occurrence counts and improvement/regression state. When evidence is insufficient, it continues to say so rather than inventing weaknesses.

## Validation

- `scripts/replay-territory.test.mjs`: owner-bit extraction, RLE round-trip, malformed snapshot rejection, time selection and tile-coordinate bounds.
- `scripts/replay-visualization-ui-test.mjs`: Electron viewport checks at 320, 375, 768 and 1440 CSS pixels, territory/movement presence, labelled controls, and keyboard Tab focus.
- Existing replay compatibility workflow still runs the pinned Europe/Levant replay and regression suites.

The official viewer seek remains a documented integration limitation, not a completed feature.
