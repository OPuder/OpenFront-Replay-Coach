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
  const selectedPlayerSamples: SelectedPlayerSample<TPlayer>[] = samples
    .map(sample => ({
      tick: sample.tick,
      player: sample.players.find(player => player.clientID === selectedClientId),
    }))
    .filter((entry): entry is SelectedPlayerSample<TPlayer> => entry.player !== undefined);

  const firstAliveSample = selectedPlayerSamples.find(entry => entry.player.alive) ?? null;
  const lastAliveSample = [...selectedPlayerSamples].reverse().find(entry => entry.player.alive) ?? null;
  const firstEliminatedSample = selectedPlayerSamples.find(entry => !entry.player.alive) ?? null;
  const lastAliveTick = lastAliveSample?.tick ?? replayDurationTicks;

  // Only alive snapshots can contribute to phase ratings or player summaries.
  const alivePlayerSamples = selectedPlayerSamples.filter(
    entry => entry.player.alive && entry.tick <= lastAliveTick,
  );

  return {
    selectedPlayerSamples,
    alivePlayerSamples,
    firstAliveSample,
    lastAliveSample,
    firstEliminatedSample,
    lastAliveTick,
    playerEliminatedAtSeconds: firstEliminatedSample ? firstEliminatedSample.tick / 10 : null,
  };
}
