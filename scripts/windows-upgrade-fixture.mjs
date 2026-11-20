export const PLAYER_ID = "upgrade-regression-player";
export const GAME_ID = "upgrade-regression-game";

export const UPGRADE_FIXTURE = {
  playerId: PLAYER_ID,
  profile: {
    playerId: PLAYER_ID,
    profile: {
      publicID: "upgrade-public-player-001",
      username: "UpgradeRegressionPlayer",
      displayName: "Upgrade Regression Player",
      clanTag: "QA",
      stats: { games: 1, wins: 1, losses: 0, winRate: 1, totalTiles: 1842, peakTroops: 125000 },
      cosmetics: { pattern: { name: "first_strike" }, colorPalette: { name: "harbouring_steel" } },
    },
    games: [{
      gameId: GAME_ID,
      start: "2026-11-15T18:10:00.000Z",
      durationSeconds: 736,
      map: "Baikal Nuke Wars",
      mode: "Free For All",
      type: "Singleplayer",
      result: "victory",
      totalPlayers: 2,
      username: "UpgradeRegressionPlayer",
      clanTag: "QA",
      playerTeams: "2",
      rankedType: "unranked",
      previewUrl: null,
    }],
    nextCursor: null,
    pagesLoaded: 1,
    mapPreviews: { "Baikal Nuke Wars": "https://example.invalid/upgrade-regression-map.webp" },
    savedAt: 1794766200000,
  },
  match: {
    playerId: PLAYER_ID,
    game: {
      gameId: GAME_ID,
      start: "2026-11-15T18:10:00.000Z",
      durationSeconds: 736,
      map: "Baikal Nuke Wars",
      mode: "Free For All",
      type: "Singleplayer",
      result: "victory",
      totalPlayers: 2,
      username: "UpgradeRegressionPlayer",
      clanTag: "QA",
      playerTeams: "2",
      rankedType: "unranked",
      previewUrl: null,
    },
    result: {
      gameId: GAME_ID,
      previewUrl: null,
      fileSize: 4096,
      savePath: null,
      actionCount: 4,
      winner: ["player", "upgrade-client-01"],
      durationSeconds: 736,
      topLevelKeys: ["version", "gitCommit", "info", "turns"],
      mapName: "Baikal Nuke Wars",
      gameType: "Singleplayer",
      gameMode: "Free For All",
      difficulty: "Easy",
      playerCount: 2,
      turnCount: 5,
      chunkCount: null,
      eventGroups: [],
      recordShape: "game-record-with-turns",
      note: "Vollständiger Upgrade-Regressionsdatensatz nach dem API-GameRecord-Schema.",
      gitCommit: "7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de",
      hashedTurns: 3,
      engineCompatibility: {
        status: "version-compatible-hashes-available",
        replayCommit: "7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de",
        engineCommit: "7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de",
        recordedHashCount: 3,
        engineVersionCompatible: true,
        hashVerificationAvailable: true,
        message: "Replay und eingebundene Original-Engine sind kompatibel.",
      },
      decodedActions: [{
        turn: 71, seconds: 7.1, type: "spawn", category: "Spielsteuerung",
        label: "Startposition gewählt", details: "Startposition auf dem Festland gesetzt.", clientId: "upgrade-client-01",
      }],
      actionCounts: { spawn: 1, attack: 2, boat: 1 },
      categoryCounts: { Spielsteuerung: 1, Militär: 3 },
      coachInsights: [{
        id: "upgrade-insight-early-expansion", kind: "strength",
        title: "Frühe Expansion", summary: "Der Start wurde zügig ausgebaut.",
        evidence: "Gebietszuwachs in den ersten 100 Spielsekunden.",
        why: "Frühe Expansion erhöht das verfügbare Einkommen.",
        nextStep: "Diesen Expansionsrhythmus beibehalten.",
        confidence: "high", seconds: 71,
      }],
      actionAnalysis: {
        durationSeconds: 736, totalActions: 4, actionsPerMinute: 0.33,
        attackCount: 2, boatCount: 1, buildCount: 0, upgradeCount: 0,
        findings: [{ level: "success", title: "Angriff vorbereitet", text: "Angriff mit ausreichender Truppenstärke.", evidence: "2 Angriffe protokolliert." }],
      },
      playerStats: [{
        name: "Upgrade Regression Player", clientID: "upgrade-client-01",
        publicID: "upgrade-public-player-001",
        stats: { attacks: ["2"], betrayals: "0", finalTiles: "1842", peakTroops: "125000" },
      }],
      detailedAnalysis: {
        timeBuckets: [{ label: "0–120 s", fromSeconds: 0, toSeconds: 120, total: 2, attacks: 1, boats: 1, builds: 0, upgrades: 0, diplomacy: 0 }],
        buildsByUnit: [],
        actionsByClient: [{ clientId: "upgrade-client-01", count: 4, attacks: 2, boats: 1, builds: 0 }],
        attackTroops: { count: 2, total: 22000, average: 11000, min: 9000, max: 13000 },
        boatTroops: { count: 1, total: 8000, average: 8000, min: 8000, max: 8000 },
        actionsWithoutClient: 0,
      },
    },
    status: "loaded",
    simulation: {
      status: "verified",
      totalTicks: 7071,
      verifiedHashes: 3,
      samples: [{
        tick: 1000, frame: 1000,
        players: [{
          id: 7, name: "Upgrade Regression Player", clientID: "upgrade-client-01",
          spawnTile: 321814, alive: true, gold: 42000, goldEarned: 76000,
          tradeGold: 1200, trainGold: 800, piracyGold: 0, troops: 125000,
          tiles: 1842, units: 17, unitCounts: { city: 3, port: 1, factory: 1 },
          unitTroops: { city: 0, port: 0, factory: 0 }, unitsUnderConstruction: 1,
          outgoingAttacks: 1, incomingAttacks: 0,
          outgoingAttackDetails: [{ id: "attack-upgrade-01", targetID: 8, troops: 12000, retreating: false }],
          incomingAttackDetails: [], attackTroops: 12000,
          allies: 0, alliances: 0, targets: 1, betrayals: 0,
          isTraitor: false, isDecaying: false, inDoomsdayClock: false,
        }],
        totalUnits: 17, falloutTiles: 0,
      }],
      playerReview: {
        playerName: "Upgrade Regression Player", clientID: "upgrade-client-01",
        startTiles: 100, endTiles: 1842, tilesGained: 1742,
        startGold: 500, endGold: 42000, startTroops: 1000, endTroops: 125000,
        outgoingAttackSamples: 2, longestNoExpansionSeconds: 42,
      },
      actionReviews: [],
      spawnPositions: [],
      spawnPhaseEndTick: 70,
      spawnSnapshotTick: 71,
      spawnAlternatives: [],
      spawnAlternativesPlayerId: 7,
      spawnMode: "manual",
      message: "Original-Engine-Simulation erfolgreich; Replay-Hashes verifiziert.",
    },
    analysisStatus: "verified",
    updatedAt: 1794766200000,
  },
  replay: {
    playerId: PLAYER_ID,
    gameId: GAME_ID,
    record: {
      version: "v0.0.2",
      gitCommit: "7ee96860c717b1ea36870cdfa6d4bb1e9bccd6de",
      info: {
        gameID: GAME_ID,
        config: {
          gameMap: "Baikal Nuke Wars", difficulty: "Easy", donateGold: false,
          donateTroops: false, gameType: "Singleplayer", gameMode: "Free For All",
          gameMapSize: "Normal", nations: "disabled", bots: 0,
          infiniteGold: false, infiniteTroops: false, instantBuild: false,
          randomSpawn: false, disabledUnits: [], playerTeams: 2,
        },
        players: [
          {
            stats: {
              attacks: ["2"], betrayals: "0", finalTiles: "1842",
              conquests: ["0", "0", "1"], boats: { trans: ["1", "1"] },
              gold: ["500", "76000", "0", "0", "1200"],
              units: { city: ["3"], port: ["1"], fact: ["1"] },
              tiles: ["1842", "1742", "1742"], alliances: ["0", "0", "0", "0", "0", "0"],
              peakTroops: "125000",
            },
            clientID: "upgrade-client-01", username: "UpgradeRegressionPlayer",
            clanTag: "QA", publicID: "upgrade-public-player-001", persistentID: null,
          },
          {
            stats: { attacks: ["1"], betrayals: "0", finalTiles: "900", peakTroops: "45000" },
            clientID: "upgrade-client-02", username: "Opponent", clanTag: null,
            publicID: "upgrade-public-player-002", persistentID: null,
          },
        ],
        lobbyCreatedAt: 1794766200000, start: 1794766200000,
        end: 1794766936000, duration: 736, num_turns: 7071,
        winner: ["player", "upgrade-client-01"], lobbyFillTime: 0,
      },
      turns: [
        { turnNumber: 0, intents: [], hash: 41743880200001 },
        { turnNumber: 71, intents: [{ type: "spawn", tile: 321814, clientID: "upgrade-client-01" }], hash: 4426445551141177 },
        { turnNumber: 81, intents: [{ type: "attack", targetID: "upgrade-client-02", troops: 5538.4, clientID: "upgrade-client-01" }] },
        { turnNumber: 116, intents: [{ type: "boat", troops: 6972.8, dst: 321870, clientID: "upgrade-client-01" }], hash: 5972071306101131 },
        { turnNumber: 200, intents: [], hash: 7698155741481596 },
      ],
    },
  },
};

