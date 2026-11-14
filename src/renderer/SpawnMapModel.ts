export interface SpawnMapMarkerPosition { leftPercent: number; topPercent: number }

/** Project a real OpenFront tile coordinate onto the exact map aspect ratio. */
export function projectSpawnMapMarker(
  x: number | null | undefined,
  y: number | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined,
): SpawnMapMarkerPosition | null {
  if (
    !Number.isFinite(x) || !Number.isFinite(y) ||
    !Number.isInteger(width) || !Number.isInteger(height) ||
    (width as number) <= 0 || (height as number) <= 0 ||
    (x as number) < 0 || (y as number) < 0 ||
    (x as number) >= (width as number) || (y as number) >= (height as number)
  ) return null;
  return {
    leftPercent: (x as number) / Math.max(1, (width as number) - 1) * 100,
    topPercent: (y as number) / Math.max(1, (height as number) - 1) * 100,
  };
}
