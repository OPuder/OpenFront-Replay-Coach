export function resolveReplayJsonExport(
  gameId: string,
  cachedRaw: string | undefined,
  fallbackRecord: unknown,
  maxBytes: number,
): string {
  const id = String(gameId ?? "").trim();
  if (!id) throw new Error("Für den JSON-Export fehlt die Game-ID.");

  let raw = cachedRaw;
  if (!raw) {
    if (!fallbackRecord || typeof fallbackRecord !== "object" || Array.isArray(fallbackRecord)) {
      throw new Error("Die Original-JSON ist für diese Partie nicht mehr verfügbar. Öffne die Partie erneut über ihren OpenFront-Link und versuche den Export noch einmal.");
    }
    try {
      raw = JSON.stringify(fallbackRecord);
    } catch {
      throw new Error("Die gespeicherten Replay-Daten konnten nicht für den JSON-Export vorbereitet werden.");
    }
    if (!raw) throw new Error("Die gespeicherten Replay-Daten sind leer.");
  }

  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new Error(`Die Replay-JSON überschreitet das unterstützte Exportlimit von ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Die gespeicherten Replay-Daten sind keine gültige JSON-Datei.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Die gespeicherten Replay-Daten haben ein ungültiges Format.");
  }

  const root = parsed.game ?? parsed;
  const storedId = String(root?.info?.gameID ?? root?.info?.gameId ?? parsed?.gameID ?? "");
  if (storedId && storedId !== id) {
    throw new Error("Die gespeicherten Replay-Daten gehören zu einer anderen Partie. Der Export wurde abgebrochen.");
  }
  return raw;
}
