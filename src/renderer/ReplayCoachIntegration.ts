import type { ProCoachFinding } from '../main/decoder/ProCoachAlgorithm';
import type { ReplayActionReview, ReplayStateSample } from './ReplaySimulation';

export interface ReplayCoachEvidenceReference {
  kind: 'action' | 'summary';
  seconds: number | null;
  frame: number | null;
  label: string;
  detail: string;
}

export interface ReplayCoachFinding {
  id: string;
  matchId: string;
  timestampSeconds: number | null;
  title: string;
  priority: 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  decision: string;
  context: string;
  consequence: string;
  alternative: string;
  learningRule: string;
  evidence: ReplayCoachEvidenceReference[];
  affectedPlayers: Array<{ name: string; ownerId: number | null; role: 'self' | 'target' }>;
  affectedOwnerIds: number[];
  uncertainty: string;
}

/**
 * Adapter from the real ProCoachFinding contract to the replay-view contract.
 * It deliberately resolves only exact-time actions, the selected player's
 * clientID, and unique target-name matches. It never treats targetSmallID as
 * a tile owner ID or invents a geographic attack path.
 */
export function toReplayCoachFindings(
  findings: readonly ProCoachFinding[],
  matchId: string,
  selectedClientId: string,
  actions: readonly ReplayActionReview[],
  samples: readonly ReplayStateSample[],
): ReplayCoachFinding[] {
  if (!matchId.trim() || !selectedClientId.trim()) return [];
  const latestSample = (seconds: number) => {
    const targetTick = seconds * 10;
    return [...samples].filter(sample => sample.tick <= targetTick)
      .sort((a, b) => b.tick - a.tick)[0] ?? null;
  };
  return findings.filter(finding => finding.priority !== 'low').slice(0, 3).map(finding => {
    const seconds = typeof finding.seconds === 'number' && Number.isFinite(finding.seconds) && finding.seconds >= 0
      ? finding.seconds : null;
    const matchingActions = seconds === null ? [] : actions.filter(action => action.seconds === seconds);
    const action = matchingActions.length === 1 ? matchingActions[0] : null;
    const sample = seconds === null ? null : latestSample(seconds);
    const ownPlayer = sample?.players.find(player => player.clientID === selectedClientId);
    const targetName = action?.targetName?.trim() ?? '';
    const targetMatches = targetName
      ? (sample?.players ?? []).filter(player => player.name.trim().toLocaleLowerCase() === targetName.toLocaleLowerCase())
      : [];
    const targetPlayer = targetMatches.length === 1 ? targetMatches[0] : null;
    const affectedPlayers: ReplayCoachFinding['affectedPlayers'] = [];
    if (ownPlayer) affectedPlayers.push({ name: ownPlayer.name, ownerId: ownPlayer.id, role: 'self' });
    if (targetPlayer && targetPlayer.id !== ownPlayer?.id)
      affectedPlayers.push({ name: targetPlayer.name, ownerId: targetPlayer.id, role: 'target' });
    const affectedOwnerIds = [...new Set(affectedPlayers.flatMap(player => player.ownerId === null ? [] : [player.ownerId]))];
    const evidence: ReplayCoachEvidenceReference[] = [{
      kind: action ? 'action' : 'summary',
      seconds,
      frame: action?.frame ?? null,
      label: action ? action.label : seconds === null ? 'Kein genauer Zeitpunkt erfasst' : 'Zeitbezogener Engine-Beleg',
      detail: finding.evidence,
    }];
    return {
      id: finding.id,
      matchId,
      timestampSeconds: seconds,
      title: finding.title,
      priority: finding.priority,
      confidence: finding.confidence,
      decision: finding.decision,
      context: action
        ? action.details || action.label
        : 'Der Coaching-Datensatz enthält keinen separaten Kontext. Es wird kein Kontext aus anderen Ereignissen hinzugedichtet.',
      consequence: finding.consequence,
      alternative: finding.alternative,
      learningRule: finding.trainingRule,
      evidence,
      affectedPlayers,
      affectedOwnerIds,
      uncertainty: finding.caveat || (seconds === null
        ? 'Kein belastbarer Replay-Zeitstempel für diese Erkenntnis vorhanden.'
        : 'Spieler- oder Gebietszuordnung ist nur sichtbar, wenn sie im passenden Engine-Snapshot eindeutig aufgelöst werden kann.'),
    };
  });
}
