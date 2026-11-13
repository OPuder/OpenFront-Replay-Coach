export type PlayerSurvivalSnapshot = {
  clientID: string | null;
  alive: boolean;
};

export type ReplayPlayerSample<TPlayer extends PlayerSurvivalSnapshot> = {
  tick: number;
  players: readonly TPlayer[];
};

export type SelectedPlayerSample<TPlayer extends PlayerSurvivalSnapshot> = {
  tick: number;
  player: TPlayer;
};

export function selectPlayerSurvivalWindow<TPlayer extends PlayerSurvivalSnapshot>(
  samples: readonly ReplayPlayerSample<TPlayer>[],
  selectedClientId: string,
  replayDurationTicks: number,
) {
  // Engine snapshots can arrive out of order. Always establish chronology
  // before identifying the first alive/dead transition or calculating rates.
  const selectedPlayerSamples: SelectedPlayerSample<TPlayer>[] = samples
    .filter(sample => Number.isFinite(sample.tick) && sample.tick >= 0)
    .map(sample => ({
      tick: sample.tick,
      player: sample.players.find(player => player.clientID === selectedClientId),
    }))
    .filter((entry): entry is SelectedPlayerSample<TPlayer> => entry.player !== undefined)
    .sort((a, b) => a.tick - b.tick);

  // A player may be present as "not alive" in lobby/pre-spawn snapshots.
  // That is not an elimination. Only a dead snapshot AFTER observed survival
  // can end the player's performance window.
  const firstAliveIndex = selectedPlayerSamples.findIndex(entry => entry.player.alive);
  const firstAliveSample = firstAliveIndex >= 0 ? selectedPlayerSamples[firstAliveIndex] : null;
  const firstEliminatedSample = firstAliveIndex < 0
    ? null
    : selectedPlayerSamples.slice(firstAliveIndex + 1).find(entry => !entry.player.alive) ?? null;
  const alivePlayerSamples = firstAliveIndex < 0
    ? []
    : selectedPlayerSamples.slice(firstAliveIndex).filter(entry =>
        entry.player.alive && (!firstEliminatedSample || entry.tick < firstEliminatedSample.tick),
      );
  const lastAliveSample = alivePlayerSamples.at(-1) ?? null;
  const safeDuration = Number.isFinite(replayDurationTicks) && replayDurationTicks >= 0
    ? replayDurationTicks
    : 0;
  const lastAliveTick = firstEliminatedSample
    ? lastAliveSample?.tick ?? firstAliveSample?.tick ?? -1
    : safeDuration;

  return {
    selectedPlayerSamples,
    alivePlayerSamples,
    firstAliveSample,
    lastAliveSample,
    firstEliminatedSample,
    lastAliveTick,
    playerWasObservedAlive: firstAliveSample !== null,
    playerEliminatedAtSeconds: firstEliminatedSample ? firstEliminatedSample.tick / 10 : null,
  };
}
