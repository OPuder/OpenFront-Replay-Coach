# Early-game spawn evidence

The opening coach uses the exact pinned OpenFront engine's spawn-position report when available.

## Evidence hierarchy

1. Exact `PlayerState.spawnTile` and its x/y coordinate from the matching replay engine.
2. Terrain and nearby neutral/coastal/impassable/highland/mountain counts only when terrain data from the matching engine revision was loaded successfully.
3. Territory centroid as a clearly labeled fallback when the exact spawn tile is unavailable.

## What the coach may say

- Start coordinate and start territory size.
- Recorded rival adjacency, border contacts and nearest rival distance.
- Measured nearby land/terrain composition when available.
- Whether the opening area was classified as isolated, contested, mixed or unknown by the engine analysis.

## What it must not claim

- A globally optimal spawn tile.
- An unplayed alternative spawn as if it were observed.
- Terrain composition when the matching terrain assets are missing.
- Strategic intent or causation that the replay does not establish.

Missing exact spawn or terrain data lowers coverage and confidence; it must not be replaced with fabricated zeros.
