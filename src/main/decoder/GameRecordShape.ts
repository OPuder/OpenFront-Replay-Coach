/**
 * Normalize public API envelopes into the canonical OpenFront GameRecord.
 * Some endpoints return the record directly while others wrap it in game/data/record.
 * Only unwrap known object envelopes; never guess at arbitrary nested properties.
 */
type JsonObject = Record<string, any>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function looksLikeGameRecord(value: unknown): value is JsonObject {
  if (!isObject(value)) return false;
  return isObject(value.info) || Array.isArray(value.turns) || isObject(value.append);
}

export function unwrapGameRecord(input: unknown): JsonObject {
  let current: unknown = input;
  for (let depth = 0; depth < 4 && isObject(current); depth++) {
    const candidates: unknown[] = [
      current.game,
      isObject(current.data) ? current.data.game : undefined,
      current.data,
      current.record,
      isObject(current.result) ? current.result.game : undefined,
      current.result,
    ];
    const next = candidates.find(candidate => candidate !== current && looksLikeGameRecord(candidate));
    if (!next) break;
    current = next;
  }
  return isObject(current) ? current : {};
}