export const LOCAL_STORAGE_ENTRIES = {
  "ofrc:last-player-id": PLAYER_ID,
  "openfront-coach-training-goal": JSON.stringify({
    title: "Expansion ohne Überdehnung", instruction: "Nach zwei Expansionen die Front und Truppenreserve prüfen.",
    gameId: GAME_ID, mapName: "Baikal Nuke Wars",
    createdAt: "2026-11-15T18:10:00.000Z", completed: false,
  }),
  "openfront-replay-coach.phase-history.v1": JSON.stringify([{
    key: GAME_ID + ":upgrade-client-01", gameId: GAME_ID,
    playedAt: "2026-11-15T18:22:16.000Z",
    playerName: "Upgrade Regression Player", mapName: "Baikal Nuke Wars",
    phases: [
      { id: "early", label: "Frühphase", rating: "Starke Phase", territory: 320, income: 180, territoryRate: 2.4, incomeRate: 1.6 },
      { id: "mid", label: "Mittelphase", rating: "Gemischte Entwicklung", territory: 1100, income: 900, territoryRate: 1.1, incomeRate: 0.9 },
      { id: "late", label: "Endphase", rating: "Über deinem Partiedurchschnitt", territory: 1842, income: 4200, territoryRate: 0.8, incomeRate: 0.7 },
    ],
  }]),
  "openfront.update-center.auto-check.v1": "true",
  "openfront.update-center.last-successful-check.v1": "2026-11-15T18:30:00.000Z",
};

