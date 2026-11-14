declare const __APP_VERSION__: string;
declare global {
  interface Window {
    replayAPI: {
      openReplay: () => Promise<ReplaySummary | null>;
      loadPlayer: (
        playerId: string,
        onProgress?: (progress: { loaded: number; pages: number; status: string }) => void,
      ) => Promise<PlayerPage>;
      resolveMapPreview: (gameId: string) => Promise<{ imageUrl: string | null }>;
      importReplayUrl: (
        url: string,
      ) => Promise<ApiImportSummary | { canceled: true; gameId: string }>;
      getReplayEngineAssets: () => Promise<{manifest:Record<string,string>;cdnBase:string}>;
      saveReplayJson: (
        gameId: string,
      ) => Promise<{ saved: boolean; shared?: boolean; canceled?: boolean; filePath?: string; bytes?: number }>;
      openOfficialReplay: (gameId: string) => Promise<{ opened: boolean; url: string }>;
    };
  }

  interface PlayerGame {
    previewUrl?: string;
    gameId: string;
    start?: string;
    durationSeconds?: number;
    map?: string;
    mode?: string;
    type?: string;
    result?: string;
    totalPlayers?: number;
    username?: string;
    clanTag?: string | null;
    playerTeams?: string | null;
    rankedType?: string;
  }

  interface PlayerPage {
    playerId: string;
    profile: Record<string, any>;
    games: PlayerGame[];
    nextCursor: string | null;
    pagesLoaded?: number;
    mapPreviews?: Record<string, string>;
  }

  interface DecodedAction {
    turn: number;
    seconds: number;
    type: string;
    category: "Wirtschaft" | "Militär" | "Diplomatie" | "Spielsteuerung" | "Sonstiges";
    label: string;
    details: string;
    clientId: string | null;
  }

  interface ReplaySummary {
    apiSummary?: ApiImportSummary;
    fileName: string;
    fileSize: number;
    gameId: string;
    map: string;
    mapName: string;
    mode: string;
    difficulty: string;
    bots: number | null;
    keyframeInterval: number | null;
    players: number;
    chunks: number;
    frames: number;
    secondsAt10Ticks: number;
    playerName: string;
    playerCount: number;
    unitTypes: number;
    eventGroups: string[];
    packedEventBytes: number;
    compressedChunkBytes: number;
    firstChunkLooksGzip: boolean;
    importStatus: string;
    decoderStatus: string;
    notes: string[];
    decodedActions?: DecodedAction[];
    actionCounts?: Record<string, number>;
    categoryCounts?: Record<string, number>;
    gitCommit?: string | null;
    hashedTurns?: number;
    firstTurn?: number | null;
    lastTurn?: number | null;
  }

  interface ApiImportSummary {
    record?: any;
    gameId: string;
    previewUrl?: string | null;
    fileSize: number;
    savePath: string | null;
    actionCount: number | null;
    winner: any;
    durationSeconds: number | null;
    topLevelKeys: string[];
    mapName: string;
    gameType: string;
    gameMode: string;
    difficulty: string;
    playerCount: number | null;
    turnCount: number | null;
    chunkCount: number | null;
    eventGroups: string[];
    recordShape: string;
    note: string;
    gitCommit?: string | null;
    hashedTurns?: number;
    engineCompatibility?: {
      status:
        | "version-compatible-hashes-available"
        | "version-compatible-no-hashes"
        | "engine-version-mismatch"
        | "missing-engine-version";
      replayCommit: string | null;
      engineCommit: string;
      recordedHashCount: number;
      engineVersionCompatible: boolean;
      hashVerificationAvailable: boolean;
      message: string;
    };
    decodedActions?: DecodedAction[];
    actionCounts?: Record<string, number>;
    categoryCounts?: Record<string, number>;
    coachInsights?: Array<{
      id: string;
      kind: "strength" | "review" | "neutral";
      title: string;
      summary: string;
      evidence: string;
      why: string;
      nextStep: string;
      confidence: "high" | "medium";
      seconds: number | null;
    }>;
    actionAnalysis?: {
      durationSeconds: number;
      totalActions: number;
      actionsPerMinute: number;
      attackCount: number;
      boatCount: number;
      buildCount: number;
      upgradeCount: number;
      findings: Array<{
        level: "info" | "warning" | "success";
        title: string;
        text: string;
        evidence: string;
      }>;
    } | null;
    playerStats?: Array<{
      name: string;
      clientID: string | null;
      publicID?: string | null;
      stats: Record<string, unknown>;
    }>;
    detailedAnalysis?: {
      timeBuckets: Array<{
        label: string;
        fromSeconds: number;
        toSeconds: number;
        total: number;
        attacks: number;
        boats: number;
        builds: number;
        upgrades: number;
        diplomacy: number;
      }>;
      buildsByUnit: Array<{ unit: string; count: number }>;
      actionsByClient: Array<{
        clientId: string;
        count: number;
        attacks: number;
        boats: number;
        builds: number;
      }>;
      attackTroops: {
        count: number;
        total: number;
        average: number;
        min: number | null;
        max: number | null;
      };
      boatTroops: {
        count: number;
        total: number;
        average: number;
        min: number | null;
        max: number | null;
      };
      actionsWithoutClient: number;
    };
  }
}
export {};
