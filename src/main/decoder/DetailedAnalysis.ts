import type { DecodedAction } from './ApiTurnDecoder';

export interface TimeBucket {
  label: string;
  fromSeconds: number;
  toSeconds: number;
  total: number;
  attacks: number;
  boats: number;
  builds: number;
  upgrades: number;
  diplomacy: number;
}
export interface DetailedAnalysis {
  timeBuckets: TimeBucket[];
  buildsByUnit: Array<{ unit: string; count: number }>;
  actionsByClient: Array<{ clientId: string; count: number; attacks: number; boats: number; builds: number }>;
  attackTroops: { count: number; total: number; average: number; min: number | null; max: number | null };
  boatTroops: { count: number; total: number; average: number; min: number | null; max: number | null };
  actionsWithoutClient: number;
}

function numberFromDetails(details: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = details.match(new RegExp(`(?:^| · )${escaped}: ([^·]+)`));
  if (!match) return null;
  const raw = match[1].trim().replace(/\./g, '').replace(',', '.');
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function analyzeDetailedActions(actions: DecodedAction[], durationSeconds: number): DetailedAnalysis {
  const bucketSize = 300;
  const bucketCount = Math.max(1, Math.ceil(Math.max(durationSeconds, 1) / bucketSize));
  const timeBuckets: TimeBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const fromSeconds = i * bucketSize;
    const toSeconds = Math.min((i + 1) * bucketSize, durationSeconds || (i + 1) * bucketSize);
    return { label: `${clock(fromSeconds)}–${clock(toSeconds)}`, fromSeconds, toSeconds, total: 0, attacks: 0, boats: 0, builds: 0, upgrades: 0, diplomacy: 0 };
  });
  const buildMap = new Map<string, number>();
  const clientMap = new Map<string, { count: number; attacks: number; boats: number; builds: number }>();
  const attackValues: number[] = [];
  const boatValues: number[] = [];
  let actionsWithoutClient = 0;

  for (const action of actions) {
    const bucketIndex = Math.min(timeBuckets.length - 1, Math.max(0, Math.floor(action.seconds / bucketSize)));
    const bucket = timeBuckets[bucketIndex];
    bucket.total++;
    if (action.type === 'attack') {
      bucket.attacks++;
      const n = numberFromDetails(action.details, 'Truppen');
      if (n !== null) attackValues.push(n);
    } else if (action.type === 'boat') {
      bucket.boats++;
      const n = numberFromDetails(action.details, 'Truppen');
      if (n !== null) boatValues.push(n);
    } else if (action.type === 'build_unit') {
      bucket.builds++;
      const unit = action.details.match(/(?:^| · )Typ: ([^·]+)/)?.[1]?.trim() || 'Unbekannt';
      buildMap.set(unit, (buildMap.get(unit) ?? 0) + 1);
    } else if (action.type === 'upgrade_structure') bucket.upgrades++;
    else if (action.category === 'Diplomatie') bucket.diplomacy++;

    if (!action.clientId) { actionsWithoutClient++; continue; }
    const stats = clientMap.get(action.clientId) ?? { count: 0, attacks: 0, boats: 0, builds: 0 };
    stats.count++;
    if (action.type === 'attack') stats.attacks++;
    if (action.type === 'boat') stats.boats++;
    if (action.type === 'build_unit') stats.builds++;
    clientMap.set(action.clientId, stats);
  }

  const summarize = (values: number[]) => ({
    count: values.length,
    total: values.reduce((sum, n) => sum + n, 0),
    average: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  });

  return {
    timeBuckets,
    buildsByUnit: [...buildMap.entries()].map(([unit, count]) => ({ unit, count })).sort((a, b) => b.count - a.count),
    actionsByClient: [...clientMap.entries()].map(([clientId, stats]) => ({ clientId, ...stats })).sort((a, b) => b.count - a.count),
    attackTroops: summarize(attackValues),
    boatTroops: summarize(boatValues),
    actionsWithoutClient,
  };
}
