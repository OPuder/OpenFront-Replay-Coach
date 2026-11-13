import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectPlayerSurvivalWindow } from '../src/renderer/phaseSurvival.ts';

test('excludes zeroed snapshots after elimination from player performance', () => {
  const samples = [
    { tick: 0, players: [{ clientID: 'player-1', alive: true, tiles: 120, goldEarned: 40 }] },
    { tick: 3000, players: [{ clientID: 'player-1', alive: true, tiles: 210, goldEarned: 180 }] },
    { tick: 5000, players: [{ clientID: 'player-1', alive: false, tiles: 0, goldEarned: 0 }] },
    { tick: 9000, players: [{ clientID: 'player-1', alive: false, tiles: 0, goldEarned: 0 }] },
  ];
  const result = selectPlayerSurvivalWindow(samples, 'player-1', 10000);
  assert.equal(result.firstAliveSample?.tick, 0);
  assert.equal(result.lastAliveSample?.tick, 3000);
  assert.equal(result.firstEliminatedSample?.tick, 5000);
  assert.equal(result.playerEliminatedAtSeconds, 500);
  assert.equal(result.lastAliveTick, 3000);
  assert.deepEqual(result.alivePlayerSamples.map(sample => sample.tick), [0, 3000]);
  assert.equal(result.alivePlayerSamples.at(-1)?.player.tiles, 210);
});

test('uses replay end when selected player survives the whole replay', () => {
  const samples = [
    { tick: 0, players: [{ clientID: 'player-1', alive: true }] },
    { tick: 7000, players: [{ clientID: 'player-1', alive: true }] },
  ];
  const result = selectPlayerSurvivalWindow(samples, 'player-1', 9000);
  assert.equal(result.lastAliveTick, 9000);
  assert.equal(result.playerEliminatedAtSeconds, null);
  assert.deepEqual(result.alivePlayerSamples.map(sample => sample.tick), [0, 7000]);
});

test('does not mix another player into the selected survival window', () => {
  const samples = [
    { tick: 0, players: [{ clientID: 'player-1', alive: true }, { clientID: 'player-2', alive: false }] },
    { tick: 1000, players: [{ clientID: 'player-1', alive: false }, { clientID: 'player-2', alive: true }] },
  ];
  const result = selectPlayerSurvivalWindow(samples, 'player-1', 1000);
  assert.deepEqual(result.alivePlayerSamples.map(sample => sample.player.clientID), ['player-1']);
  assert.equal(result.playerEliminatedAtSeconds, 100);
});

test('does not mistake lobby snapshots before the first alive state for elimination', () => {
  const samples = [
    { tick: 0, players: [{ clientID: 'player-1', alive: false, tiles: 0 }] },
    { tick: 100, players: [{ clientID: 'player-1', alive: false, tiles: 0 }] },
    { tick: 300, players: [{ clientID: 'player-1', alive: true, tiles: 12 }] },
    { tick: 900, players: [{ clientID: 'player-1', alive: true, tiles: 35 }] },
  ];
  const result = selectPlayerSurvivalWindow(samples, 'player-1', 1200);
  assert.equal(result.playerWasObservedAlive, true);
  assert.equal(result.firstAliveSample?.tick, 300);
  assert.equal(result.firstEliminatedSample, null);
  assert.equal(result.playerEliminatedAtSeconds, null);
  assert.deepEqual(result.alivePlayerSamples.map(sample => sample.tick), [300, 900]);
});

test('sorts out-of-order snapshots before selecting the elimination boundary', () => {
  const samples = [
    { tick: 6000, players: [{ clientID: 'player-1', alive: false, tiles: 0 }] },
    { tick: 4000, players: [{ clientID: 'player-1', alive: true, tiles: 90 }] },
    { tick: 1000, players: [{ clientID: 'player-1', alive: true, tiles: 20 }] },
    { tick: 5000, players: [{ clientID: 'player-1', alive: false, tiles: 0 }] },
  ];
  const result = selectPlayerSurvivalWindow(samples, 'player-1', 7000);
  assert.deepEqual(result.alivePlayerSamples.map(sample => sample.tick), [1000, 4000]);
  assert.equal(result.firstEliminatedSample?.tick, 5000);
  assert.equal(result.playerEliminatedAtSeconds, 500);
});

test('does not invent an elimination when the selected player is never observed alive', () => {
  const samples = [
    { tick: 0, players: [{ clientID: 'player-1', alive: false }] },
    { tick: 1000, players: [{ clientID: 'player-1', alive: false }] },
  ];
  const result = selectPlayerSurvivalWindow(samples, 'player-1', 1000);
  assert.equal(result.playerWasObservedAlive, false);
  assert.equal(result.firstEliminatedSample, null);
  assert.equal(result.playerEliminatedAtSeconds, null);
  assert.deepEqual(result.alivePlayerSamples, []);
});