export function assertFixtureRelationships(snapshot, phase = "updated") {
  const fail = message => { throw new Error((phase === "baseline" ? "WINDOWS_UPGRADE_FIXTURE_ERROR: " : "DATA_LOSS_ERROR: ") + message); };
  if (snapshot.indexedDB?.missing) fail("application IndexedDB database is missing in the verified renderer profile");
  if (snapshot.indexedDB?.name !== "openfront-replay-coach" || snapshot.indexedDB?.version !== 3) {
    fail("unexpected application IndexedDB name or version");
  }
  const expectedSchema = [
    { name: "matches", keyPath: ["playerId", "game.gameId"], autoIncrement: false, indexes: [{ name: "by-player-id", keyPath: "playerId", unique: false, multiEntry: false }] },
    { name: "profiles", keyPath: "playerId", autoIncrement: false, indexes: [] },
    { name: "replay-records", keyPath: ["playerId", "gameId"], autoIncrement: false, indexes: [] },
  ];
  if (JSON.stringify(snapshot.indexedDB.stores) !== JSON.stringify(expectedSchema)) {
    fail("IndexedDB schema does not match the application matchStore schema: " + JSON.stringify(snapshot.indexedDB.stores));
  }
  if (snapshot.indexedDB.counts?.matches !== 1 || snapshot.indexedDB.counts?.profiles !== 1 || snapshot.indexedDB.counts?.["replay-records"] !== 1) {
    fail("unexpected application record counts: " + JSON.stringify(snapshot.indexedDB.counts));
  }
  const stores = snapshot.indexedDB.records;
  const profile = stores.profiles?.find(value => value.playerId === PLAYER_ID);
  const match = stores.matches?.find(value => value.playerId === PLAYER_ID && value.game?.gameId === GAME_ID);
  const replay = stores["replay-records"]?.find(value => value.playerId === PLAYER_ID && value.gameId === GAME_ID);
  if (!profile) fail("fixture relationship missing: player profile");
  if (profile.profile?.publicID !== "upgrade-public-player-001" || !profile.games?.some(game => game.gameId === GAME_ID)) fail("fixture relationship missing: complete player profile -> match");
  if (!match) fail("fixture relationship missing: stored match");
  if (!match.result || match.result.record !== undefined) fail("stored match must contain the summary while the raw replay remains separately stored");
  if (match.result.gameId !== GAME_ID || !match.result.actionAnalysis || !match.result.detailedAnalysis || !match.result.coachInsights?.length || !match.result.playerStats?.length) fail("fixture relationship missing: full import summary and analysis results");
  if (!match.simulation?.samples?.[0]?.players?.length || match.analysisStatus !== "verified") fail("fixture relationship missing: match -> complete verified simulation");
  if (!replay?.record?.info?.gameID || replay.record.info.gameID !== match.game.gameId || !replay.record.info.players?.some(player => player.clientID === "upgrade-client-01") || !replay.record.turns?.length) fail("fixture relationship missing: match -> complete raw replay record");
  return true;
}
