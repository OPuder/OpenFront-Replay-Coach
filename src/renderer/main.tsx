import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FileUp, Gamepad2, Clock3, Users, Map, ShieldCheck, AlertTriangle, CheckCircle2, HardDrive, ArrowRight, Link2, DownloadCloud, LayoutDashboard, Brain, ListChecks, ChevronDown, Building2, Activity, Search, Trophy, Swords, Ship, TrendingUp, CalendarDays, SlidersHorizontal, Home, ChevronRight, Sparkles, Compass } from 'lucide-react';
import './style.css';
import { analyzeActions } from '../main/decoder/ActionAnalysis';
import { analyzeDetailedActions } from '../main/decoder/DetailedAnalysis';
import { buildCoachInsights } from '../main/decoder/CoachInsights';
import { buildEngineCoachInsights } from '../main/decoder/EngineCoachInsights';
import { buildProCoachReport } from '../main/decoder/ProCoachAlgorithm';
import { buildLongitudinalCoachReport } from '../main/decoder/LongitudinalCoach';
import { selectPrimaryCoachInsights } from '../main/decoder/CoachInsightSelection';
import { buildReplayTimeline } from '../main/decoder/CoachTimeline';
import { runConcurrentBatchAnalysis } from './BatchAnalysisRunner';
import { assessReplayCompatibility } from '../main/decoder/ReplayCompatibility';
import type { ReplaySimulationResult } from './ReplaySimulation';
import { selectPlayerSurvivalWindow } from './phaseSurvival';
import { installBrowserReplayAPI } from './platform/BrowserReplayAPI';
import { loadImportedMatches, loadPlayerLibrary, saveImportedMatch, savePlayerLibrary, type StoredAnalysisStatus, type StoredMatchEntry } from './matchStore';
import { UpdateCenter } from './UpdateCenter';
import { StrategyPlaybook } from './StrategyPlaybook';
import { selectGamesToAnalyze, selectGamesToImport } from './AutoLibrarySync';
import { getReplayDisplayState } from './replayPresentation';

// Electron provides its API through the isolated preload; normal browsers use
// the browser adapter so the same React interface powers Windows and Android.
installBrowserReplayAPI();
type BatchMatchItem = Omit<StoredMatchEntry, 'status' | 'analysisStatus'> & {
  status: StoredMatchEntry['status'] | 'queued' | 'running';
  analysisStatus?: StoredAnalysisStatus | 'queued' | 'running';
};

function App() {
  const [replay, setReplay] = useState<ReplaySummary | null>(null);
  const [activePage, setActivePage] = useState<'dashboard'|'games'|'analysis'>('dashboard');
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  function navigateTo(page: 'dashboard'|'games'|'analysis') {
    setActivePage(page);
    setMapRefreshKey(key => key + 1);
  }
  const [busy, setBusy] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState<{percent:number;phase:string}|null>(null);
  const [simulationResult, setSimulationResult] = useState<ReplaySimulationResult|null>(null);
  const engineReviewRunId = React.useRef(0);
  const batchRunId = React.useRef(0);
  const isDesktopShell = /Electron/i.test(navigator.userAgent);
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [error, setError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [url, setUrl] = useState('');
  const [apiResult, setApiResult] = useState<ApiImportSummary | null>(null);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [batchMatches, setBatchMatches] = useState<BatchMatchItem[]>([]);
  const [batchAnalysisBusy, setBatchAnalysisBusy] = useState(false);
  const [batchAnalysisProgress, setBatchAnalysisProgress] = useState<{done:number;total:number;gameId:string;percent:number;phase:string;active:number}|null>(null);
  const batchAnalysisRunId = React.useRef(0);
  const batchAnalysisAbort = React.useRef<AbortController|null>(null);
  const autoImportAttempted = React.useRef(new Set<string>());
  const autoAnalysisAttempted = React.useRef(new Set<string>());
  const [batchBusy, setBatchBusy] = useState(false);
  function refreshStoredMatch(item: StoredMatchEntry): BatchMatchItem {
    if(!item.result?.record) return item;
    const compatibility=assessReplayCompatibility(item.result.record);
    const wasUnsupported=item.analysisStatus==='unsupported'||item.status==='engine-mismatch';
    const analysisStatus:StoredAnalysisStatus=compatibility.engineVersionCompatible
      ? item.simulation?.status==='verified'?'verified':wasUnsupported?'pending':item.analysisStatus??'pending'
      : 'unsupported';
    return {
      ...item,
      result:{...item.result,engineCompatibility:compatibility},
      status:compatibility.engineVersionCompatible?'loaded':'engine-mismatch',
      analysisStatus,
    };
  }
  async function refreshStoredMatches(id:string,matches:StoredMatchEntry[]):Promise<BatchMatchItem[]> {
    const refreshed=matches.map(refreshStoredMatch);
    const writes=refreshed.map(item=>{
      const stored:StoredMatchEntry={
        ...item,
        status:item.status==='queued'||item.status==='running'?'loaded':item.status,
        analysisStatus:item.analysisStatus==='queued'||item.analysisStatus==='running'?'pending':item.analysisStatus,
      };
      return saveImportedMatch(id,stored).catch(storageError=>console.warn('[ReplayCoach] Aktualisierte Engine-Kompatibilität konnte nicht gespeichert werden:',storageError));
    });
    await Promise.all(writes);
    return refreshed;
  }
  const [batchProgress, setBatchProgress] = useState<{done:number;total:number;gameId:string}|null>(null);
  const [decodedActions, setDecodedActions] = useState<DecodedAction[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [playerPage, setPlayerPage] = useState<PlayerPage | null>(null);
  const [playerBusy, setPlayerBusy] = useState(false);
  const [playerProgress, setPlayerProgress] = useState<{loaded:number;pages:number;status:string}|null>(null);
  const [gameFilter, setGameFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [gameSearch, setGameSearch] = useState('');
  const [libraryPage, setLibraryPage] = useState(0);
  React.useEffect(()=>{setLibraryPage(0);},[gameFilter,modeFilter,typeFilter,gameSearch]);
  React.useEffect(() => { let active=true; const restore=async()=>{ try { const savedId=window.localStorage.getItem('ofrc:last-player-id'); if(!savedId) return; const [cachedPage,cachedMatches]=await Promise.all([loadPlayerLibrary(savedId),loadImportedMatches(savedId)]); if(!active) return; let page=cachedPage; try { page=await window.replayAPI.loadPlayer(savedId,progress=>{if(active)setPlayerProgress(progress);}); await savePlayerLibrary(page); } catch(syncError) { console.warn('[ReplayCoach] Online-Abgleich beim Start fehlgeschlagen; nutze lokalen Stand:',syncError); } if(!active || !page) return; const refreshed=await refreshStoredMatches(page.playerId,cachedMatches); if(!active) return; setPlayerId(savedId); setPlayerPage(page); setBatchMatches(refreshed); } catch(e) { console.warn('[ReplayCoach] Gespeicherte Spielbibliothek konnte nicht geladen werden:',e); } }; void restore(); return ()=>{active=false;}; }, []);
  async function loadPlayer() { autoImportAttempted.current.clear(); autoAnalysisAttempted.current.clear(); cancelBatchAnalysis(); cancelBatchImport(); setPlayerBusy(true); setError(''); setPlayerProgress({loaded:0,pages:0,status:'Profil wird geladen …'}); try { const page = await window.replayAPI.loadPlayer(playerId, progress => setPlayerProgress(progress)); setPlayerPage(page); setSelectedGameIds([]); setLibraryPage(0); const matches=await loadImportedMatches(page.playerId); const refreshed=await refreshStoredMatches(page.playerId,matches); setBatchMatches(refreshed); await savePlayerLibrary(page); window.localStorage.setItem('ofrc:last-player-id',page.playerId); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setPlayerBusy(false); } }
  function toggleGameSelection(gameId:string) { setSelectedGameIds(current => current.includes(gameId) ? current.filter(id=>id!==gameId) : [...current,gameId]); }
  function selectFilteredGames() { const ids=filteredGames.map(game=>game.gameId); setSelectedGameIds(current=>ids.every(id=>current.includes(id)) ? current.filter(id=>!ids.includes(id)) : [...new Set([...current,...ids])]); }
  async function loadSelectedGames(gameIds=selectedGameIds) {
    if (!playerPage || batchBusy || batchAnalysisBusy || gameIds.length===0) return;
    const games=gameIds.map(id=>playerPage.games.find(game=>game.gameId===id)).filter((game):game is PlayerGame=>Boolean(game));
    const runId=++batchRunId.current;
    const existingIds=new Set(batchMatches.filter(item=>Boolean(item.result)).map(item=>item.game.gameId));
    setBatchBusy(true); setError(''); setBatchProgress({done:0,total:games.length,gameId:''});
    let done=0;
    let nextIndex=0;
    const publishImportProgress=(gameId='')=>setBatchProgress({done,total:games.length,gameId});
    const worker=async()=>{
      while(runId===batchRunId.current){
        const index=nextIndex++;
        if(index>=games.length) return;
        const game=games[index];
        if(existingIds.has(game.gameId)){ done++; publishImportProgress(game.gameId); continue; }
        setBatchMatches(current=>[...current.filter(item=>item.game.gameId!==game.gameId),{game,status:'running'}]);
        try {
          const imported=await window.replayAPI.importReplayUrl(`https://openfront.io/w5/game/${game.gameId}`);
          if(runId!==batchRunId.current) return;
          if ('canceled' in imported) throw new Error('Import wurde abgebrochen.');
          const normalizeMap=(value:unknown)=>String(value??'').trim().toLowerCase().replace(/[\\s.()_-]+/g,'');
          const selectedMap=game.map||imported.mapName;
          const previews=Object.entries(playerPage.mapPreviews??{});
          const preview=(selectedMap ? playerPage.mapPreviews?.[String(selectedMap).trim().toLowerCase()] : undefined) || previews.find(([key])=>normalizeMap(key)===normalizeMap(selectedMap))?.[1] || previews.find(([key])=>normalizeMap(key)===normalizeMap(imported.mapName))?.[1] || game.previewUrl;
          if (preview) imported.previewUrl=preview;
          else if (selectedMap) { try { imported.previewUrl=(await window.replayAPI.resolveMapPreview(selectedMap)).imageUrl; } catch { imported.previewUrl=null; } }
          if(runId!==batchRunId.current) return;
          const status: 'engine-mismatch' | 'loaded'=imported.engineCompatibility?.engineVersionCompatible===false ? 'engine-mismatch' : 'loaded';
          const entry:BatchMatchItem={game,result:imported,status,analysisStatus:status==='engine-mismatch'?'unsupported':'pending'};
          existingIds.add(game.gameId);
          setBatchMatches(current=>[...current.filter(item=>item.game.gameId!==game.gameId),entry]);
          try { await persistBatchItem(entry); } catch(storageError) { console.warn('[ReplayCoach] Replay wurde geladen, konnte aber nicht lokal gesichert werden:',storageError); setError(`Partie ${game.gameId} geladen, aber lokale Speicherung fehlgeschlagen: ${storageError instanceof Error?storageError.message:String(storageError)}`); }
        } catch (e) {
          if(runId!==batchRunId.current) return;
          const entry:BatchMatchItem={game,status:'failed',analysisStatus:'failed',error:e instanceof Error?e.message:String(e)};
          setBatchMatches(current=>[...current.filter(item=>item.game.gameId!==game.gameId),entry]);
          try { await persistBatchItem(entry); } catch(storageError) { console.warn('[ReplayCoach] Importfehler konnte nicht lokal gespeichert werden:',storageError); }
        }
        done++;
        publishImportProgress(game.gameId);
      }
    };
    // A small network pool cuts library import time without overwhelming the
    // OpenFront public API or causing dozens of simultaneous large downloads.
    const importConcurrency=isMobileDevice?1:3;
    await Promise.all(Array.from({length:Math.min(importConcurrency,games.length||1)},()=>worker()));
    if(runId===batchRunId.current) { setBatchProgress({done,total:games.length,gameId:''}); setBatchBusy(false); }
  }
  function cancelBatchImport() { batchRunId.current++; setBatchBusy(false); setBatchProgress(current=>current?{...current,gameId:''}:null); }
  function cancelBatchAnalysis() {
    batchAnalysisRunId.current++;
    batchAnalysisAbort.current?.abort();
    batchAnalysisAbort.current=null;
    setBatchAnalysisBusy(false);
    setBatchAnalysisProgress(null);
    setBatchMatches(current=>current.map(item=>item.analysisStatus==='queued'||item.analysisStatus==='running'?{...item,analysisStatus:'pending'}:item));
  }
  function resolveProfileClientId(result: ApiImportSummary): string | null {
    const players=result.record?.info?.players??[];
    const publicId=String(playerPage?.profile?.publicId??playerPage?.profile?.publicID??'');
    let player=publicId?players.find((p:any)=>String(p.publicID??p.publicId??'')===publicId):undefined;
    if(!player) {
      const name=String(playerPage?.profile?.username??playerPage?.profile?.displayName??'').trim().toLowerCase();
      if(name) player=players.find((p:any)=>String(p.username??p.displayName??p.name??'').trim().toLowerCase()===name);
    }
    return player?.clientID==null?null:String(player.clientID);
  }
  async function persistBatchItem(item: BatchMatchItem) {
    if(!playerPage) return;
    const stored: StoredMatchEntry={
      game:item.game,
      result:item.result,
      status:item.status==='queued'||item.status==='running'?'loaded':item.status,
      error:item.error,
      simulation:item.simulation,
      analysisStatus:item.analysisStatus==='queued'||item.analysisStatus==='running'?'pending':item.analysisStatus,
      analysisError:item.analysisError,
    };
    await saveImportedMatch(playerPage.playerId,stored);
  }
  async function analyzeSelectedGames(gameIds=selectedGameIds) {
    if(!playerPage||batchBusy||batchAnalysisBusy||batchAnalysisAbort.current||gameIds.length===0) return;
    const candidates=gameIds.map(id=>batchMatches.find(item=>item.game.gameId===id)).filter((item):item is BatchMatchItem=>Boolean(item?.result));
    if(!candidates.length) return;
    const runId=++batchAnalysisRunId.current;
    const controller=new AbortController();
    batchAnalysisAbort.current=controller;
    setBatchAnalysisBusy(true); setError('');
    setBatchAnalysisProgress({done:0,total:candidates.length,gameId:'',percent:0,phase:'Analyse wird vorbereitet',active:0});
    try {
      const {simulateReplay,buildReplayEngineAssets}=await import('./ReplaySimulation');
      if(runId!==batchAnalysisRunId.current||controller.signal.aborted) return;
      await runConcurrentBatchAnalysis<BatchMatchItem,ReplaySimulationResult>(candidates,{
        // Two independent engine workers substantially reduce total wait time on PCs.
        // Phones remain sequential to protect memory, thermals and battery life.
        concurrency:isMobileDevice?1:2,
        signal:controller.signal,
        getId:item=>item.game.gameId,
        isCompatible:item=>Boolean(item.result?.record&&item.result.engineCompatibility?.engineVersionCompatible===true),
        analyze:async(item,onProgress,signal)=>{
          const result=item.result!;
          const preferredClientId=resolveProfileClientId(result);
          if(!preferredClientId) throw new Error('Das OpenFront-Profil konnte keinem Spieler dieser Partie eindeutig zugeordnet werden.');
          const assets=buildReplayEngineAssets(result.record);
          return simulateReplay(result.record,assets,onProgress,50,preferredClientId,signal);
        },
        onStatus:async(item,status,simulation,error)=>{
          const analysisError=status==='unsupported'
            ? item.result?.engineCompatibility?.message??error
            : status==='unverified'?simulation?.message
            : status==='failed'?error
            : undefined;
          const updated:BatchMatchItem={
            ...item,
            analysisStatus:status,
            simulation:status==='verified'||status==='unverified'?simulation:status==='unsupported'?undefined:item.simulation,
            analysisError,
          };
          setBatchMatches(current=>current.map(entry=>entry.game.gameId===item.game.gameId?updated:entry));
          if(status==='verified'||status==='unverified'||status==='unsupported'||status==='failed') {
            try { await persistBatchItem(updated); }
            catch(storageError) { console.warn('[ReplayCoach] Analyseergebnis konnte nicht lokal gesichert werden:',storageError); }
          }
        },
        onProgress:progress=>{
          if(runId===batchAnalysisRunId.current) setBatchAnalysisProgress(progress);
        },
      });
    } catch(analysisError) {
      if(runId===batchAnalysisRunId.current) setError(analysisError instanceof Error?analysisError.message:String(analysisError));
    } finally {
      if(runId===batchAnalysisRunId.current) {
        batchAnalysisAbort.current=null;
        setBatchAnalysisBusy(false);
        setBatchAnalysisProgress(null);
      }
    }
  }
  React.useEffect(() => {
    if(!playerPage || playerBusy || batchBusy || batchAnalysisBusy) return;
    const missing=selectGamesToImport(playerPage.games,batchMatches,autoImportAttempted.current);
    if(missing.length){ missing.forEach(game=>autoImportAttempted.current.add(game.gameId)); void loadSelectedGames(missing.map(game=>game.gameId)); return; }
    const pending=selectGamesToAnalyze(batchMatches,autoAnalysisAttempted.current);
    if(pending.length){ pending.forEach(item=>autoAnalysisAttempted.current.add(item.game.gameId)); void analyzeSelectedGames(pending.map(item=>item.game.gameId)); }
  },[playerPage,batchMatches,playerBusy,batchBusy,batchAnalysisBusy]);

  function openBatchMatch(gameId:string) {
    cancelBatchAnalysis();
    const item=batchMatches.find(entry=>entry.game.gameId===gameId);
    if (!item?.result) return;
    engineReviewRunId.current++;
    setSimulationProgress(null); setSimulationResult(item.simulation??null);
    setApiResult(item.result); setDecodedActions(item.result.decodedActions??[]); setReplay(null);
    setUrl(`https://openfront.io/w5/game/${gameId}`); setMapRefreshKey(key=>key+1); setActivePage('analysis');
    if(!item.simulation) void runEngineReview(item.result,undefined,item.game);
  }
  async function choosePlayerGame(gameId: string) {
    cancelBatchAnalysis();
    engineReviewRunId.current++;
    setSimulationProgress(null);
    setUrl(`https://openfront.io/w5/game/${gameId}`);
    setBusy(true); setError('');
    try {
      const selectedGame = playerPage?.games.find(game => game.gameId === gameId);
      const cachedItem = batchMatches.find(item=>item.game.gameId===gameId && item.result);
      const cached = cachedItem?.result;
      const imported = cached ?? await window.replayAPI.importReplayUrl(`https://openfront.io/w5/game/${gameId}`);
      if (!('canceled' in imported)) {
        const result = imported;
        const normalizeMap = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[\\s.()_-]+/g, '');
        const selectedMap = selectedGame?.map || result.mapName;
        const previewEntries = Object.entries(playerPage?.mapPreviews ?? {});
        const libraryPreview =
          (selectedMap ? playerPage?.mapPreviews?.[String(selectedMap).trim().toLowerCase()] : undefined) ||
          previewEntries.find(([key]) => normalizeMap(key) === normalizeMap(selectedMap))?.[1] ||
          previewEntries.find(([key]) => normalizeMap(key) === normalizeMap(result.mapName))?.[1] ||
          selectedGame?.previewUrl;
        if (libraryPreview) {
          result.previewUrl = libraryPreview;
        } else if (selectedMap) {
          try {
            const resolved = await window.replayAPI.resolveMapPreview(selectedMap);
            result.previewUrl = resolved.imageUrl ?? null;
          } catch (previewError) {
            console.warn('[ReplayCoach] Kartenbild für Analyse konnte nicht aufgelöst werden:', selectedMap, previewError);
            result.previewUrl = null;
          }
        }
        const entry:BatchMatchItem={...(cachedItem??{}),game:selectedGame??{gameId},result,status:result.engineCompatibility?.engineVersionCompatible===false?'engine-mismatch':'loaded',analysisStatus:cachedItem?.analysisStatus??(result.engineCompatibility?.engineVersionCompatible===false?'unsupported':'pending')};
        setBatchMatches(current=>[...current.filter(item=>item.game.gameId!==gameId),entry]);
        if(playerPage) void persistBatchItem(entry).catch(storageError=>console.warn('[ReplayCoach] Replay konnte nicht lokal gespeichert werden:',storageError));
        setApiResult(result);
        setDecodedActions(result.decodedActions ?? []);
        setReplay(null);
        setMapRefreshKey(key => key + 1);
        setActivePage('analysis');
        if(!entry.simulation) await runEngineReview(result,undefined,selectedGame);
      }
    } catch(e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function runEngineReview(result: ApiImportSummary, selectedClientId?: string | null, libraryGame?: PlayerGame) {
    const requestId = ++engineReviewRunId.current;
    setSimulationResult(null);
    const persist = async (patch: Partial<BatchMatchItem>) => {
      if (!playerPage || selectedClientId !== undefined || !libraryGame) return;
      const existing = batchMatches.find(item=>item.game.gameId===result.gameId);
      const item:BatchMatchItem={
        ...(existing??{game:libraryGame,status:'loaded' as const}),
        game:libraryGame,
        result,
        ...patch,
      };
      setBatchMatches(current=>[...current.filter(entry=>entry.game.gameId!==result.gameId),item]);
      try { await persistBatchItem(item); }
      catch(storageError) { console.warn('[ReplayCoach] Engine-Ergebnis konnte nicht lokal gesichert werden:',storageError); }
    };
    if (!result.record || result.engineCompatibility?.engineVersionCompatible !== true) {
      setSimulationProgress(null);
      if(libraryGame) void persist({status:result.engineCompatibility?.engineVersionCompatible===false?'engine-mismatch':'failed',analysisStatus:result.engineCompatibility?.engineVersionCompatible===false?'unsupported':'failed',analysisError:result.engineCompatibility?.message??'Keine passende Original-Engine verfügbar.'});
      return;
    }
    setSimulationProgress({percent:0,phase:'Original-Engine wird gestartet'});
    try {
      const { simulateReplay, buildReplayEngineAssets } = await import('./ReplaySimulation');
      if (requestId !== engineReviewRunId.current) return;
      const assets = buildReplayEngineAssets(result.record);
      const preferredClientId = selectedClientId !== undefined
        ? selectedClientId || null
        : resolveProfileClientId(result);
      if(libraryGame && selectedClientId===undefined && !preferredClientId) {
        const failure:ReplaySimulationResult={status:'unverified',totalTicks:0,verifiedHashes:0,samples:[],playerReview:null,actionReviews:[],message:'Das OpenFront-Profil konnte keinem Spieler dieser Partie eindeutig zugeordnet werden.'};
        setSimulationResult(failure);
        await persist({analysisStatus:'failed',analysisError:failure.message,simulation:failure});
        return;
      }
      const simulated = await simulateReplay(
        result.record,
        assets,
        (percent, phase) => {
          if (requestId === engineReviewRunId.current) setSimulationProgress({percent,phase});
        },
        50,
        preferredClientId,
      );
      if (requestId === engineReviewRunId.current) {
        setSimulationResult(simulated);
        if(libraryGame) await persist({
          simulation:simulated,
          analysisStatus:simulated.status==='verified'?'verified':'unverified',
          analysisError:simulated.status==='verified'?undefined:simulated.message,
        });
      }
    } catch (e) {
      if (requestId === engineReviewRunId.current) {
        const failure:ReplaySimulationResult={status:'unverified',totalTicks:0,verifiedHashes:0,samples:[],playerReview:null,actionReviews:[],message:e instanceof Error ? e.message : String(e)};
        setSimulationResult(failure);
        if(libraryGame) await persist({simulation:failure,analysisStatus:'failed',analysisError:failure.message});
      }
    } finally {
      if (requestId === engineReviewRunId.current) setSimulationProgress(null);
    }
  }
  async function importUrl() { cancelBatchAnalysis(); engineReviewRunId.current++; setSimulationProgress(null); setBusy(true); setError(''); setApiResult(null); setSimulationResult(null); try { const result = await window.replayAPI.importReplayUrl(url); if ('canceled' in result) { setError('Speichern abgebrochen. Die API-Antwort wurde nicht lokal abgelegt.'); } else { setApiResult(result); setDecodedActions(result.decodedActions ?? []); setReplay(null); setActivePage('analysis'); await runEngineReview(result); } } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  async function openReplay() { cancelBatchAnalysis(); engineReviewRunId.current++; setSimulationProgress(null); setBusy(true); setError(''); try { const result = await window.replayAPI.openReplay(); if (result) { if (result.apiSummary) { setApiResult(result.apiSummary); setDecodedActions(result.apiSummary.decodedActions ?? []); setReplay(null); setActivePage('analysis'); await runEngineReview(result.apiSummary); } else { setReplay(result); setDecodedActions(result.decodedActions ?? []); setApiResult(null); setSimulationResult(null); setActivePage('analysis'); } } } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  async function saveReplayJson() {
    if (!apiResult?.gameId) {
      setError('Für diese Partie liegt kein herunterladbarer Original-Datensatz in der aktuellen Sitzung vor. Bitte die Partie zuerst erneut über ihren OpenFront-Link laden.');
      return;
    }
    setError(''); setSaveNotice('');
    try {
      const result = await window.replayAPI.saveReplayJson(apiResult.gameId);
      if (result?.saved) setSaveNotice(isDesktopShell
        ? `Gespeichert (${result.bytes} Bytes): ${result.filePath} – der Speicherort wurde im Explorer geöffnet.`
        : result.shared
          ? `Android-Teilen-Menü geöffnet (${result.bytes} Bytes): ${result.filePath}. Wähle dort „Dateien“ oder eine andere App zum Speichern.`
          : `Download gestartet (${result.bytes} Bytes): ${result.filePath}. Die Datei findest du im Download-Ordner deines Browsers.`);
      else if (result?.canceled) setSaveNotice('Speichern abgebrochen. Es wurde keine Datei geschrieben.');
      else setSaveNotice('Es wurde keine Datei gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function exportActionsCsv() {
    if (!decodedActions.length) return;
    const quote = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [["Spielzug","Zeit Sekunden","Kategorie","Aktion","Typ","Details","Client-ID"], ...decodedActions.map(a=>[a.turn,a.seconds,a.category,a.label,a.type,a.details,a.clientId])];
    const csv = "\uFEFF" + rows.map(row=>row.map(quote).join(";")).join("\r\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const href = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=href; a.download="OpenFront-Aktionsprotokoll.csv"; a.click(); URL.revokeObjectURL(href);
  }
  const fmt = (n: number) => n.toLocaleString('de-DE');
  const loadedGames = playerPage?.games ?? [];
  const filteredGames = loadedGames.filter(g => (gameFilter === 'all' || g.result === gameFilter) && (modeFilter === 'all' || (g.mode ?? '').toLowerCase() === modeFilter.toLowerCase()) && (typeFilter === 'all' || (g.type ?? '').toLowerCase() === typeFilter.toLowerCase()) && (!gameSearch.trim() || `${g.map ?? ''} ${g.mode ?? ''} ${g.gameId}`.toLowerCase().includes(gameSearch.trim().toLowerCase())));
  const libraryPageSize=24;
  const currentLibraryPage=Math.min(libraryPage,Math.max(0,Math.ceil(filteredGames.length/libraryPageSize)-1));
  const visibleGames=filteredGames.slice(currentLibraryPage*libraryPageSize,(currentLibraryPage+1)*libraryPageSize);
  const wins = loadedGames.filter(g => g.result === 'victory').length;
  const losses = loadedGames.filter(g => g.result === 'defeat').length;
  const completedGames = wins + losses;
  const winRate = completedGames ? wins / completedGames * 100 : 0;
  const avgDuration = loadedGames.filter(g => Number.isFinite(g.durationSeconds) && (g.durationSeconds ?? 0) > 0).reduce((sum,g)=>sum+(g.durationSeconds ?? 0),0) / Math.max(1, loadedGames.filter(g => (g.durationSeconds ?? 0) > 0).length);
  const modeStats = Object.entries(loadedGames.reduce((acc:Record<string,number>,g)=>{const key=g.mode ?? 'Unbekannt';acc[key]=(acc[key]??0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const importedBatchMatches=batchMatches.filter(item=>Boolean(item.result));
  const engineUnavailableCount=importedBatchMatches.filter(item=>item.status==='engine-mismatch'||item.analysisStatus==='unsupported').length;
  const verifiedReplayCount=importedBatchMatches.filter(item=>item.analysisStatus==='verified'&&item.simulation?.status==='verified').length;
  const pendingReplayCount=importedBatchMatches.filter(item=>item.status==='loaded'&&(!item.analysisStatus||item.analysisStatus==='pending')).length;
  const longitudinalReport=React.useMemo(()=>buildLongitudinalCoachReport(importedBatchMatches.map(item=>({
    gameId:item.game.gameId,
    mapName:String(item.game.map??item.result?.mapName??'Unbekannt'),
    mode:String(item.game.mode??item.result?.gameMode??'Unbekannt'),
    type:String(item.game.type??item.result?.gameType??'Unbekannt'),
    playedAt:item.game.start??null,
    durationSeconds:item.game.durationSeconds??item.result?.durationSeconds??null,
    analysisStatus:item.analysisStatus??(item.status==='engine-mismatch'?'unsupported':'pending'),
    simulation:item.simulation??null,
  }))),[batchMatches]);
  const selectedImportedMatches=batchMatches.filter(item=>selectedGameIds.includes(item.game.gameId)&&Boolean(item.result));
  const selectedPendingAnalysisCount=selectedImportedMatches.filter(item=>item.analysisStatus!=='verified'||item.simulation?.status!=='verified').length;
  const recentGames = [...loadedGames].filter(g=>g.start).sort((a,b)=>new Date(b.start!).getTime()-new Date(a.start!).getTime()).slice(0,10);
  const resultLabel = (result?:string) => result === 'victory' ? 'Sieg' : result === 'defeat' ? 'Niederlage' : 'Unvollständig';
  const size = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
  const profileName = playerPage?.profile.username ?? playerPage?.profile.accountUsername ?? playerPage?.profile.displayName ?? playerPage?.playerId ?? 'Dein OpenFront-Profil';
  const savedMatchesById=new globalThis.Map(batchMatches.filter(item=>Boolean(item.result)).map(item=>[item.game.gameId,item] as const));
  const gameCards = (games: PlayerGame[]) => games.map(g => {
    const saved=savedMatchesById.get(g.gameId);
    const display=saved?getReplayDisplayState(saved):null;
    return <GameCard key={g.gameId} game={g} previewUrl={playerPage?.mapPreviews?.[String(g.map ?? '').trim().toLowerCase()]} refreshKey={mapRefreshKey} selected={selectedGameIds.includes(g.gameId)} replayState={display?.kind} replayLabel={display?.label} replayDetail={display?.detail} onToggle={()=>toggleGameSelection(g.gameId)} onAnalyze={() => void choosePlayerGame(g.gameId)} />;
  });
  return <div className="studio-shell">
    <aside className="studio-sidebar">
      <div className="studio-brand"><div className="studio-brand-icon"><Gamepad2 size={22}/></div><div><b>REPLAY COACH</b><small>PERFORMANCE STUDIO</small></div></div>
      <div className="studio-nav-label">DEIN WORKSPACE</div>
      <button className={`studio-nav ${activePage==='dashboard'?'active':''}`} onClick={()=>navigateTo('dashboard')}><LayoutDashboard size={17}/>Dashboard</button>
      <button className={`studio-nav ${activePage==='games'?'active':''}`} onClick={()=>navigateTo('games')}><ListChecks size={17}/>Meine Partien</button>
      <button className={`studio-nav ${activePage==='analysis'?'active':''}`} onClick={()=>navigateTo('analysis')} disabled={!apiResult && !replay}><Brain size={17}/>Coach & Replay</button>
      <div className="studio-sidebar-bottom"><span><ShieldCheck size={14}/>{isDesktopShell ? 'Lokal auf diesem PC' : isMobileDevice ? 'Mobil im Browser' : 'Im Browser geöffnet'}</span><small>OpenFront Replay Coach · 2.2.38</small></div>
    </aside>
    <nav className="studio-mobile-nav" aria-label="Hauptnavigation">
      <button className={activePage==='dashboard'?'active':''} onClick={()=>navigateTo('dashboard')}><LayoutDashboard/><span>Dashboard</span></button>
      <button className={activePage==='games'?'active':''} onClick={()=>navigateTo('games')}><ListChecks/><span>Partien</span></button>
      <button className={activePage==='analysis'?'active':''} onClick={()=>navigateTo('analysis')} disabled={!apiResult && !replay}><Brain/><span>Coach</span></button>
    </nav>
    <main className="studio-main">
      <header className="studio-header"><div><div className="studio-eyebrow">OPENFRONT / PERFORMANCE STUDIO</div><h1>{activePage==='dashboard'?'Dein Performance-Dashboard':activePage==='games'?'Deine Spielbibliothek':'Match Review'}</h1><p>{activePage==='dashboard'?'Deine Entwicklung, letzte Partien und nächste Trainingsschwerpunkte.':activePage==='games'?'Finde eine Partie und öffne ihre Karten- und Aktionsübersicht.':'Spielverlauf, beobachtete Entscheidungen und Replay an einem Ort.'}</p></div><div className="studio-header-actions"><UpdateCenter/><button className="studio-button subtle" onClick={openReplay} disabled={busy}><FileUp size={16}/> Replay importieren</button></div></header>
      {error && <div className="error"><AlertTriangle size={18}/>{error}</div>}{saveNotice && <div className="success"><CheckCircle2 size={18}/>{saveNotice}</div>}
      {playerBusy && playerProgress && <div className="load-progress studio-card"><div><b>{playerProgress.status}</b><span>{playerProgress.loaded.toLocaleString('de-DE')} Partien · {playerProgress.pages} Seiten</span></div><div className="load-progress-track"><div/></div></div>}
      {activePage!=='games' && batchBusy && batchProgress && <section className="batch-progress studio-card global-library-progress" aria-live="polite"><b>Spielbibliothek wird vollständig eingelesen</b><span>{batchProgress.done} von {batchProgress.total} Partien importiert · {isMobileDevice?'Ein Import gleichzeitig':'Bis zu drei Importe gleichzeitig'} · {batchProgress.gameId||'Bitte App geöffnet lassen'}</span><div className="batch-progress-track"><i style={{width:`${batchProgress.total?batchProgress.done/batchProgress.total*100:0}%`}}/></div></section>}
      {activePage!=='games' && batchAnalysisBusy && batchAnalysisProgress && <section className="batch-progress studio-card global-library-progress" aria-live="polite"><b>Langzeitanalyse wird aufgebaut</b><span>{batchAnalysisProgress.done} von {batchAnalysisProgress.total} Partien · {batchAnalysisProgress.active>1?`${batchAnalysisProgress.active} gleichzeitig · `:''}{batchAnalysisProgress.gameId||batchAnalysisProgress.phase}</span><div className="batch-progress-track"><i style={{width:`${Math.min(100,batchAnalysisProgress.total?(batchAnalysisProgress.done+batchAnalysisProgress.percent/100)/batchAnalysisProgress.total*100:0)}%`}}/></div></section>}
      {activePage==='dashboard' && <>
        <section className="welcome-strip dashboard-hero"><div><span className="studio-eyebrow">PLAYER PROFILE</span><h2>Willkommen zurück, {profileName}</h2><p>Deine OpenFront-Partien auf einen Blick.</p></div><div className="profile-loader"><input value={playerId} onChange={e=>setPlayerId(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void loadPlayer();}} placeholder="OpenFront-Profillink oder Spieler-ID"/><button className="studio-button primary" onClick={()=>loadPlayer()} disabled={playerBusy || !playerId.trim()}><Users size={16}/>{playerBusy?'Lade …':'Konto laden'}</button></div></section>
        <section className="match-import-bar studio-card dashboard-import"><div><span className="studio-eyebrow">SCHNELLIMPORT</span><h3>Direkt in eine Partie springen</h3><p>Öffne einen beliebigen öffentlichen Match-Link – unabhängig von deiner Profilhistorie.</p></div><div className="match-import-controls"><input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void importUrl();}} placeholder="https://openfront.io/w5/game/…" aria-label="OpenFront-Match-Link"/><button className="studio-button primary" onClick={()=>void importUrl()} disabled={busy||!url.trim()}><FileUp size={16}/>{busy?'Partie wird geladen …':'Partie laden'}</button></div></section>
        {playerPage ? <>
          <section className={`coach-spotlight ${longitudinalReport.status==='ready'?'ready':'warming'}`} aria-label="Persönliche Coaching-Zusammenfassung">
            <div className="coach-spotlight-heading">
              <div className="coach-spotlight-mark"><Sparkles size={21}/></div>
              <div><span className="studio-eyebrow">COACH BRIEFING · DEIN NÄCHSTER SCHRITT</span><h2>{longitudinalReport.status==='ready'?'Woran du als Nächstes arbeiten solltest':'Dein Coach baut gerade dein Spielerprofil auf'}</h2><p>{longitudinalReport.status==='ready'?longitudinalReport.message:`${longitudinalReport.verifiedMatches} vollständig verifizierte Partien · Für wiederkehrende Muster werden mindestens zwei vergleichbare Partien benötigt.`}</p></div>
            </div>
            {longitudinalReport.status==='ready' ? <div className="coach-spotlight-grid">
              <article className="coach-spotlight-item focus">
                <span><Brain size={14}/> TRAININGSFOKUS</span>
                <b>{longitudinalReport.recurringFindings[0]?.title ?? (longitudinalReport.weakestPhase? `Phase: ${longitudinalReport.weakestPhase.label}` : 'Noch kein wiederkehrender Fehler bestätigt')}</b>
                <p>{longitudinalReport.recurringFindings[0]?.trainingRule ?? (longitudinalReport.weakestPhase? `Vergleiche in ${longitudinalReport.weakestPhase.label} die Entscheidungen und belegten Zustandswechsel in deinen Replays.` : 'Der Coach erfindet keine Schwäche. Verifiziere weitere Partien, damit wiederkehrende Muster sichtbar werden.')}</p>
                {longitudinalReport.recurringFindings[0] && <small>{longitudinalReport.recurringFindings[0].occurrences} von {longitudinalReport.recurringFindings[0].comparableMatches} vergleichbaren Partien</small>}
              </article>
              <article className="coach-spotlight-item strength">
                <span><ShieldCheck size={14}/> DAS MACHST DU GUT</span>
                <b>{longitudinalReport.recurringStrengths[0]?.title ?? (longitudinalReport.strongestPhase? `Starke Phase: ${longitudinalReport.strongestPhase.label}` : 'Stärken werden weiter geprüft')}</b>
                <p>{longitudinalReport.recurringStrengths[0]?.trainingRule ?? (longitudinalReport.strongestPhase? `Deine ${longitudinalReport.strongestPhase.label}-Phase zeigt wiederholt positive Werte. Behalte die konkreten Entscheidungen im Replay im Blick.` : 'Eine Stärke wird erst hervorgehoben, wenn sie in mehreren vergleichbaren, verifizierten Partien beobachtet wurde.')}</p>
                {longitudinalReport.recurringStrengths[0] && <small>{longitudinalReport.recurringStrengths[0].occurrences} von {longitudinalReport.recurringStrengths[0].comparableMatches} vergleichbaren Partien</small>}
              </article>
            </div> : <div className="coach-spotlight-empty"><span>{longitudinalReport.verifiedMatches}</span><div><b>Langzeit-Coaching wird freigeschaltet</b><small>Die ersten Spiele werden gesammelt und einzeln analysiert. Unterschiedliche Modi und Spieltypen werden nicht vermischt.</small></div><button className="studio-button primary" onClick={()=>navigateTo('games')}>Partien prüfen <ArrowRight size={15}/></button></div>}
          </section>
          <section className="studio-card longitudinal-coach-card dashboard-progression">
            <div className="card-heading"><div><span className="studio-eyebrow">LONGITUDINAL COACH</span><h3>Deine Entwicklung über mehrere Partien</h3></div><span className={`longitudinal-confidence ${longitudinalReport.confidence}`}>{longitudinalReport.confidence.toUpperCase()} CONFIDENCE</span></div>
            <div className="longitudinal-stats">
              <div><b>{longitudinalReport.verifiedMatches}</b><span>Verifiziert</span></div>
              <div><b>{longitudinalReport.comparableMatches}</b><span>Vergleichbar</span></div>
              <div><b>{longitudinalReport.excludedMatches}</b><span>Ausgeschlossen</span></div>
            </div>
            <p className="longitudinal-coverage">{longitudinalReport.message}</p>
            {longitudinalReport.status==='ready' ? <>
              <div className="longitudinal-phase-grid">{longitudinalReport.phaseSummaries.map(phase=><article className="longitudinal-phase" key={phase.id}><span>{phase.label}</span><b>{phase.medianTerritoryPerMinute===null?'—':phase.medianTerritoryPerMinute.toFixed(1).replace('.',',')} <small>Gebiete/min</small></b><div className="longitudinal-phase-flags">{phase.weakestCount>=2&&<em className="weak">Wiederholt schwächer</em>}{phase.strongestCount>=2&&<em className="strong">Wiederholt stark</em>}</div><small>{phase.matchesWithData}/{longitudinalReport.comparableMatches} Partien mit Daten</small></article>)}</div>
              <div className="progression-panel">
                <div className="progression-heading"><span className="studio-eyebrow">SPIEL ZU SPIEL · ENTWICKLUNG</span><small>Nur verifizierte Partien derselben Spielgruppe</small></div>
                <div className="progression-trends">{longitudinalReport.metricTrends.map(trend=><article key={trend.id} className={`progression-trend ${trend.direction}`}><span>{trend.label}</span><b>{trend.latest===null?'—':trend.latest.toFixed(1).replace('.',',')} <small>{trend.unit}</small></b><em>{trend.direction==='improved'?'Besser als zuvor':trend.direction==='declined'?'Schwächer als zuvor':trend.direction==='stable'?'Weitgehend stabil':'Noch zu wenig Daten'}</em>{trend.delta!==null&&<small>Veränderung {trend.delta>0?'+':''}{trend.delta.toFixed(1).replace('.',',')} {trend.unit}</small>}<small>{trend.observations} Partien mit Messwerten</small></article>)}</div>
                <div className="progression-matches">{longitudinalReport.matchProgress.slice(-8).map((match,index)=><article key={match.gameId}><span>PARTIE {index+1}</span><b>{match.mapName}</b><small>{match.playedAt?new Date(match.playedAt).toLocaleDateString('de-DE'):'Datum unbekannt'}</small><div>{(['early','mid','late'] as const).map(phase=><i key={phase} title={phase==='early'?'Early':phase==='mid'?'Mid':'Late'} className={match.phaseMomentum[phase]===null?'missing':match.phaseMomentum[phase]!>=70?'strong':match.phaseMomentum[phase]!>=35?'medium':'weak'} style={{height:`${Math.max(5,match.phaseMomentum[phase]??5)}%`}} />)}</div><small>{match.territoryPerMinute===null?'Keine Gebietsrate':`${match.territoryPerMinute.toFixed(1).replace('.',',')} Gebiete/min`}</small>{match.attackFollowThroughSamples>0&&<small>{match.attackFollowThroughSamples} auswertbare Angriffe · {match.attackFollowThroughPercent?.toFixed(0)} % mit Gebietsreaktion</small>}</article>)}</div>
                <small className="progression-footnote">Die Raten beschreiben beobachtete Entwicklung pro Minute. Sie sind keine automatische Bewertung deiner Spielstärke: Karte, Lobby, Überlebenszeit und Datenabdeckung beeinflussen den Vergleich.</small>
              </div>
              {longitudinalReport.recurringFindings.length>0 ? <div className="longitudinal-findings"><span className="studio-eyebrow">WIEDERKEHRENDE MUSTER</span>{longitudinalReport.recurringFindings.map(finding=><article key={finding.id}><div><b>{finding.title}</b><small>{finding.occurrences}/{finding.comparableMatches} vergleichbare Partien · {Math.round(finding.frequency*100)} %</small></div><span className={`finding-priority ${finding.priority}`}>{finding.priority.toUpperCase()}</span><p>{finding.trainingRule}</p></article>)}</div> : <p className="longitudinal-coverage">Noch kein identisches Fehlermuster in mehreren Partien bestätigt.</p>}
              {longitudinalReport.recurringStrengths.length>0 && <div className="longitudinal-findings longitudinal-strengths"><span className="studio-eyebrow">WIEDERKEHRENDE STÄRKEN · DAS MACHST DU GUT</span>{longitudinalReport.recurringStrengths.map(finding=><article key={finding.id}><div><b>{finding.title}</b><small>{finding.occurrences}/{finding.comparableMatches} vergleichbare Partien · {Math.round(finding.frequency*100)} %</small></div><span className="finding-priority medium">STÄRKE</span><p>{finding.trainingRule}</p></article>)}</div>}
              <div className="longitudinal-training"><Brain size={18}/><div><span>NÄCHSTER TRAININGSFOKUS</span><b>{longitudinalReport.trainingFocus}</b></div></div>
            </> : <div className="longitudinal-empty"><Brain size={22}/><div><b>Langzeit-Coaching wartet auf verifizierte Partien</b><small>Importiere und analysiere mindestens zwei Partien desselben Modus und Spieltyps. Nicht verifizierte Daten werden nicht zusammengerechnet.</small></div><button className="studio-button primary" onClick={()=>navigateTo('games')}>Partien analysieren <ArrowRight size={15}/></button></div>}
          </section>
          <section className="stat-grid dashboard-metrics">
            <StatCard icon={<Trophy/>} label="SIEGQUOTE" value={completedGames?`${winRate.toFixed(1).replace('.',',')} %`:'—'} note={`${wins} Siege · ${losses} Niederlagen`} accent="cyan"/>
            <StatCard icon={<Gamepad2/>} label="GELADENE PARTIEN" value={fmt(loadedGames.length)} note="Aktuell geladene Historie" accent="blue"/>
            <StatCard icon={<Clock3/>} label="Ø SPIELDAUER" value={avgDuration?clock(avgDuration):'—'} note="Über geladene Partien" accent="violet"/>
            <StatCard icon={<Activity/>} label="UNVOLLSTÄNDIG" value={fmt(loadedGames.filter(g=>g.result!=='victory'&&g.result!=='defeat').length)} note="Nicht in der Siegquote" accent="amber"/>
          </section>
          <section className="dashboard-grid dashboard-lower-grid">
            <article className="studio-card performance-card"><div className="card-heading"><div><span className="studio-eyebrow">MATCH HISTORY</span><h3>Deine letzten Partien</h3></div><button className="text-action" onClick={()=>navigateTo('games')}>Alle Partien <ChevronRight size={15}/></button></div><div className="recent-game-grid">{gameCards(recentGames.slice(0,4))}</div></article>
            <article className="studio-card focus-card"><div className="card-heading"><div><span className="studio-eyebrow">DEIN TRAININGSPLAN</span><h3>Diese Situationen solltest du prüfen</h3></div><Sparkles size={18}/></div>
              {apiResult?.actionAnalysis ? <div className="empty-training"><Brain size={28}/><b>Persönliches Coaching öffnen</b><p>Die Lobby-Aktionszahlen sind kein persönlicher Trainingsplan. Öffne die Replay-Analyse, wähle deinen Spielernamen und erhalte dort deine eigenen Zeitpunkte und Entscheidungen.</p><button className="studio-button primary" onClick={()=>navigateTo('analysis')}>Zur Replay-Analyse <ArrowRight size={15}/></button></div> : <div className="empty-training"><Brain size={28}/><b>Noch keine Partie im Coach</b><p>Lade eine deiner Partien, um deine persönlichen Entscheidungen zu untersuchen.</p><button className="studio-button primary" onClick={()=>navigateTo('games')}>Partie auswählen <ArrowRight size={15}/></button></div>}
            </article>
          </section>
          <section className="studio-card account-strip"><div><span className="studio-eyebrow">ACCOUNT</span><h3>{profileName}</h3><p>Spieler-ID: {playerPage.profile.publicId ?? playerPage.playerId}</p></div><div className="account-strip-right"><span className="status-dot"/>Konto geladen<button className="studio-button subtle" onClick={()=>loadPlayer()} disabled={playerBusy}>Aktualisieren</button></div></section>
          
        </> : <section className="empty-account studio-card"><Users size={32}/><h2>Lade dein OpenFront-Konto</h2><p>Mit deinem öffentlichen Profil können wir deine Partien, Ergebnisse und Karten in einer persönlichen Bibliothek anzeigen.</p><button className="studio-button primary" onClick={()=>loadPlayer()} disabled={playerBusy}>{playerBusy?'Lade Konto …':'Konto laden'}</button></section>}
      </>}
      {activePage==='games' && <>
        <section className="library-toolbar studio-card"><div><span className="studio-eyebrow">MATCH LIBRARY</span><h2>Spielbibliothek</h2><p>{filteredGames.length} von {loadedGames.length} geladenen Partien · {batchMatches.filter(item=>item.result).length} Replays importiert</p></div><div className="library-filters"><label><SlidersHorizontal size={15}/><select value={gameFilter} onChange={e=>setGameFilter(e.target.value)}><option value="all">Alle Ergebnisse</option><option value="victory">Siege</option><option value="defeat">Niederlagen</option><option value="incomplete">Unvollständig</option></select></label><select value={modeFilter} onChange={e=>setModeFilter(e.target.value)}><option value="all">Alle Modi</option>{Array.from(new Set(loadedGames.map(g=>g.mode).filter(Boolean))).sort().map(m=><option key={m} value={m}>{m}</option>)}</select><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">Alle Spieltypen</option>{Array.from(new Set(loadedGames.map(g=>g.type).filter(Boolean))).sort().map(t=><option key={t} value={t}>{t}</option>)}</select><div className="search-box"><Search size={15}/><input value={gameSearch} onChange={e=>setGameSearch(e.target.value)} placeholder="Karte oder Match-ID suchen"/></div></div></section>
        <section className="library-overview-strip" aria-label="Bibliotheksübersicht">
          <article><span>PARTIEN GESAMT</span><b>{fmt(loadedGames.length)}</b><small>{fmt(filteredGames.length)} aktuell gefiltert</small></article>
          <article><span>GEWONNEN</span><b>{fmt(wins)}</b><small>{completedGames?winRate.toFixed(1).replace('.',',')+' % Siegquote':'Noch keine abgeschlossenen Partien'}</small></article>
          <article><span>REPLAYS GESPEICHERT</span><b>{fmt(importedBatchMatches.length)}</b><small>Auf diesem Gerät verfügbar</small></article>
          <article><span>HASH-VERIFIZIERT</span><b>{fmt(verifiedReplayCount)}</b><small>{fmt(engineUnavailableCount)} benötigen eine andere Engine-Version</small></article>
        </section>
        <section className="batch-toolbar studio-card"><div><b>{selectedGameIds.length} Partien ausgewählt</b><small>Importiere mehrere Replays und analysiere sie anschließend einzeln mit ihrer Original-Engine.</small></div><div><button className="studio-button subtle" onClick={selectFilteredGames} disabled={!filteredGames.length || batchBusy || batchAnalysisBusy}>{filteredGames.every(game=>selectedGameIds.includes(game.gameId))?'Auswahl aufheben':'Gefilterte auswählen'}</button><button className="studio-button primary" onClick={()=>void loadSelectedGames()} disabled={!selectedGameIds.length || batchBusy || batchAnalysisBusy}><FileUp size={15}/>{batchBusy?'Importiere …':` ${selectedGameIds.length} Partien laden`}</button><button className="studio-button coach-action" onClick={()=>void analyzeSelectedGames()} disabled={!selectedPendingAnalysisCount || batchBusy || batchAnalysisBusy}><Brain size={15}/>{batchAnalysisBusy?'Analysiere …':` ${selectedPendingAnalysisCount} Partien analysieren`}</button>{batchBusy && <button className="studio-button subtle" onClick={cancelBatchImport}>Import abbrechen</button>}{batchAnalysisBusy && <button className="studio-button subtle" onClick={cancelBatchAnalysis}>Analyse abbrechen</button>}</div></section>
        {batchProgress && <section className="batch-progress studio-card" aria-live="polite"><b>{batchBusy?`Importiere ${batchProgress.gameId||'Partien'} …`:`Import abgeschlossen: ${batchProgress.done} / ${batchProgress.total}`}</b><span>{batchProgress.done} von {batchProgress.total} Partien verarbeitet</span><div className="batch-progress-track"><i style={{width:`${batchProgress.total?batchProgress.done/batchProgress.total*100:0}%`}}/></div></section>}
        {batchAnalysisProgress && <section className="batch-progress studio-card analysis-progress" aria-live="polite"><b>{batchAnalysisBusy?`Analysiere ${batchAnalysisProgress.gameId||'Partien'} …`:`Analyse abgeschlossen: ${batchAnalysisProgress.done} / ${batchAnalysisProgress.total}`}</b><span>{batchAnalysisProgress.phase} · {batchAnalysisProgress.percent}%</span><div className="batch-progress-track"><i style={{width:`${Math.min(100,batchAnalysisProgress.total?(batchAnalysisProgress.done+batchAnalysisProgress.percent/100)/batchAnalysisProgress.total*100:0)}%`}}/></div></section>}
        {batchMatches.length>0 && <details className="batch-results studio-card">
          <summary className="batch-results-summary"><div><span className="studio-eyebrow">IMPORT-VERLAUF</span><b>{importedBatchMatches.length} gespeicherte Replays</b><small>{verifiedReplayCount} verifiziert · {engineUnavailableCount} Engine-Version fehlt · {pendingReplayCount} offen</small></div><span className="batch-results-toggle">{batchMatches.length} Einträge <ChevronDown size={16}/></span></summary>
          <div className="batch-results-list">{batchMatches.map(item=>{
            const display=getReplayDisplayState(item);
            return <article className="batch-result-row" key={item.game.gameId}><div className="batch-result-copy"><b>{item.game.map??item.result?.mapName??'Unbekannte Karte'}</b><small>{item.game.gameId} · {item.game.start?new Date(item.game.start).toLocaleDateString('de-DE'):'Datum unbekannt'}{item.game.durationSeconds?' · '+clock(item.game.durationSeconds):''}</small>{display.kind==='engine-missing'&&<small className="batch-result-explanation">{display.detail}</small>}{item.error&&<small className="batch-error">{item.error}</small>}{item.analysisError&&display.kind!=='engine-missing'&&<small className="batch-error">{item.analysisError}</small>}</div><span className={'batch-status-pill '+display.kind}>{display.label}</span><div className="batch-result-actions">{item.result&&<button className="text-action" onClick={()=>openBatchMatch(item.game.gameId)}>Öffnen <ArrowRight size={14}/></button>}{item.error&&<button className="text-action" onClick={()=>void loadSelectedGames([item.game.gameId])} disabled={batchBusy||batchAnalysisBusy}>Erneut laden</button>}</div></article>;
          })}</div>
        </details>}
        {filteredGames.length ? <div className="game-library-grid">{gameCards(visibleGames)}</div> : <section className="empty-account studio-card"><Map size={28}/><b>Keine Partien gefunden</b><p>Lade dein Konto oder passe die Filter an.</p></section>}
        {filteredGames.length>libraryPageSize && <nav className="library-pagination" aria-label="Seiten der Spielbibliothek"><span>{currentLibraryPage*libraryPageSize+1}–{Math.min((currentLibraryPage+1)*libraryPageSize,filteredGames.length)} von {filteredGames.length} Partien</span><div><button type="button" onClick={()=>setLibraryPage(Math.max(0,currentLibraryPage-1))} disabled={currentLibraryPage===0}>Zurück</button><b>Seite {currentLibraryPage+1} / {Math.ceil(filteredGames.length/libraryPageSize)}</b><button type="button" onClick={()=>setLibraryPage(Math.min(Math.ceil(filteredGames.length/libraryPageSize)-1,currentLibraryPage+1))} disabled={currentLibraryPage>=Math.ceil(filteredGames.length/libraryPageSize)-1}>Weiter</button></div></nav>}
        
      </>}
      {activePage==='analysis' && <>
        {apiResult ? <>
          <div className="analysis-hero studio-card"><div className="analysis-map-preview"><MapPreview map={apiResult.mapName} src={apiResult.previewUrl} refreshKey={mapRefreshKey}/><div className="map-overlay"><span className="studio-eyebrow">MATCH REVIEW</span><h2>{apiResult.mapName}</h2><p>{apiResult.gameMode} · {apiResult.gameType} · {clock(apiResult.durationSeconds??0)} · {fmt(apiResult.playerCount??0)} Spieler</p></div></div><div className="analysis-hero-side"><span className="studio-eyebrow">MATCH ID</span><b>{apiResult.gameId}</b>{apiResult.engineCompatibility && <div className={`compatibility-notice ${apiResult.engineCompatibility.engineVersionCompatible ? 'compatible' : 'limited'}`}><span>{apiResult.engineCompatibility.engineVersionCompatible ? 'ENGINE KOMPATIBEL' : 'REPLAY GELADEN · ENGINE FEHLT'}</span><small>{apiResult.engineCompatibility.engineVersionCompatible ? 'Hash-Prüfung wird separat ausgewertet.' : 'Aktionsdaten sind importiert. Für eine verifizierte Zustandsrekonstruktion fehlt der exakt passende Engine-Build.'}</small></div>}<button className="studio-button primary" onClick={()=>window.replayAPI.openOfficialReplay(apiResult.gameId)}><Gamepad2 size={16}/> Original-Replay ansehen</button><button className="studio-button subtle" onClick={exportActionsCsv}><DownloadCloud size={16}/> CSV exportieren</button><button className="studio-button subtle" onClick={()=>void saveReplayJson()}><FileUp size={16}/> Replay-JSON speichern</button></div></div>
          {apiResult.actionAnalysis && <CoachPanel apiResult={apiResult} preferredPlayerPublicId={playerPage?.profile?.publicId ?? playerPage?.profile?.publicID ?? null} decodedActions={decodedActions} simulationResult={simulationResult} simulationProgress={simulationProgress} onPlayerSelect={(clientId)=>void runEngineReview(apiResult,clientId)} onExport={exportActionsCsv} onSaveReplayJson={()=>void saveReplayJson()} onOpenReplay={()=>window.replayAPI.openOfficialReplay(apiResult.gameId)} fmt={fmt}/>}
          <details className="technical-details studio-card engine-diagnostics"><summary>Engine-Simulation, Hash-Abgleich und technische Zustände <ChevronDown size={16}/></summary>
          {apiResult.engineCompatibility && <section className="studio-card" style={{marginTop:16}}>
            <div className="card-heading"><div><span className="studio-eyebrow">ENGINE-KOMPATIBILITÄT</span><h3>{apiResult.engineCompatibility.status === 'version-compatible-hashes-available' ? 'Version passt – Hash-Abgleich kann starten' : apiResult.engineCompatibility.status === 'version-compatible-no-hashes' ? 'Version passt – keine Hash-Prüfpunkte' : 'Keine sichere Engine-Wiedergabe möglich'}</h3></div>{apiResult.engineCompatibility.engineVersionCompatible ? <CheckCircle2 size={20}/> : <AlertTriangle size={20}/>}</div>
            <p>{apiResult.engineCompatibility.message}</p>
            <div className="details-grid">
              <Detail label="Replay-Commit" value={apiResult.engineCompatibility.replayCommit?.slice(0,12) ?? 'fehlt'}/>
              <Detail label="Engine-Commit" value={apiResult.engineCompatibility.engineCommit.slice(0,12)}/>
              <Detail label="Hash-Prüfpunkte" value={fmt(apiResult.engineCompatibility.recordedHashCount)}/>
            </div>
            <small>Wichtig: Versionsgleichheit und vorhandene Hashes sind noch kein bestandener Replay-Test. Erst der echte Engine-Lauf kann die Spielrekonstruktion bestätigen.</small>
          </section>}
          {simulationResult && <section className="studio-card" style={{marginTop:16}}>
            <div className="card-heading"><div><span className="studio-eyebrow">SIMULATIONSERGEBNIS</span><h3>{simulationResult.status === 'verified' ? 'Replay erfolgreich reproduziert' : 'Replay nicht vollständig verifiziert'}</h3></div>{simulationResult.status === 'verified' ? <CheckCircle2 size={20}/> : <AlertTriangle size={20}/>}</div>
            <p>{simulationResult.message}</p>
            <div className="details-grid">
              <Detail label="Rekonstruierte Frames" value={fmt(simulationResult.totalTicks)}/>
              <Detail label="Bestätigte Hashes" value={fmt(simulationResult.verifiedHashes)}/>
              <Detail label="Zustands-Samples" value={fmt(simulationResult.samples.length)}/>
            </div>
            {simulationResult.samples.length > 0 && <p>Letzter erfasster Zustand: Tick {fmt(simulationResult.samples[simulationResult.samples.length-1].tick)} · {simulationResult.samples[simulationResult.samples.length-1].players.length} Spieler · {fmt(simulationResult.samples[simulationResult.samples.length-1].totalUnits)} Einheiten.</p>}
            {simulationResult.playerReview && <div className="details-grid" style={{marginTop:12}}>
              <Detail label={`${simulationResult.playerReview.playerName} · Landgewinn`} value={`+${fmt(simulationResult.playerReview.tilesGained)}`}/>
              <Detail label="Gold Start → Ende" value={`${fmt(simulationResult.playerReview.startGold)} → ${fmt(simulationResult.playerReview.endGold)}`}/>
              <Detail label="Truppen Start → Ende" value={`${fmt(simulationResult.playerReview.startTroops)} → ${fmt(simulationResult.playerReview.endTroops)}`}/>
              <Detail label="Längste Phase ohne Gebietszuwachs" value={`${fmt(simulationResult.playerReview.longestNoExpansionSeconds)} s`}/>
            </div>}
            {simulationResult.playerReview && <small>Diese Werte stammen aus rekonstruierten Spielzuständen. Eine lange Phase ohne Gebietszuwachs ist zunächst ein Prüfzeitraum – nicht automatisch ein Spielfehler.</small>}
            {simulationResult.actionReviews.length > 0 && <div style={{marginTop:16}}>
              <h4>Eigene Aktionen im Zustandvergleich</h4>
              <p className="muted">Vergleich des letzten erfassten Zustands vor und nach dem Aktions-Tick. Veränderungen sind zeitlich zugeordnet, aber nicht automatisch allein durch den Befehl verursacht.</p>
              <div className="table-wrap"><table><thead><tr><th>Zeit</th><th>Aktion</th><th>Gebiet Δ</th><th>Gold Δ</th><th>Truppen Δ</th></tr></thead><tbody>
                {simulationResult.actionReviews.filter(a=>['attack','boat','build_unit','upgrade_structure'].includes(a.type)).slice(0,100).map(a=><tr key={a.frame}>
                  <td>{Math.floor(a.seconds/60)}:{String(Math.floor(a.seconds%60)).padStart(2,'0')}</td>
                  <td><b>{a.label}</b><small>{a.details || `Spielzug ${a.turn}`}</small></td>
                  <td>{a.delta ? (a.delta.tiles>0?'+':'')+fmt(a.delta.tiles) : '–'}</td>
                  <td>{a.delta ? (a.delta.gold>0?'+':'')+fmt(a.delta.gold) : '–'}</td>
                  <td>{a.delta ? (a.delta.troops>0?'+':'')+fmt(a.delta.troops) : '–'}</td>
                </tr>)}
              </tbody></table></div>
            </div>}
          </section>}
          </details>
          <details className="technical-details studio-card"><summary>Technische Daten und vollständiges Aktionsprotokoll <ChevronDown size={16}/></summary><div className="details-grid">{Object.entries(apiResult.categoryCounts??{}).map(([k,v])=><Detail key={k} label={k} value={fmt(v)}/>)}</div><div className="action-list">{decodedActions.slice(0,200).map((a,i)=><div className="check-row" key={`${a.turn}-${i}`}><div><b>{a.label}</b><small>{clock(a.seconds)} · {a.details}</small></div><span className="pill blue">{a.category}</span></div>)}</div></details>
        </> : replay ? <section className="studio-card"><div className="analysis-hero"><MapPreview map={replay.mapName} refreshKey={mapRefreshKey}/><div><span className="studio-eyebrow">LOKALES REPLAY</span><h2>{replay.mapName}</h2><p>{replay.gameId} · {replay.mode}</p><button className="studio-button primary" onClick={()=>window.replayAPI.openOfficialReplay(replay.gameId)}>Original-Replay ansehen</button></div></div><p>Die lokale Datei wurde erkannt. Für die taktische Rekonstruktion muss die passende OpenFront-Engine eingebunden werden.</p></section> : <section className="empty-account studio-card"><Brain size={30}/><h2>Wähle zuerst eine Partie</h2><p>Öffne deine Spielbibliothek oder importiere einen Match-Link.</p><button className="studio-button primary" onClick={()=>navigateTo('games')}>Meine Partien öffnen</button><div className="profile-loader"><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="OpenFront-Match-Link"/><button className="studio-button subtle" onClick={importUrl} disabled={busy}>Link abrufen</button></div></section>}
      </>}
      <footer className="studio-footer">OPENFRONT REPLAY COACH <span>Lokale Analyse · Keine Cloud-Übertragung deiner Dateien</span></footer>
    </main>
  </div>;
}

function StatCard({icon,label,value,note,accent}:{icon:React.ReactNode;label:string;value:string;note:string;accent:string}){return <article className={`stat-card accent-${accent}`}><div className="stat-top"><span>{label}</span><i>{icon}</i></div><b>{value}</b><small>{note}</small></article>;}
function MapPreview({map,src,refreshKey=0}:{map:string;src?:string|null;refreshKey?:number}){
  const [failed,setFailed]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [retry,setRetry]=useState(0);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  React.useEffect(()=>{
    setFailed(false); setLoaded(false); setRetry(0);
  },[src,map,refreshKey]);
  // Cached images can already be complete before React's onLoad callback updates
  // state. Reconcile the real DOM image state after mount/source changes.
  React.useEffect(()=>{
    const img = imageRef.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) setLoaded(true);
    else if (retry < 1) setRetry(1);
    else setFailed(true);
  },[src,map,refreshKey,retry]);
  const imageSrc = src && retry > 0 ? `${src}${src.includes('?')?'&':'?'}rc_retry=${retry}` : src;
  return <div className={`map-preview ${loaded?'map-loaded':''}`}>
    {src && !failed ? <img ref={imageRef} key={`${src}-${refreshKey}-${retry}`} src={imageSrc!} alt={`OpenFront-Karte ${map}`} loading="lazy" decoding="async" onLoad={()=>setLoaded(true)} onError={()=>{if(retry<1){setRetry(1);setLoaded(false);}else setFailed(true);}}/> :
      <div className="map-fallback" role="img" aria-label={`Kartenvorschau für ${map} wird gesucht`}>
        <Map size={28}/><b>{map}</b><small>{src ? 'Vorschaubild konnte nicht geladen werden' : 'Offizielle Kartenvorschau nicht verfügbar'}</small>
      </div>}
  </div>;
}
function GameCard({game,previewUrl,refreshKey=0,selected=false,replayState,replayLabel,replayDetail,onToggle,onAnalyze}:{game:PlayerGame;previewUrl?:string|null;refreshKey?:number;selected?:boolean;replayState?:string;replayLabel?:string;replayDetail?:string;onToggle:()=>void;onAnalyze:()=>void}){const win=game.result==='victory',loss=game.result==='defeat';return <article className={`game-card ${selected?'selected':''}`}><div className="game-card-visual"><MapPreview map={game.map??'OpenFront'} src={previewUrl} refreshKey={refreshKey}/><label className="game-select"><input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Partie ${game.gameId} für Mehrfachimport auswählen`}/><span>Auswählen</span></label><span className={`game-result ${win?'win':loss?'loss':'unfinished'}`}>{win?'SIEG':loss?'NIEDERLAGE':'UNVOLLSTÄNDIG'}</span><span className="game-card-duration">{game.durationSeconds?clock(game.durationSeconds):'—'}</span></div><div className="game-card-content"><div className="game-card-title"><div><h3>{game.map??'Unbekannte Karte'}</h3><p>{game.mode??'Spielmodus unbekannt'} · {game.type??'Spieltyp unbekannt'}</p></div><span className="players-count"><Users size={14}/>{game.totalPlayers??'?'}</span></div>{replayState&&<div className={`game-replay-state ${replayState}`}>{replayLabel}{replayDetail&&replayState==='engine-missing'&&<small>{replayDetail}</small>}</div>}<div className="game-card-meta"><span><CalendarDays size={13}/>{game.start?new Date(game.start).toLocaleDateString('de-DE'):'Datum unbekannt'}</span><span>Match {game.gameId.slice(0,8)}</span></div><button className="game-card-action" onClick={onAnalyze}>Coach öffnen <ArrowRight size={15}/></button></div></article>;}
function TrainingFocus({apiResult,decodedActions}:{apiResult:ApiImportSummary;decodedActions:DecodedAction[]}){
  const attacks=apiResult.actionAnalysis?.attackCount??0;
  const boats=apiResult.actionAnalysis?.boatCount??0;
  const builds=apiResult.actionAnalysis?.buildCount??0;
  const firstAttack=decodedActions.find(a=>a.type==='attack');
  const firstBuild=decodedActions.find(a=>a.type==='build_unit');
  const checkpoints=[
    firstAttack ? {
      number:'01', tag:'STARTPHASE', title:'Ersten Angriff bewerten', time:firstAttack.seconds,
      evidence:`Erster Angriffsbefehl · ${clock(firstAttack.seconds)}`,
      question:'War das Ziel erreichbar und sinnvoll – oder hätte weiteres Expandieren bzw. Truppen sammeln mehr gebracht?'
    } : null,
    firstBuild ? {
      number:'02', tag:'WIRTSCHAFT', title:'Erste Bauentscheidung einordnen', time:firstBuild.seconds,
      evidence:firstBuild.details || firstBuild.label,
      question:'Hat dieser Bau deine nächste Expansion oder Verteidigung unterstützt? Vergleiche den Zeitpunkt mit deiner damaligen Lage.'
    } : null,
    {
      number:'03', tag:'AKTIONSMUSTER', title:'Aktionen mit Wirkung vergleichen', time:null,
      evidence:`${attacks} Angriffe · ${boats} Bootsaktionen · ${builds} Bauaktionen`,
      question:'Welche dieser Befehle haben tatsächlich Land, Einkommen oder einen militärischen Vorteil gebracht? Viele Befehle allein bedeuten noch keine gute Effizienz.'
    }
  ].filter(Boolean) as Array<{number:string;tag:string;title:string;time:number|null;evidence:string;question:string}>;
  return <div className="training-focus-v2">
    <div className="training-focus-intro">
      <div><b>Replay-Check statt pauschaler Tipps</b><p>Diese Partie liefert konkrete Stellen zum Lernen. Ein Fehler wird erst dann markiert, wenn der Spielstand zum Zeitpunkt der Entscheidung geprüft wurde.</p></div>
      <span className="training-focus-count">{checkpoints.length} CHECKPUNKTE</span>
    </div>
    <div className="training-focus-grid">
      {checkpoints.map(item=><article className="training-focus-card" key={item.number}>
        <div className="training-focus-card-top"><span className="training-index">{item.number}</span><span className="training-focus-tag">{item.tag}</span></div>
        <b>{item.title}</b>
        <p>{item.question}</p>
        <small><strong>Beleg:</strong> {item.evidence}</small>
      </article>)}
    </div>
    <div className="training-focus-limit"><AlertTriangle size={15}/><span><b>Was der Coach aktuell sicher sagen kann:</b> Er erkennt protokollierte Befehle und Zeitpunkte. Ob eine Entscheidung gut oder schlecht war, lässt sich erst mit dem rekonstruierten Karten-, Gold-, Truppen- und Grenzstand beurteilen. Deshalb werden hier keine erfundenen „besseren Züge“ ausgegeben.</span></div>
  </div>;
}
function ReplayTrendChart({title,description,unit,points}:{title:string;description:string;unit:string;points:Array<{time:number;value:number}>}) {
  const width=720,height=190,pad=28;
  const values=points.map(point=>point.value);
  const min=Math.min(0,...values),max=Math.max(1,...values);
  const x=(index:number)=>pad+(points.length<=1?0:index/(points.length-1))*(width-pad*2);
  const y=(value:number)=>height-pad-((value-min)/Math.max(1,max-min))*(height-pad*2);
  const line=points.map((point,index)=>`${x(index)},${y(point.value)}`).join(' ');
  const last=points[points.length-1];
  return <article className="overview-panel replay-trend-card">
    <div className="overview-panel-title"><div><span className="eyebrow">SPIELVERLAUF</span><h4>{title}</h4></div><b>{last?fmtChartValue(last.value):'–'} {unit}</b></div>
    <p className="chart-description">{description}</p>
    <div className="replay-trend-plot"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: Verlauf über die Spielzeit`} preserveAspectRatio="none">
      {[0,0.5,1].map(fraction=><line key={fraction} x1={pad} x2={width-pad} y1={pad+fraction*(height-pad*2)} y2={pad+fraction*(height-pad*2)} className="trend-gridline"/>)}
      {points.length>1 && <polyline points={line} className="trend-line" vectorEffect="non-scaling-stroke"/>}
      {last && <circle cx={x(points.length-1)} cy={y(last.value)} r="5" className="trend-point"/>}
    </svg></div>
    <div className="trend-axis"><span>{clock(points[0]?.time??0)}</span><span>{clock(last?.time??0)}</span></div>
    <div className="trend-range"><span>Start: {fmtChartValue(points[0]?.value??0)} {unit}</span><span>Ende: {fmtChartValue(last?.value??0)} {unit}</span></div>
  </article>;
}
function fmtChartValue(value:number){return Math.round(value).toLocaleString('de-DE');}
function selectedPlayerName(players:Array<{name:string;clientID:string|null}>,id:string){return players.find(p=>p.clientID===id)?.name ?? '';}
function CoachPanel({apiResult,preferredPlayerPublicId,decodedActions,simulationResult,simulationProgress,onPlayerSelect,onExport,onSaveReplayJson,onOpenReplay,fmt}:{preferredPlayerPublicId:string|null;apiResult:ApiImportSummary;decodedActions:DecodedAction[];simulationResult:ReplaySimulationResult|null;simulationProgress:{percent:number;phase:string}|null;onPlayerSelect:(clientId:string)=>void;onExport:()=>void;onSaveReplayJson:()=>void;onOpenReplay:()=>void;fmt:(n:number)=>string}) {
  const [workspaceTab,setWorkspaceTab]=useState<'coach'|'replay'|'analysis'|'strategies'>('coach');
  const [selectedTimelineId,setSelectedTimelineId]=useState<string|null>(null);
  type TrainingGoal = { title:string; instruction:string; gameId:string; mapName:string; createdAt:string; completed:boolean };
  const [trainingGoal,setTrainingGoal]=useState<TrainingGoal|null>(()=>{try{return JSON.parse(localStorage.getItem('openfront-coach-training-goal')||'null') as TrainingGoal|null;}catch{return null;}});
  React.useEffect(()=>{try{if(trainingGoal)localStorage.setItem('openfront-coach-training-goal',JSON.stringify(trainingGoal));else localStorage.removeItem('openfront-coach-training-goal');}catch{/* Local storage may be unavailable in private browser contexts. */}},[trainingGoal]);

  const [analysisTab,setAnalysisTab]=useState<'overview'|'economy'|'military'|'timeline'|'phases'|'technical'>('overview');
  const players=apiResult.playerStats ?? [];
  const exactEngineAvailable=apiResult.engineCompatibility?.engineVersionCompatible===true;
  const preferredPlayer=players.find(p=>preferredPlayerPublicId && p.publicID===preferredPlayerPublicId);
  const initialPlayer=preferredPlayer ?? (players.length===1 ? players[0] : players.find(p=>/oligenole/i.test(p.name)) ?? null);
  const [selectedClientId,setSelectedClientId]=useState<string>(()=>initialPlayer?.clientID ?? '');
  React.useEffect(()=>{const match=players.find(p=>preferredPlayerPublicId && p.publicID===preferredPlayerPublicId) ?? (players.length===1 ? players[0] : players.find(p=>/oligenole/i.test(p.name)) ?? null);setSelectedClientId(match?.clientID ?? '');},[apiResult.gameId,preferredPlayerPublicId]);
  const playerScoped=Boolean(selectedClientId);
  const selectedPlayerReview = simulationResult?.playerReview?.clientID === selectedClientId ? simulationResult.playerReview : null;
  const selectedActionReviews = selectedPlayerReview ? (simulationResult?.actionReviews ?? []) : [];
  const spawnPositionReport = simulationResult?.spawnPositions ?? [];
  const selectedSpawnPosition = spawnPositionReport.find(position => position.clientID === selectedClientId) ?? null;
  const spawnAlternatives = selectedSpawnPosition && simulationResult?.spawnAlternativesPlayerId === selectedSpawnPosition.id
    ? simulationResult.spawnAlternatives ?? []
    : [];
  const comparableSpawnLand = spawnPositionReport
    .filter(position => position.clientID !== null && position.nearbyNeutralLandTiles !== null)
    .map(position => position.nearbyNeutralLandTiles as number)
    .sort((a,b)=>a-b);
  const spawnLandMiddle = Math.floor(comparableSpawnLand.length / 2);
  const medianSpawnLand = comparableSpawnLand.length
    ? comparableSpawnLand.length % 2 === 0
      ? (comparableSpawnLand[spawnLandMiddle - 1] + comparableSpawnLand[spawnLandMiddle]) / 2
      : comparableSpawnLand[spawnLandMiddle]
    : null;
  const spawnLandComparison = !selectedSpawnPosition || selectedSpawnPosition.nearbyNeutralLandTiles === null || medianSpawnLand === null
    ? null
    : selectedSpawnPosition.nearbyNeutralLandTiles > medianSpawnLand
      ? 'Mehr neutrales Land als der Lobby-Median'
      : selectedSpawnPosition.nearbyNeutralLandTiles < medianSpawnLand
        ? 'Weniger neutrales Land als der Lobby-Median'
        : 'Neutrales Land auf Lobby-Median';
  const spawnAdvice = selectedSpawnPosition ? (simulationResult?.spawnPhaseEndTick == null
    ? 'Der Replay enthält kein verlässliches Ende der Spawnphase. Die Spawn-Koordinate ist exakt; Grenzkontakte und Gebiet stammen aber aus dem letzten verfügbaren Zustand. Daraus wird keine Startstrategie abgeleitet.'
    : [
    selectedSpawnPosition.classification === 'contested'
      ? 'Dein Start lag vergleichsweise nah an anderen Spielern und hatte direkte Grenzkontakte. Sichere zuerst eine Expansionsflanke und vermeide, früh mehrere Fronten gleichzeitig zu öffnen.'
      : selectedSpawnPosition.classification === 'isolated'
        ? 'Dein Start war im Lobbyvergleich relativ isoliert. Nutze den Puffer für kontrollierte Expansion und Wirtschaft, bevor du selbst eine neue Front eröffnest.'
        : selectedSpawnPosition.classification === 'mixed'
          ? 'Dein Start war weder klar isoliert noch eindeutig unter unmittelbarem Druck. Prüfe die Nachbarfronten, bevor du deine Expansion festlegst.'
          : 'Die Spawnlage lässt sich mangels vergleichbarer Startdaten nicht sicher einordnen.',
    spawnLandComparison === 'Mehr neutrales Land als der Lobby-Median'
      ? 'Im 12-Felder-Luftlinienradius lag überdurchschnittlich viel neutrales Land. Sichere die freien Expansionswege früh, statt sie ungenutzt zu lassen.'
      : spawnLandComparison === 'Weniger neutrales Land als der Lobby-Median'
        ? 'Im 12-Felder-Luftlinienradius lag weniger neutrales Land als bei vergleichbaren Spielern. Plane früher einen Übergang zu einer sicheren Front oder einer anderen Expansionsrichtung.'
        : '',
    selectedSpawnPosition.nearbyCoastalLandTiles !== null && selectedSpawnPosition.nearbyCoastalLandTiles > 0
      ? 'Neutrale Küstenfelder waren erreichbar. Häfen und Handel lohnen sich aber nur, wenn die konkrete Route geschützt ist.'
      : selectedSpawnPosition.nearbyCoastalLandTiles === 0
        ? 'Im untersuchten Nahbereich gab es keine neutrale Küstenfläche. Erzwinge deshalb keinen frühen Hafen nur wegen einer allgemeinen Build-Order.'
        : '',
  ].filter(Boolean).join(' ')) : '';
  const playerActions=playerScoped ? decodedActions.filter(a=>a.clientId===selectedClientId) : [];
  const strategyMatchContext = simulationResult?.status === 'verified' && selectedPlayerReview ? {
    verified: true,
    playerName: selectedPlayerReview.playerName,
    spawn: selectedSpawnPosition ? {
      x: selectedSpawnPosition.spawnX,
      y: selectedSpawnPosition.spawnY,
      classification: selectedSpawnPosition.classification,
      neutralLand: selectedSpawnPosition.nearbyNeutralLandTiles,
      coastalLand: selectedSpawnPosition.nearbyCoastalLandTiles,
      rivalContacts: selectedSpawnPosition.rivalBorderContacts,
      spawnPhaseComplete: simulationResult.spawnPhaseEndTick !== null && simulationResult.spawnPhaseEndTick !== undefined,
    } : null,
    alternatives: spawnAlternatives.map(spot => ({
      x: spot.x, y: spot.y, neutralLand: spot.nearbyNeutralLandTiles,
      coastalLand: spot.nearbyCoastalLandTiles, adjacentPlayers: spot.adjacentPlayerCount,
    })),
    startGold: selectedPlayerReview.startGold, endGold: selectedPlayerReview.endGold,
    startTroops: selectedPlayerReview.startTroops, endTroops: selectedPlayerReview.endTroops,
    startTiles: selectedPlayerReview.startTiles, endTiles: selectedPlayerReview.endTiles,
    attackCommands: decodedActions.filter(action => action.clientId === selectedClientId && action.type === 'attack').length,
    buildCommands: decodedActions.filter(action => action.clientId === selectedClientId && action.type === 'build_unit').length,
  } : null;
  const scopedAnalysis=analyzeActions(playerActions,apiResult.durationSeconds ?? 0);
  const details=analyzeDetailedActions(playerActions,apiResult.durationSeconds ?? 0);
  const builds=details.buildsByUnit;
  const count=(name:string)=>builds.find(x=>x.unit.toLowerCase()===name.toLowerCase())?.count ?? 0;
  const warships=count('Warship'), ports=count('Port'), cities=count('City'), factories=count('Factory');
  const buckets=details.timeBuckets;
  const peak=[...buckets].sort((a,b)=>b.total-a.total)[0];
  const firstAttack=playerActions.find(a=>a.type==='attack');
  const firstBuild=playerActions.find(a=>a.type==='build_unit');
  const firstBoat=playerActions.find(a=>a.type==='boat');
  const largestStateWindow = selectedActionReviews.filter(action=>action.delta).slice().sort((a,b)=>Math.abs(b.delta!.tiles)-Math.abs(a.delta!.tiles))[0];
  const categories=Object.entries(scopedAnalysis.categoryCounts).sort((a,b)=>b[1]-a[1]);
  const timeline=[
    firstBuild ? {time:firstBuild.seconds,title:'Dein erster protokollierter Bau',detail:firstBuild.details || firstBuild.label,kind:'Bau',turn:firstBuild.turn} : null,
    firstAttack ? {time:firstAttack.seconds,title:'Erster protokollierter Angriff',detail:firstAttack.details || firstAttack.label,kind:'Angriff',turn:firstAttack.turn} : null,
    firstBoat ? {time:firstBoat.seconds,title:'Erster Bootstransport',detail:firstBoat.details || firstBoat.label,kind:'Marine',turn:firstBoat.turn} : null,
    largestStateWindow ? {time:largestStateWindow.seconds,title:'Größte Gebietsänderung im direkten Aktionsfenster',detail:`${largestStateWindow.label} · Gebiet ${largestStateWindow.delta!.tiles>0?'+':''}${fmt(largestStateWindow.delta!.tiles)} · Gold ${largestStateWindow.delta!.gold>0?'+':''}${fmt(largestStateWindow.delta!.gold)} · Truppen ${largestStateWindow.delta!.troops>0?'+':''}${fmt(largestStateWindow.delta!.troops)}`,kind:'Engine-Zustand',turn:largestStateWindow.turn} : null,
    peak ? {time:(buckets.indexOf(peak)*300),title:'Aktivster Fünf-Minuten-Abschnitt',detail:`${fmt(peak.total)} Aktionen · ${peak.attacks} Angriffe · ${peak.boats} Bootsaktionen · ${peak.builds} Bauaktionen`,kind:'Aktivität',turn:null} : null
  ].filter(Boolean).sort((a,b)=>(a?.time??0)-(b?.time??0)) as Array<{time:number;title:string;detail:string;kind:string;turn:number|null}>;
  const totalBuilds=builds.reduce((sum,x)=>sum+x.count,0);
  const formatPct=(n:number)=>`${Math.round(n)} %`;
  const insights=buildCoachInsights(playerActions,apiResult.durationSeconds ?? 0);
  // Only let hash-verified original-engine state drive personal decision coaching.
  const engineInsights = selectedPlayerReview && simulationResult?.status === 'verified'
    ? buildEngineCoachInsights(selectedPlayerReview, selectedActionReviews, simulationResult.samples)
    : [];
  const proCoachReport = simulationResult?.status === 'verified' && selectedClientId
    ? buildProCoachReport(simulationResult.samples, selectedActionReviews, selectedClientId, apiResult.durationSeconds ?? 0)
    : null;

  const { ordered: orderedEngineInsights, primary: primaryEngineInsights, supporting: supportingEngineInsights } = selectPrimaryCoachInsights(engineInsights);
  const replayTimeline = buildReplayTimeline(timeline, primaryEngineInsights);
  const selectedTimelineEntry = replayTimeline.find(event => event.id === selectedTimelineId) ?? replayTimeline[0] ?? null;
  React.useEffect(()=>{setSelectedTimelineId(null);},[apiResult.gameId]);
  const leadEngineInsight = primaryEngineInsights[0] ?? null;
  const coachLeadTitle = simulationResult?.status === 'verified'
    ? leadEngineInsight?.title ?? 'Keine einzelne Fehlentscheidung belastbar belegt'
    : 'Noch keine belastbare Coaching-Aussage';
  const coachLeadSummary = simulationResult?.status === 'verified'
    ? leadEngineInsight?.summary ?? 'Die Original-Engine-Rekonstruktion zeigt hier keinen einzelnen Entscheidungsfehler mit ausreichender Grundlage. Das bedeutet nicht, dass jede Entscheidung optimal war.'
    : 'Das Aktionsprotokoll belegt Befehle, aber noch keine belastbare taktische Bewertung. Dafür müssen Spielzustände mit der passenden Original-Engine und gespeicherten Hashes verifiziert sein.';
  const coachTrainingFocus = simulationResult?.status === 'verified'
    ? leadEngineInsight?.nextStep ?? 'Prüfe die Zeitachse auf Phasen mit eingehendem Druck, Gebietsverlust und gebundenen Truppen. Wähle daraus genau ein Verhalten, das du in der nächsten Partie bewusst trainierst.'
    : 'Zuerst das Replay mit der passenden Original-Engine reproduzieren und die gespeicherten Hashes abgleichen. Erst danach eine taktische Lektion ableiten.';
  const replayDurationTicks = simulationResult?.totalTicks ?? 0;
  const {
    alivePlayerSamples,
    firstAliveSample,
    lastAliveSample,
    playerEliminatedAtSeconds,
    lastAliveTick,
  } = selectPlayerSurvivalWindow(simulationResult?.samples ?? [], selectedClientId, replayDurationTicks);
  const phaseDefinitions = [
    { id: 'early', label: 'Early Game', from: 0, to: 0.3, description: 'Start, Expansion und erste Wirtschaft' },
    { id: 'mid', label: 'Mid Game', from: 0.3, to: 0.7, description: 'Fronten, Zielwahl und Ressourcensteuerung' },
    { id: 'late', label: 'Late Game', from: 0.7, to: 1, description: 'Endphase, Druck und Abschluss' },
  ];
  const phasePerformance = simulationResult?.status === 'verified' && replayDurationTicks > 0
    ? phaseDefinitions.map(phase => {
        const fromTick = replayDurationTicks * phase.from;
        const toTick = Math.min(replayDurationTicks * phase.to, lastAliveTick);
        const phaseSamples = alivePlayerSamples
          .filter(sample => sample.tick >= fromTick && sample.tick <= toTick)
          .sort((a,b) => a.tick - b.tick);
        const first = phaseSamples[0]?.player;
        const last = phaseSamples[phaseSamples.length - 1]?.player;
        const elapsedTicks = phaseSamples.length >= 2
          ? phaseSamples[phaseSamples.length - 1].tick - phaseSamples[0].tick
          : 0;
        // Never manufacture a rate from a tiny/negative time interval. A
        // minimum 30-second observation window keeps sparse samples honest.
        const enoughRateWindow = phaseSamples.length >= 2 && elapsedTicks >= 300;
        const minutes = enoughRateWindow ? elapsedTicks / 600 : 0;
        const phaseActions = selectedActionReviews.filter(action => action.seconds * 10 >= fromTick && action.seconds * 10 <= toTick && action.seconds * 10 <= lastAliveTick);
        const attackActions = phaseActions.filter(action => action.type === 'attack');
        const targetPressureWins = attackActions.filter(action => action.targetDelta30s && action.targetDelta30s.tiles < 0).length;
        const territory = first && last ? last.tiles - first.tiles : null;
        const income = first && last ? last.goldEarned - first.goldEarned : null;
        const territoryRate = enoughRateWindow && territory !== null ? territory / minutes : null;
        const incomeRate = enoughRateWindow && income !== null ? income / minutes : null;
        return { ...phase, sampleCount: phaseSamples.length, minutes, territory, income, attackCount: attackActions.length, targetPressureWins, territoryRate, incomeRate, elapsedTicks };
      })
    : [];
  const phaseMedian = (values:number[]) => {
    const sorted = [...values].sort((a,b)=>a-b);
    return sorted.length ? sorted[Math.floor(sorted.length/2)] : null;
  };
  const territoryMedian = phaseMedian(phasePerformance.map(p=>p.territoryRate).filter((v):v is number=>v!==null));
  const incomeMedian = phaseMedian(phasePerformance.map(p=>p.incomeRate).filter((v):v is number=>v!==null));
  const ratedPhases = phasePerformance.map(phase => {
    const enoughData = phase.sampleCount >= 3 && phase.minutes >= 0.5;
    const strengths = [
      phase.territoryRate !== null && territoryMedian !== null && phase.territoryRate > territoryMedian,
      phase.incomeRate !== null && incomeMedian !== null && phase.incomeRate > incomeMedian,
      phase.targetPressureWins > 0,
    ].filter(Boolean).length;
    const strengthLabels = [
      phase.territoryRate !== null && territoryMedian !== null && phase.territoryRate > territoryMedian ? 'Expansion über Phasenschnitt' : '',
      phase.incomeRate !== null && incomeMedian !== null && phase.incomeRate > incomeMedian ? 'Einkommen über Phasenschnitt' : '',
      phase.targetPressureWins > 0 ? 'Zielgebiet messbar geschwächt' : '',
    ].filter(Boolean);
    const belowTerritory = phase.territoryRate !== null && territoryMedian !== null && phase.territoryRate < territoryMedian;
    const belowIncome = phase.incomeRate !== null && incomeMedian !== null && phase.incomeRate < incomeMedian;
    const aboveTerritory = phase.territoryRate !== null && territoryMedian !== null && phase.territoryRate > territoryMedian;
    const aboveIncome = phase.incomeRate !== null && incomeMedian !== null && phase.incomeRate > incomeMedian;
    const assessment = !enoughData ? 'Nicht sicher bewertbar' : belowTerritory && belowIncome ? 'Schwächste Phase' : aboveTerritory && aboveIncome ? 'Stärkste Phase' : 'Gemischte Entwicklung';
    const hint = !enoughData ? 'Zu wenige Messpunkte für eine faire Einschätzung.' : belowTerritory && belowIncome ? 'Gebietszuwachs und Einkommen lagen unter deinen anderen Spielphasen.' : aboveTerritory && aboveIncome ? 'Gebietszuwachs und Einkommen lagen über deinen anderen Spielphasen.' : 'Gebiet und Einkommen entwickelten sich unterschiedlich.';
    return { ...phase, strengthLabels, rating: assessment, assessment, hint };
  });
  type SavedPhaseGame = { key:string; gameId:string; playedAt:string; playerName:string; mapName:string; phases:Array<{id:string;label:string;rating:string;territory:number|null;income:number|null;territoryRate:number|null;incomeRate:number|null}> };
  const historyStorageKey = 'openfront-replay-coach.phase-history.v1';
  const [phaseHistory,setPhaseHistory] = useState<SavedPhaseGame[]>(() => {
    try { const raw = localStorage.getItem(historyStorageKey); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.key === 'string' && Array.isArray(item.phases)).slice(0,100) : []; }
    catch { return []; }
  });
  React.useEffect(() => {
    if (simulationResult?.status !== 'verified' || !selectedPlayerReview || !apiResult.gameId || ratedPhases.length !== 3) return;
    const key = `${apiResult.gameId}:${selectedClientId}`;
    const record: SavedPhaseGame = { key, gameId: apiResult.gameId, playedAt: new Date().toISOString(), playerName: selectedPlayerReview.playerName, mapName: apiResult.mapName ?? 'Unbekannte Karte', phases: ratedPhases.map(p=>({id:p.id,label:p.label,rating:p.rating,territory:p.territory,income:p.income,territoryRate:p.territoryRate,incomeRate:p.incomeRate})) };
    setPhaseHistory(previous => {
      const next = [record, ...previous.filter(item => item.key !== key)].slice(0,100);
      try { localStorage.setItem(historyStorageKey, JSON.stringify(next)); } catch (error) { console.warn('[ReplayCoach] Spieler-Verlauf konnte nicht lokal gespeichert werden:', error); }
      return next;
    });
  }, [simulationResult?.status, selectedPlayerReview?.playerName, apiResult.gameId, apiResult.mapName, selectedClientId, ratedPhases.map(p=>p.rating).join('|')]);
  const recentPhaseHistory = phaseHistory.filter(item => item.playerName === selectedPlayerReview?.playerName).slice(0,12);
  const phaseTrend = phaseDefinitions.map(phase => {
    const values = recentPhaseHistory.map(game=>game.phases.find(item=>item.id===phase.id)).filter((item):item is NonNullable<typeof item>=>Boolean(item));
    const strong = values.filter(item=>['Messbarer Fortschritt','Über deinem Partiedurchschnitt','Starke Phase'].includes(item.rating)).length;
    const tr = values.map(item=>item.territoryRate).filter((v):v is number=>v!==null);
    const ir = values.map(item=>item.incomeRate).filter((v):v is number=>v!==null);
    return {...phase,games:values.length,strong,averageTerritory:tr.reduce((a,b)=>a+b,0)/Math.max(1,tr.length),averageIncome:ir.reduce((a,b)=>a+b,0)/Math.max(1,ir.length)};
  });
  const firstEngineSample = firstAliveSample?.player ?? null;
  const lastEngineSample = lastAliveSample?.player ?? null;
  const incomeSummary = firstEngineSample && lastEngineSample ? {
    gross: lastEngineSample.goldEarned - firstEngineSample.goldEarned,
    trade: lastEngineSample.tradeGold - firstEngineSample.tradeGold,
    train: lastEngineSample.trainGold - firstEngineSample.trainGold,
    piracy: lastEngineSample.piracyGold - firstEngineSample.piracyGold,
    goldChange: lastEngineSample.gold - firstEngineSample.gold,
  } : null;
  const trackedUnitTypes = [
    { key: "City", label: "Stadt" },
    { key: "Factory", label: "Fabrik" },
    { key: "Port", label: "Hafen" },
    { key: "Warship", label: "Kriegsschiff" },
    { key: "TransportShip", label: "Transportschiff" },
    { key: "TradeShip", label: "Handelsschiff" },
    { key: "DefensePost", label: "Verteidigungsposten" },
    { key: "SAMLauncher", label: "Flugabwehr" },
    { key: "MissileSilo", label: "Raketensilo" },
    { key: "Train", label: "Zug" },
  ];
  const unitStockRows = firstEngineSample && lastEngineSample ? trackedUnitTypes.map(unit => ({
    ...unit,
    start: firstEngineSample.unitCounts[unit.key] ?? 0,
    end: lastEngineSample.unitCounts[unit.key] ?? 0,
  })).filter(unit => unit.start > 0 || unit.end > 0) : [];
  const maxOutgoingAttacks = Math.max(0, ...alivePlayerSamples.map(sample => sample.player.outgoingAttacks));
  const maxIncomingAttacks = Math.max(0, ...alivePlayerSamples.map(sample => sample.player.incomingAttacks));
  const maxCommittedAttackTroops = Math.max(0, ...alivePlayerSamples.map(sample => sample.player.attackTroops));
  const targetedAttackReviews = selectedActionReviews.filter(action => action.type === "attack" && action.targetName);
  const attackedPressuredTargets = targetedAttackReviews.filter(action => (action.targetPressureBefore?.otherAttackerCount ?? 0) > 0);
  const targetTerritoryLossCount = targetedAttackReviews.filter(action => (action.targetDelta30s?.tiles ?? 0) < 0).length;
  const ownAttackTerritoryGainCount = targetedAttackReviews.filter(action => (action.delta30s?.tiles ?? 0) > 0).length;
  return <section id="analyse" className="coach-workspace review-v2">
    <div className="player-scope-bar"><div><b>Spieler für die Analyse</b><small>{selectedPlayerName(players,selectedClientId) ? `Alle Hinweise beziehen sich auf ${selectedPlayerName(players,selectedClientId)}. Bei einem Spielerwechsel wird die Original-Engine erneut für diesen Spieler ausgewertet.` : 'Wähle deinen Namen. Danach werden Aktionen und Spielzustände genau für diesen Spieler ausgewertet.'}</small></div><select aria-label="Spieler für Coaching auswählen" value={selectedClientId} onChange={e=>{const id=e.target.value;setSelectedClientId(id);if(id)onPlayerSelect(id);}}><option value="">Spieler auswählen …</option>{players.filter(p=>p.clientID).map(p=><option key={p.clientID!} value={p.clientID!}>{p.name}</option>)}</select></div>
    {!playerScoped && <div className="player-scope-empty"><b>Persönliche Analyse noch nicht gestartet</b><p>Wähle deinen Namen aus der Liste. Danach beziehen sich Zeitpunkte, Angriffe, Bootsaktionen und Bauentscheidungen ausschließlich auf diesen Spieler – nicht auf die gesamte Lobby.</p></div>}
    {playerScoped && <div className={`coach-engine-status ${simulationProgress ? 'is-running' : simulationResult?.status === 'verified' ? 'is-success' : 'is-warning'}`} role="status" aria-live="polite">
      <div className="coach-engine-status-title">
        <span className="coach-status-indicator">{simulationProgress ? 'IN ARBEIT' : simulationResult?.status === 'verified' ? 'VERIFIZIERT' : simulationResult ? 'UNVERIFIZIERT' : exactEngineAvailable ? 'ENGINE-STATUS' : 'TEILANALYSE'}</span>
        <b>{simulationProgress ? 'Partie wird mit der Original-Engine rekonstruiert' : simulationResult?.status === 'verified' ? 'Replay erfolgreich reproduziert' : simulationResult ? 'Spielzustände rekonstruiert – Hash-Abgleich nicht bestätigt' : exactEngineAvailable ? 'Engine kompatibel – Simulation noch nicht gestartet' : 'Replay importiert · Original-Engine-Version fehlt'}</b>
        <strong>{simulationProgress ? `${simulationProgress.percent}%` : simulationResult?.status === 'verified' ? `${fmt(simulationResult.verifiedHashes)} Hashes bestanden` : simulationResult ? 'Prüfung erforderlich' : 'Wird geprüft'}</strong>
      </div>
      <p>{simulationProgress ? simulationProgress.phase : simulationResult?.message ?? (exactEngineAvailable ? apiResult.engineCompatibility?.message ?? 'Die exakte Original-Engine ist verfügbar.' : 'Die protokollierten Aktionen bleiben sichtbar. Für eine sichere Rekonstruktion von Spielständen, Fronten und Aktionsfolgen wird die exakt passende Original-Engine benötigt.')}</p>
      {simulationProgress && <div className="coach-progress-track" role="progressbar" aria-label="Replay wird analysiert" aria-valuemin={0} aria-valuemax={100} aria-valuenow={simulationProgress.percent}><span style={{width:`${Math.max(0,Math.min(100,simulationProgress.percent))}%`}}/></div>}
    </div>}
    <div className="workspace-switcher">
      <button type="button" className={workspaceTab==='coach'?'selected':''} onClick={()=>setWorkspaceTab('coach')}><Brain size={18}/><span><b>Dein Coach</b><small>Fehler verstehen und besser spielen</small></span></button>
      <button type="button" className={workspaceTab==='replay'?'selected':''} onClick={()=>setWorkspaceTab('replay')}><Map size={18}/><span><b>Replay ansehen</b><small>Spielverlauf und Zeitpunkte</small></span></button>
      <button type="button" className={workspaceTab==='analysis'?'selected':''} onClick={()=>setWorkspaceTab('analysis')}><TrendingUp size={18}/><span><b>Analyse</b><small>Wirtschaft, Militär und Phasen</small></span></button>
      <button type="button" className={workspaceTab==='strategies'?'selected':''} onClick={()=>setWorkspaceTab('strategies')}><Compass size={18}/><span><b>Strategien</b><small>Spawn, Eco, Stacks & Nukes</small></span></button>
    </div>
    {workspaceTab==='strategies' && <StrategyPlaybook matchContext={strategyMatchContext} coachingInsights={primaryEngineInsights}/>}
    {workspaceTab==='analysis' && <div className="analysis-navigation">
      <div className="analysis-navigation-heading"><b>Analysewerkzeuge</b><span>Wähle einen Bereich</span></div>
      <nav className="review-tabs coach-primary-tabs" aria-label="Analysewerkzeuge">
        {([{id:'overview',label:'Überblick',icon:<LayoutDashboard size={16}/>},{id:'economy',label:'Wirtschaft',icon:<TrendingUp size={16}/>},{id:'military',label:'Militär',icon:<Swords size={16}/>},{id:'timeline',label:'Zeitachse',icon:<Clock3 size={16}/>},{id:'phases',label:'Spielphasen',icon:<Activity size={16}/>},{id:'technical',label:'Rohdaten',icon:<HardDrive size={16}/>} ] as const).map(tab=><button type="button" key={tab.id} className={analysisTab===tab.id?'selected':''} aria-pressed={analysisTab===tab.id} onClick={()=>setAnalysisTab(tab.id)}>{tab.icon}{tab.label}</button>)}
      </nav>
    </div>}
    {playerScoped && workspaceTab==='coach' && <section id="match-coach-insights" className="coach-insights-section">
      <div className="coach-page-heading"><div><span className="eyebrow">MATCH COACH</span><h3>Dein Spiel. Dein nächster Schritt.</h3></div><span className="coach-live-pill">{simulationResult?.status === 'verified' ? 'ANALYSE VERIFIZIERT' : 'ANALYSE IN VORBEREITUNG'}</span></div>

      <section className="coach-lead-card coach-compact-card coach-hero-redesign">
        <div className="coach-lead-top"><span>{leadEngineInsight ? 'DEIN FOKUS FÜR DIE NÄCHSTE PARTIE' : 'COACH-STATUS'}</span>{leadEngineInsight?.seconds !== null && leadEngineInsight?.seconds !== undefined && <time>{clock(leadEngineInsight.seconds)}</time>}</div>
        <h3>{coachLeadTitle}</h3>
        <p className="coach-lead-summary">{coachLeadSummary}</p>
        {leadEngineInsight?.decision && <div className="coach-lead-decision"><span>WAS DU GEMACHT HAST</span><b>{leadEngineInsight.decision}</b></div>}
        <div className="coach-lead-training"><span>NÄCHSTER SCHRITT</span><p>{leadEngineInsight?.nextStep ?? coachTrainingFocus}</p></div>
        <details className="coach-proof-details">
          <summary>Belege und Details anzeigen</summary>
          <div><b>Beobachtung</b><p>{leadEngineInsight?.evidence ?? 'Für diese Partie liegt noch kein belastbarer Engine-Beleg vor.'}</p></div>
          {leadEngineInsight?.alternative && <div><b>Alternative</b><p>{leadEngineInsight.alternative}</p></div>}
          {leadEngineInsight?.limitation && <div><b>Grenze der Aussage</b><p>{leadEngineInsight.limitation}</p></div>}
        </details>
      </section>
      {proCoachReport && <section className="pro-coach-report" aria-label="Professionelle Match-Auswertung">
        <div className="pro-coach-report-head">
          <div><span className="coach-report-label">PERFORMANCE INTELLIGENCE</span><h3>Dein Match-Bericht</h3><p>Phasenleistung und Kennzahlen aus vollständig verifizierten Engine-Daten.</p></div>
          <div className="pro-coach-confidence"><span>{proCoachReport.confidenceLabel}</span><b>{proCoachReport.dataCoverage.samples} Zustände · {proCoachReport.dataCoverage.actions} Befehle</b></div>
        </div>
        <div className="pro-coach-score-row">
          <div className="pro-coach-score"><span>ENTWICKLUNGSINDEX</span><strong>{proCoachReport.matchScore===null?'–':proCoachReport.matchScore}</strong><small>{proCoachReport.scoreLabel}</small></div>
          <p>{proCoachReport.scoreExplanation}</p>
        </div>
        <div className="pro-coach-metric-grid">{proCoachReport.metrics.map(metric=><article className="pro-coach-metric" key={metric.label}><span>{metric.label}</span><b>{metric.value}</b><small>{metric.note}</small></article>)}</div>
        <div className="pro-coach-phase-panel"><div className="pro-coach-subhead"><b>Phasenleistung</b><span>Vergleich innerhalb dieser Partie</span></div>
          <div className="pro-coach-phase-bars">{proCoachReport.phases.map(phase=><div className="pro-coach-phase-row" key={phase.id}><div className="pro-coach-phase-label"><b>{phase.label}</b><span>{phase.momentumIndex===null?'Nicht genug Daten':`Impuls ${phase.momentumIndex}/100`}</span></div><div className="pro-coach-bar"><i style={{width:`${phase.momentumIndex??0}%`}}/></div><small>Gebiet {phase.territoryPerMinute===null?'–':`${phase.territoryPerMinute.toFixed(1).replace('.',',')} / Min.`} · Gold {phase.incomePerMinute===null?'–':`${Math.round(phase.incomePerMinute).toLocaleString('de-DE')} / Min.`} · Truppen {phase.troopChangePerMinute===null?'–':`${phase.troopChangePerMinute>0?'+':''}${Math.round(phase.troopChangePerMinute).toLocaleString('de-DE')} / Min.`} · {phase.attacks} Angriffe</small></div>)}</div>
        </div>
      </section>}
      {selectedSpawnPosition && selectedSpawnPosition.spawnTile !== null && <section className="spawn-coach-card" aria-labelledby="spawn-coach-title">
        <div className="spawn-coach-heading">
          <div className="spawn-coach-mark"><Compass size={20}/></div>
          <div><span className="coach-report-label">STARTPOSITION · ENGINE-REKONSTRUIERT</span><h3 id="spawn-coach-title">Dein tatsächlicher Spawn – und was er dir ermöglicht hat</h3>
            <p>{simulationResult?.spawnPhaseEndTick != null
              ? `Spawnphase endete bei ${(simulationResult.spawnPhaseEndTick / 10).toFixed(1).replace('.', ',')} Sekunden · ausgewerteter Zustand bei Tick ${simulationResult.spawnSnapshotTick ?? '–'}`
              : 'Unvollständiges Replay: Startlage aus dem letzten verfügbaren Zustand rekonstruiert.'}</p>
          </div>
        </div>
        <div className="spawn-coach-metrics">
          <article><small>EXAKTE SPAWN-KOORDINATE</small><b>X {selectedSpawnPosition.spawnX} · Y {selectedSpawnPosition.spawnY}</b><span>Aus PlayerState.spawnTile, kein geschätzter Schwerpunkt</span></article>
          <article><small>NÄCHSTER SPIELERSTART</small><b>{selectedSpawnPosition.nearestSpawnDistance === null ? '–' : `${selectedSpawnPosition.nearestSpawnDistance} Felder`}</b><span>Manhattan-Abstand wie in der Spawnlogik</span></article>
          <article><small>{simulationResult?.spawnPhaseEndTick != null ? 'DIREKTE GRENZKONTAKTE' : 'GRENZKONTAKTE IM LETZTEN ZUSTAND'}</small><b>{selectedSpawnPosition.adjacentRivals.length}</b><span>{selectedSpawnPosition.rivalBorderContacts} angrenzende Grenzfelder</span></article>
          <article><small>FREIER LANDRAUM</small><b>{selectedSpawnPosition.nearbyNeutralLandTiles === null ? 'Nicht verfügbar' : fmt(selectedSpawnPosition.nearbyNeutralLandTiles)}</b><span>{spawnLandComparison ?? 'Neutrale Landfelder im 12-Felder-Luftlinienradius'}</span></article>
          <article><small>STARTGEBIET</small><b>{fmt(selectedSpawnPosition.startTiles)} Felder</b><span>{simulationResult?.spawnPhaseEndTick != null ? 'Besitzstand beim Spawn-Snapshot' : 'Besitzstand im letzten Replay-Zustand'}</span></article>
          <article><small>GÜLTIGE STARTFELDER</small><b>{selectedSpawnPosition.spawnZoneLandTiles === null ? 'Nicht verfügbar' : `${selectedSpawnPosition.spawnZoneLandTiles} / ${selectedSpawnPosition.spawnZoneTotalTiles}`}</b><span>Land und nicht blockiert im Engine-Spawnradius</span></article>
          <article><small>KÜSTENOPTIONEN</small><b>{selectedSpawnPosition.nearbyCoastalLandTiles === null ? 'Nicht verfügbar' : fmt(selectedSpawnPosition.nearbyCoastalLandTiles)}</b><span>Neutrale Küstenfelder im Nahbereich</span></article>
        </div>
        <div className="spawn-coach-advice">
          <div><span className={`spawn-classification ${simulationResult?.spawnPhaseEndTick == null ? 'unknown' : selectedSpawnPosition.classification}`}>{simulationResult?.spawnPhaseEndTick == null ? 'STARTSNAPSHOT UNVOLLSTÄNDIG' : selectedSpawnPosition.classification === 'contested' ? 'UNTER DRUCK' : selectedSpawnPosition.classification === 'isolated' ? 'RELATIV ISOLIERT' : selectedSpawnPosition.classification === 'mixed' ? 'GEMISCHTE LAGE' : 'NICHT EINORDNEN'}</span><b>Was das für deine Eröffnung bedeutet</b></div>
          <p>{spawnAdvice}</p>
        </div>
        <details className="spawn-coach-terrain">
          <summary>Gelände und Datenqualität</summary>
          <div><span>Flachland: <b>{selectedSpawnPosition.nearbyPlainsTiles ?? '–'}</b></span><span>Hochland: <b>{selectedSpawnPosition.nearbyHighlandTiles ?? '–'}</b></span><span>Berge: <b>{selectedSpawnPosition.nearbyMountainTiles ?? '–'}</b></span><span>Unpassierbar: <b>{selectedSpawnPosition.nearbyImpassableTiles ?? '–'}</b></span><span>Kartenrand: <b>{selectedSpawnPosition.mapEdgeDistance ?? '–'} Felder</b></span></div>
          <p>Gelände stammt aus der Map-Binärdatei des exakten Replay-Engine-Commits. Neutrale Felder werden im Luftlinienradius gezählt; das beweist keine durchgehend begehbare Verbindung.</p>
        </details>
        {spawnAlternatives.length > 0 && <div className="spawn-alternatives">
          <div className="spawn-alternatives-heading"><div><span>MAP-SCAN · ALTERNATIVE STARTS</span><b>Drei offene manuelle Spawn-Positionen</b></div><small>Kein Sieg-Score – Lagevergleich</small></div>
          <div className="spawn-alternatives-grid">{spawnAlternatives.map((candidate,index)=><article key={`${candidate.x}-${candidate.y}`}>
            <span>OPTION 0{index+1}</span><b>X {candidate.x} · Y {candidate.y}</b>
            <div><small>Freies Land 25×25</small><strong>{fmt(candidate.nearbyNeutralLandTiles)}</strong></div>
            <div><small>Nächster Spielerstart</small><strong>{candidate.nearestSpawnDistance === null ? '–' : `${candidate.nearestSpawnDistance} Felder`}</strong></div>
            <div><small>Direkte Nachbarn</small><strong>{candidate.adjacentPlayerCount}</strong></div>
            <div><small>Küstenfelder</small><strong>{fmt(candidate.nearbyCoastalLandTiles)}</strong></div>
          </article>)}</div>
          <p>{simulationResult?.spawnMode === 'random'
            ? 'In dieser Partie war Zufallsspawn aktiv. Diese Koordinaten sind deshalb Vergleichspositionen und keine auswählbaren Alternativen.'
            : simulationResult?.spawnMode === 'manual'
              ? 'Diese Mittelpunkte lagen auf unbesetztem, passierbarem Land und wären im manuellen Spawn nach dem damaligen Karten-/Besitzstand grundsätzlich gültig gewesen.'
              : 'Die Lobby-Spawnart ist nicht sicher bekannt. Die Koordinaten sind unbesetzte, passierbare Landmittelpunkte.'} Die Suche scannt große Karten rasterbasiert; die gefundenen Koordinaten sind echte Landfelder, aber kein mathematisch garantiertes globales Optimum. Sortiert wird nach freiem Land im 25×25-Fenster, Abstand zum nächsten Start, Grenzdruck und Küstenfeldern.</p>
        </div>}
      </section>}
      {simulationResult?.spawnPositions && (!selectedSpawnPosition || selectedSpawnPosition.spawnTile === null) && <section className="spawn-coach-card spawn-coach-unavailable"><b>Startposition nicht vollständig rekonstruierbar</b><p>Für diesen Spieler enthält der ausgewertete Replay-Zustand keine gültige Spawn-Koordinate. Der Coach zeigt deshalb keine geschätzte Position als Tatsache an.</p></section>}
      <section className="coach-training-loop" aria-labelledby="training-loop-title">
        <div className="coach-training-loop-heading"><span className="coach-report-label">VOM REPLAY INS TRAINING</span><b id="training-loop-title">Dein Trainingsziel</b><p>Eine Sache bewusst in der nächsten Partie ausprobieren – statt zehn Statistiken gleichzeitig zu verfolgen.</p></div>
        {trainingGoal ? <div className={`coach-training-goal ${trainingGoal.completed?'is-complete':''}`}>
          <div className="coach-training-goal-status"><span>{trainingGoal.completed?'PARTIE ABGEHAKT':'AKTUELLES TRAININGSZIEL'}</span><small>{trainingGoal.mapName || 'OpenFront'} · {new Date(trainingGoal.createdAt).toLocaleDateString('de-DE')}</small></div>
          <h4>{trainingGoal.title}</h4><p>{trainingGoal.instruction}</p>
          <div className="coach-training-goal-actions">
            <button type="button" className="studio-button subtle" onClick={()=>setTrainingGoal({...trainingGoal,completed:!trainingGoal.completed})}>{trainingGoal.completed?'Wieder öffnen':'In nächster Partie getestet'}</button>
            <button type="button" className="text-action" onClick={()=>setTrainingGoal(null)}>Trainingsziel entfernen</button>
          </div>
          <small className="coach-training-goal-note">Das Ziel bleibt lokal auf diesem Gerät gespeichert. Ob du es umgesetzt hast, markierst du selbst – der Coach behauptet nicht, dein Verhalten ohne neue Replay-Daten gemessen zu haben.</small>
        </div> : (proCoachReport?.findings[0] || leadEngineInsight) && simulationResult?.status==='verified' ? <div className="coach-training-goal-empty">
          <div><b>{leadEngineInsight?.title ?? proCoachReport?.findings[0]?.title ?? 'Dein nächster Trainingsfokus'}</b><p>{leadEngineInsight?.nextStep ?? proCoachReport?.trainingRule ?? coachTrainingFocus}</p></div>
          <button type="button" className="studio-button primary" onClick={()=>setTrainingGoal({title:leadEngineInsight?.title ?? proCoachReport?.findings[0]?.title ?? 'Trainingsfokus',instruction:leadEngineInsight?.nextStep ?? proCoachReport?.trainingRule ?? coachTrainingFocus,gameId:apiResult.gameId,mapName:apiResult.mapName,createdAt:new Date().toISOString(),completed:false})}>Als Trainingsziel übernehmen <ArrowRight size={15}/></button>
        </div> : <div className="coach-training-goal-empty">
          <div><b>Noch kein belegtes Trainingsziel</b><p>Sobald die Original-Engine eine konkrete Situation ausreichend belegt, kannst du daraus ein Ziel für die nächste Partie übernehmen. Wir erfinden vorher keine Taktikempfehlung.</p></div>
        </div>}
      </section>
      {selectedPlayerReview && <details className="coach-mobile-details">
        <summary>Spielstand und Folgen der Befehle anzeigen</summary>
        <section className="coach-state-evidence">
        <div className="coach-state-evidence-heading"><div><span className="coach-report-label">ORIGINAL-ENGINE · SPIELERZUSTAND</span><b>{selectedPlayerReview.playerName}: Start bis Spielende</b></div><span className="coach-state-source">{simulationResult?.status === 'verified' ? 'Hash-verifiziert' : 'Ohne Hash-Verifikation'}</span></div>
        <div className="coach-state-grid">
          <div><small>Gebiete</small><b>{fmt(selectedPlayerReview.startTiles)} → {fmt(selectedPlayerReview.endTiles)}</b><span>{selectedPlayerReview.tilesGained >= 0 ? '+' : ''}{fmt(selectedPlayerReview.tilesGained)} Felder netto</span></div>
          <div><small>Goldbestand</small><b>{fmt(selectedPlayerReview.startGold)} → {fmt(selectedPlayerReview.endGold)}</b><span>Start- und Endbestand</span></div>
          <div><small>Truppenbestand</small><b>{fmt(selectedPlayerReview.startTroops)} → {fmt(selectedPlayerReview.endTroops)}</b><span>Start- und Endbestand</span></div>
          <div><small>Gebietszuwachs-Pause</small><b>{fmt(selectedPlayerReview.longestNoExpansionSeconds)} s</b><span>Längster beobachteter Zeitraum ohne Zuwachs</span></div>
        </div>
        <p className="coach-state-caveat">Das sind beobachtete Zustandsunterschiede, keine automatische Bewertung einzelner Befehle. Die längste Pause wird aus gespeicherten Stichproben abgeleitet; sie ist kein Beweis für Leerlauf.</p>
        {selectedActionReviews.some(item=>item.delta10s || item.delta30s) && <div className="coach-action-outcomes">
          <b>Eigene Aktionen: beobachtete Folge nach 10 und 30 Sekunden</b>
          <p>Die Werte sind Nettoveränderungen gegenüber dem Zustand vor dem Befehl. Weitere gleichzeitige Spielereignisse können mitwirken.</p>
          <div>{selectedActionReviews.filter(item=>item.delta10s || item.delta30s).slice(0,6).map(item=><div className="coach-action-outcome" key={`${item.turn}-${item.type}`}>
            <time>{clock(item.seconds)}</time><b>{item.label}</b><span>+10 s: Gebiet {item.delta10s?.tiles===undefined?'–':item.delta10s.tiles>0?'+':''}{item.delta10s?fmt(item.delta10s.tiles):''} · Truppen {item.delta10s?.troops===undefined?'–':item.delta10s.troops>0?'+':''}{item.delta10s?fmt(item.delta10s.troops):''} · Gold {item.delta10s?.gold===undefined?'–':item.delta10s.gold>0?'+':''}{item.delta10s?fmt(item.delta10s.gold):''} | +30 s: Gebiet {item.delta30s?.tiles===undefined?'–':item.delta30s.tiles>0?'+':''}{item.delta30s?fmt(item.delta30s.tiles):''} · Truppen {item.delta30s?.troops===undefined?'–':item.delta30s.troops>0?'+':''}{item.delta30s?fmt(item.delta30s.troops):''} · Gold {item.delta30s?.gold===undefined?'–':item.delta30s.gold>0?'+':''}{item.delta30s?fmt(item.delta30s.gold):''}</span>
            {item.type === 'attack' && item.ownFrontContextBefore && <small>Vor dem Befehl: {item.ownFrontContextBefore.activeTargetCount} aktive Angriffsziel(e) · {item.ownFrontContextBefore.outgoingAttackCount} Angriffe / {fmt(item.ownFrontContextBefore.outgoingAttackTroops)} Truppen gebunden · {item.ownFrontContextBefore.incomingAttackCount} eingehende Angriffe mit {fmt(item.ownFrontContextBefore.incomingAttackTroops)} Truppen</small>}
            {item.targetName && item.targetPressureBefore && <small>Bereits auf {item.targetName} unterwegs: {item.targetPressureBefore.otherAttackerCount} andere Spieler · {item.targetPressureBefore.otherAttackCount} Angriffe · {fmt(item.targetPressureBefore.otherAttackTroops)} Truppen anderer Spieler{item.targetPressureBefore.otherAttackerNames.length ? ` · ${item.targetPressureBefore.otherAttackerNames.join(', ')}` : ''}</small>}
            {item.targetName && <><small>Spielerziel {item.targetName} nach 30 s: Gebiet {item.targetDelta30s?.tiles===undefined?'–':item.targetDelta30s.tiles>0?'+':''}{item.targetDelta30s?fmt(item.targetDelta30s.tiles):''} · Truppen {item.targetDelta30s?.troops===undefined?'–':item.targetDelta30s.troops>0?'+':''}{item.targetDelta30s?fmt(item.targetDelta30s.troops):''} · Gold {item.targetDelta30s?.gold===undefined?'–':item.targetDelta30s.gold>0?'+':''}{item.targetDelta30s?fmt(item.targetDelta30s.gold):''} · {item.targetAliveAt30s===false?'ausgeschieden':item.targetAliveAt30s===true?'lebt noch':'Status nicht erfasst'}</small><small>{item.activeAttack30s ? (item.activeAttack30s.count ? `${item.activeAttack30s.count} Angriff(e) noch aktiv · ${fmt(item.activeAttack30s.troops)} Truppen${item.activeAttack30s.retreatingCount ? ` · ${item.activeAttack30s.retreatingCount} im Rückzug` : ''}` : 'Kein Angriff auf dieses Ziel im 30-Sekunden-Frame aktiv') : 'Angriffsstatus nach 30 s nicht erfasst'}</small></>}
          </div>)}</div>
        </div>}
        </section>
      </details>}
      {simulationResult?.status === 'verified' && <details className="coach-deep-dive"><summary>Phasenvergleich öffnen <span>Early · Mid · Late Game</span></summary><section className="coach-phase-profile coach-phase-details coach-phase-redesign"><div className="coach-phase-inner">
        <div className="coach-engine-findings-heading"><span className="coach-report-label">DEINE PERFORMANCE</span><b>In welcher Phase lief es am besten?</b><p>Early, Mid und Late Game im direkten Vergleich.</p></div>
        {!alivePlayerSamples.length && <p className="coach-no-decision">Für diesen Spieler wurde kein aktiver Spielzustand erkannt. Deshalb zeigen wir weder eine Ausscheidungszeit noch Leistungsraten an. Prüfe die Spielerauswahl oder lade das Replay erneut.</p>}
        <div className="coach-phase-grid">{ratedPhases.map(phase=><article className={`coach-phase-card coach-phase-card-v3 phase-${phase.id}`} key={phase.id}>
          <div className="coach-phase-card-top"><span>{phase.label}</span><b>{phase.assessment === 'Schwächste Phase' ? 'FOKUS' : phase.assessment === 'Stärkste Phase' ? 'STÄRKE' : phase.assessment === 'Nicht sicher bewertbar' ? 'ZU WENIG DATEN' : 'AUSGEWOGEN'}</b></div>
          <div className="coach-phase-metrics-v3">
            <div><strong>{phase.territoryRate === null ? '–' : phase.territoryRate.toFixed(1).replace('.',',')}</strong><small>Gebiete / Min.</small></div>
            <div><strong>{phase.incomeRate === null ? '–' : Math.round(phase.incomeRate).toLocaleString('de-DE')}</strong><small>Gold / Min.</small></div>
            <div><strong>{phase.attackCount}</strong><small>Angriffe</small></div>
          </div>
          <p className="coach-phase-one-line">{phase.hint}</p>
          {phase.id === 'late' && playerEliminatedAtSeconds !== null && <small className="coach-phase-elimination">Ausgeschieden bei {clock(playerEliminatedAtSeconds)}</small>}
          <details><summary>Was steckt dahinter?</summary><p>{phase.description}</p>{phase.strengthLabels.length > 0 && <p><strong>Stärken:</strong> {phase.strengthLabels.join(' · ')}</p>}<p>{phase.targetPressureWins > 0 ? `${phase.targetPressureWins} Ziele verloren innerhalb von 30 Sekunden nach einem deiner Befehle Gebiet. Zeitlicher Zusammenhang, kein alleiniger Erfolgsnachweis.` : 'Kein entsprechender Ziel-Gebietsverlust im erfassten 30-Sekunden-Fenster.'}</p></details>
        </article>)}</div>
        <small className="coach-phase-note">Die Phasenwerte zeigen beobachtete Raten, keine Ursache oder optimale Strategie. Ein Gebietszuwachs nach einem Angriff beweist nicht, dass dieser Befehl ihn verursacht hat. Bei zu wenigen Stichproben wird keine Einstufung vorgenommen.</small>
      </div></section></details>}
      {simulationResult?.status === 'verified' && <details className="coach-deep-dive"><summary>Langfristiges Spielerprofil öffnen <span>Entwicklung über mehrere Partien</span></summary><section className="coach-history-profile">
        <div className="coach-engine-findings-heading"><span className="coach-report-label">DEINE ENTWICKLUNG ÜBER MEHRERE PARTIEN</span><b>Langfristiges Spielerprofil</b><p>Jede hash-verifizierte Partie wird lokal auf diesem Gerät gespeichert. Die Übersicht zeigt deine letzten Partien für diesen Spielernamen.</p></div>
        {recentPhaseHistory.length < 2 ? <p className="coach-history-empty">{recentPhaseHistory.length === 1 ? 'Eine Partie gespeichert. Nach der nächsten verifizierten Partie werden erste Vergleiche sichtbar.' : 'Noch keine gespeicherten Partien. Analysiere weitere Replays mit erfolgreicher Hash-Prüfung.'}</p> : <>
          <div className="coach-history-count"><b>{recentPhaseHistory.length}</b><span>gespeicherte Partien · letzte 12</span></div>
          <div className="coach-history-grid">{phaseTrend.map(phase=><article className="coach-history-card" key={phase.id}><b>{phase.label}</b><strong>{phase.strong}/{phase.games}</strong><small>Phasen mit messbarem Fortschritt</small><span>{phase.averageTerritory.toFixed(1)} Gebiete / Min. im Schnitt</span><span>{Math.round(phase.averageIncome).toLocaleString('de-DE')} Gold / Min. im Schnitt</span></article>)}</div>
          <div className="coach-history-recent"><b>Zuletzt analysiert</b>{recentPhaseHistory.slice(0,5).map(game=><div key={game.key}><span>{game.playerName} · {game.mapName}</span><small>{new Date(game.playedAt).toLocaleDateString('de-DE')} · {game.phases.map(p=>p.rating).join(' / ')}</small></div>)}</div>
        </>}
        <small className="coach-phase-note">Es werden nur zusammengefasste Phasenwerte gespeichert, keine Replay-Dateien. Der Verlauf bleibt auf diesem Gerät und wird nicht automatisch zwischen Android, Windows und anderen Browsern synchronisiert.</small>
      </section></details>}
      {orderedEngineInsights.length > 0 && <section className="coach-engine-findings">
        <div className="coach-engine-findings-heading"><span className="coach-report-label">ENTSCHEIDUNGEN STATT STATISTIK</span><b>Weitere Lernpunkte</b><p>Nur wenn es noch etwas Wichtiges gibt.</p></div>
        {primaryEngineInsights.length === 0 ? <p className="coach-no-decision">In diesem Replay wurde kein ausreichend belegter konkreter Entscheidungsmoment erkannt. Das ist kein Beweis für perfektes Spiel – wir zeigen lieber keinen erfundenen Fehler.</p> : <div className="coach-engine-findings-list">{primaryEngineInsights.slice(1).map((item,index)=><details className={`coach-engine-finding-details finding-${item.kind}`} key={item.id}>
          <summary><span>{item.kind === 'strength' ? 'STÄRKE' : item.priority === 'high' ? 'HOHE PRIORITÄT' : item.priority === 'medium' ? 'PRÜFPUNKT' : item.kind === 'review' ? 'PRÜFEN' : 'BEOBACHTUNG'}</span><b>{item.title}</b>{item.seconds !== null && <time>{clock(item.seconds)}</time>}<small>{item.summary}</small></summary>
          <div className="coach-engine-finding-content">
          {item.decision && <p><strong>Deine Entscheidung:</strong> {item.decision}</p>}
          <small><strong>Beleg:</strong> {item.evidence}</small>
          {item.alternative && <div className="coach-report-action"><b>Was du vorher prüfen solltest</b><span>{item.alternative}</span></div>}
          <p><strong>Nächster Trainingsschritt:</strong> {item.nextStep}</p>
          <small><strong>Sicherheit:</strong> {item.confidence === 'high' ? 'hoch' : item.confidence === 'medium' ? 'mittel' : 'nicht eingestuft'} · <strong>Grenze:</strong> {item.limitation}</small>
          </div>
        </details>)}</div>}
        {supportingEngineInsights.length > 0 && <details className="coach-secondary-details">
          <summary>Weitere Engine-Hinweise anzeigen ({supportingEngineInsights.length})</summary>
          <div className="coach-engine-findings-list">{supportingEngineInsights.map(item=><details className={`coach-engine-finding-details finding-${item.kind}`} key={item.id}>
            <summary><b>{item.title}</b>{item.seconds !== null && <time>{clock(item.seconds)}</time>}<small>{item.summary}</small></summary>
            <div className="coach-engine-finding-content"><small><strong>Beleg:</strong> {item.evidence}</small><p>{item.nextStep}</p><small>{item.limitation}</small></div>
          </details>)}</div>
        </details>}
      </section>}
      <details className="coach-secondary-details">
        <summary>Weitere allgemeine Aktionshinweise anzeigen</summary>
      <div className="coach-report-list">
        {[...insights].filter(x=>x.seconds!==null).sort((a,b)=>(b.priority??0)-(a.priority??0)).map((item,i)=><article className={`coach-report-row insight-${item.kind}`} key={item.id}>
          <div className="coach-report-time"><b>{clock(item.seconds??0)}</b><small>{item.kind==='strength'?'GUT GEMACHT':item.kind==='review'?'PRÜFEN':'BEOBACHTUNG'}</small></div>
          <div className="coach-report-body"><h4>{item.title}</h4><p>{item.summary}</p><div className="coach-report-evidence"><b>Beleg:</b> {item.evidence}</div><p><b>Warum wichtig:</b> {item.why}</p><div className="coach-report-action"><b>Was du daraus lernen kannst</b><span>{item.nextStep}</span></div>{item.alternative && item.alternative !== item.nextStep && <div className="coach-report-action"><b>Konkrete Alternative / nächster Entscheidungscheck</b><span>{item.alternative}</span></div>}<div className="coach-report-evidence"><b>Grenze der Aussage:</b> {item.limitation ?? "Der Aktionsdatensatz belegt den Befehl, nicht automatisch dessen Ergebnis."}</div></div>
        </article>)}
      </div>

      </details>
      <details className="coach-report-limit"><summary>Was der Coach noch nicht sicher beurteilen kann</summary><p>Ob ein Angriff erfolgreich war, wie viele Truppen verloren gingen oder ob ein Bau optimal war, erfordert den rekonstruierten Karten-, Gold- und Truppenstand.</p></details>
    </section>}
    {playerScoped && workspaceTab==='replay' && <section className="replay-workspace">
      <div className="replay-stage">
        <div className="replay-stage-map"><MapPreview map={apiResult.mapName} src={apiResult.previewUrl}/><div className="replay-stage-overlay"><span className="eyebrow">DEINE PARTIE</span><h3>{apiResult.mapName}</h3><p>{apiResult.gameMode} · {apiResult.gameType} · {clock(apiResult.durationSeconds??0)}</p><button className="studio-button primary" onClick={onOpenReplay}><Gamepad2 size={16}/>Original-Replay öffnen</button></div></div>
        <div className="replay-stage-side"><span className="eyebrow">MATCH-ÜBERSICHT</span><div><b>{fmt(apiResult.playerCount??0)}</b><small>Spieler</small></div><div><b>{fmt(playerActions.length)}</b><small>Deine Aktionen</small></div><div><b>{fmt(replayTimeline.length)}</b><small>Markierte Zeitpunkte</small></div><p>Wähle einen Moment. Die Coach-Marker zeigen deine wichtigsten Lernpunkte.</p></div>
      </div>
      <div className="replay-timeline-panel"><div className="overview-heading"><div><span className="eyebrow">MATCH-TIMELINE</span><h3>Wichtige Momente deiner Partie</h3></div><span className="source-label">{primaryEngineInsights.length} priorisierte Coach-Marker</span></div>
        {replayTimeline.length ? <div className="event-timeline">{replayTimeline.map((event,i)=><button type="button" aria-pressed={selectedTimelineEntry?.id===event.id} className={`event-item replay-event-button ${selectedTimelineEntry?.id===event.id?'is-selected':''} ${event.insight?'is-coach-event':''}`} key={event.id} onClick={()=>setSelectedTimelineId(event.id)}><span className="event-marker"><span>{String(i+1).padStart(2,'0')}</span></span><span className="event-copy"><span><b>{event.title}</b><span className="event-type">{event.kind}</span></span><span>{event.detail}</span></span><time>{clock(event.time)}</time></button>)}</div> : <p className="empty-note">Für diese Partie wurden keine markierbaren Ereignisse gefunden.</p>}
        {selectedTimelineEntry && <article className="replay-event-detail">
          <div className="replay-event-detail-main"><span className="eyebrow">{selectedTimelineEntry.kind} · AUSGEWÄHLTER ZEITPUNKT</span><h4>{selectedTimelineEntry.title}</h4><p>{selectedTimelineEntry.detail}</p>
            {selectedTimelineEntry.insight && <><div className="replay-event-evidence"><b>Replay-Beleg</b><span>{selectedTimelineEntry.insight.evidence}</span></div><div className="replay-event-action"><b>Nächster Schritt</b><span>{selectedTimelineEntry.insight.nextStep}</span></div><small>{selectedTimelineEntry.insight.limitation}</small></>}
          </div>
          <div className="replay-event-detail-side"><strong>{clock(selectedTimelineEntry.time)}</strong><button type="button" className="studio-button primary" onClick={onOpenReplay}><Gamepad2 size={15}/>Original-Replay öffnen</button><small>Der Original-Viewer startet am Anfang. Springe dort mit seiner Zeitleiste zu diesem Zeitpunkt.</small></div>
        </article>}
      </div>
    </section>}
    {playerScoped && workspaceTab==='analysis' && analysisTab==='overview' && <section id="match-overview" className="overview-block">
      <div className="overview-heading"><div><span className="eyebrow">01 / AUF EINEN BLICK</span><h3>Partie in Zahlen</h3></div><span className="source-label"><CheckCircle2 size={14}/> Aus dem Aktionsprotokoll</span></div>
      <div className="overview-kpis">
        <article className="overview-kpi"><span>Gesamtaktionen</span><b>{fmt(scopedAnalysis.totalActions)}</b><small>{scopedAnalysis.actionsPerMinute.toFixed(1).replace('.',',')} Aktionen je Minute</small></article>
        <article className="overview-kpi"><span>Angriffe</span><b>{fmt(scopedAnalysis.attackCount)}</b><small>Protokollierte Angriffsbefehle</small></article>
        <article className="overview-kpi"><span>Bootsaktionen</span><b>{fmt(scopedAnalysis.boatCount)}</b><small>Protokollierte Transporte</small></article>
        <article className="overview-kpi"><span>Bauaktionen</span><b>{fmt(totalBuilds)}</b><small>{fmt(builds.length)} verschiedene Gebäudetypen</small></article>
      </div>
      <div className="overview-columns">
        <article className="overview-panel"><div className="overview-panel-title"><div><span className="eyebrow">AKTIONSMIX</span><h4>Wofür du Aktionen eingesetzt hast</h4></div></div>
          <div className="category-list">{categories.map(([name,value],i)=><div className="category-row" key={name}><span className="category-rank">{String(i+1).padStart(2,'0')}</span><span className="category-name">{name}</span><div className="category-track"><div className={`category-fill category-fill-${i%4}`} style={{width:`${value/Math.max(1,scopedAnalysis.totalActions)*100}%`}}/></div><b>{fmt(value)}</b><small>{formatPct(value/Math.max(1,scopedAnalysis.totalActions)*100)}</small></div>)}</div>
        </article>
        <article id="match-activity" className="overview-panel"><div className="overview-panel-title"><div><span className="eyebrow">ZEITLICHER VERLAUF</span><h4>Wann warst du besonders aktiv?</h4></div><span className="unit-note">5-Minuten-Intervalle</span></div>
          {buckets.length ? <div className="activity-chart" role="img" aria-label="Balkendiagramm der Aktionen je Fünf-Minuten-Intervall">{buckets.map((b,i)=><div className="activity-chart-row" key={i}><span>{b.label}</span><div className="activity-chart-track"><div className="activity-chart-fill" style={{width:`${b.total/Math.max(1,...buckets.map(x=>x.total))*100}%`}}/></div><b>{fmt(b.total)}</b></div>)}</div> : <p className="empty-note">Für diese Partie liegen keine Zeitintervalle vor.</p>}
          <p className="chart-footnote">Hohe Aktivität bedeutet viele protokollierte Befehle – nicht automatisch gute oder schlechte Entscheidungen.</p>
        </article>
      </div>
    </section>}
    {playerScoped && workspaceTab==='analysis' && analysisTab==='economy' && <section id="match-economy" className="domain-workspace">
      <div className="overview-heading section-spaced"><div><span className="eyebrow">03 / WIRTSCHAFT</span><h3>Gold, Einkommen und Ausbau</h3><p>Original-Engine-Werte aus den erfassten Spielzuständen. Einnahmen sind brutto; Ausgaben und Gewinn werden hier nicht gleichgesetzt.</p></div></div>
      {incomeSummary ? <>
        <div className="overview-kpis">
          <article className="overview-kpi"><span>Gold-Einnahmen brutto</span><b>{fmt(incomeSummary.gross)}</b><small>Im erfassten Zeitraum</small></article>
          <article className="overview-kpi"><span>Handel</span><b>{fmt(incomeSummary.trade)}</b><small>Erfasste Handelseinnahmen</small></article>
          <article className="overview-kpi"><span>Züge</span><b>{fmt(incomeSummary.train)}</b><small>Erfasste Zugeinnahmen</small></article>
          <article className="overview-kpi"><span>Piraterie</span><b>{fmt(incomeSummary.piracy)}</b><small>Erfasste Piraterieeinnahmen</small></article>
        </div>
        <div className="domain-footnote"><b>Goldbestand im selben Zeitraum</b><p>{fmt(firstEngineSample?.gold ?? 0)} → {fmt(lastEngineSample?.gold ?? 0)} ({incomeSummary.goldChange>0?'+':''}{fmt(incomeSummary.goldChange)}). Das ist die Veränderung des Bestands, nicht der Nettogewinn aus einzelnen Aktionen.</p></div>
      </> : <p className="empty-note">Für den ausgewählten Spieler liegen noch keine Engine-Stichproben zum Einkommen vor. Prüfe die Engine-Kompatibilität oder lade eine Partie mit passenden Prüfpunkten.</p>}
      {alivePlayerSamples.length > 1 && <div className="analytics-chart-grid">
        <ReplayTrendChart title="Goldbestand" description="So hat sich dein verfügbarer Goldbestand während deiner überlebten Spielzeit verändert." unit="Gold" points={alivePlayerSamples.map(sample=>({time:sample.tick/10,value:sample.player.gold}))}/>
        <ReplayTrendChart title="Gebietsentwicklung" description="Deine gehaltenen Felder im Verlauf. Nach dem Ausscheiden werden keine späteren Werte einbezogen." unit="Felder" points={alivePlayerSamples.map(sample=>({time:sample.tick/10,value:sample.player.tiles}))}/>
      </div>}
      <div className="overview-columns section-spaced">
        <article className="overview-panel"><div className="overview-panel-title"><div><span className="eyebrow">BAUAKTIONEN</span><h4>Was du gebaut hast</h4></div><b>{fmt(totalBuilds)}</b></div>
          {builds.length ? <div className="build-list">{builds.slice().sort((a,b)=>b.count-a.count).map(x=><div className="build-row" key={x.unit}><span>{x.unit}</span><div className="build-track"><div style={{width:`${x.count/Math.max(1,...builds.map(v=>v.count))*100}%`}}/></div><b>{fmt(x.count)}</b></div>)}</div> : <p className="empty-note">Keine Bauaktionen dekodiert.</p>}
        </article>
        <article className="overview-panel"><div className="overview-panel-title"><div><span className="eyebrow">GEBÄUDE- UND EINHEITENBESTAND</span><h4>Erster und letzter erfasster Stand</h4></div></div>
          {unitStockRows.length ? <div className="coach-stock-list">{unitStockRows.map(unit=><div className="coach-stock-row" key={unit.key}><span>{unit.label}</span><b>{fmt(unit.start)} <i>→</i> {fmt(unit.end)}</b></div>)}</div> : <p className="empty-note">Keine erfassten Gebäudestände in diesem Replay.</p>}
          <p className="chart-footnote">Das ist der Bestand in den ersten und letzten gespeicherten Stichproben – keine Produktions- oder Effizienzbewertung.</p>
        </article>
      </div>
    </section>}
    {playerScoped && workspaceTab==='analysis' && analysisTab==='military' && <section id="match-military" className="domain-workspace">
      <div className="overview-heading section-spaced"><div><span className="eyebrow">04 / MILITÄR</span><h3>Angriffe und Frontdruck</h3><p>Beobachtete Angriffsbefehle, gleichzeitig aktive Angriffe und bereits bedrängte Ziele.</p></div></div>
      <div className="overview-kpis">
        <article className="overview-kpi"><span>Eigene Angriffsbefehle</span><b>{fmt(scopedAnalysis.attackCount)}</b><small>{firstAttack ? `Erster Befehl bei ${clock(firstAttack.seconds)}` : 'Keine Angriffe protokolliert'}</small></article>
        <article className="overview-kpi"><span>Max. aktive Angriffe</span><b>{fmt(maxOutgoingAttacks)}</b><small>Höchster erfasster Stichprobenwert</small></article>
        <article className="overview-kpi"><span>Max. gebundene Angriffstruppen</span><b>{fmt(maxCommittedAttackTroops)}</b><small>In aktiven Angriffen beobachtet</small></article>
        <article className="overview-kpi"><span>Max. eingehende Angriffe</span><b>{fmt(maxIncomingAttacks)}</b><small>Gleichzeitig beobachteter Druck</small></article>
      </div>
      {alivePlayerSamples.length > 1 && <div className="analytics-chart-grid">
        <ReplayTrendChart title="Truppenbestand" description="Gesamtbestand deiner Truppen laut Original-Engine-Stichproben." unit="Truppen" points={alivePlayerSamples.map(sample=>({time:sample.tick/10,value:sample.player.troops}))}/>
        <ReplayTrendChart title="Gleichzeitige Angriffe" description="Wie viele eigene Angriffe in den erfassten Spielständen gleichzeitig aktiv waren." unit="Angriffe" points={alivePlayerSamples.map(sample=>({time:sample.tick/10,value:sample.player.outgoingAttacks}))}/>
      </div>}
      <div className="overview-columns section-spaced">
        <article className="overview-panel"><div className="overview-panel-title"><div><span className="eyebrow">ZIELAUSWAHL</span><h4>Gegner bereits unter Druck</h4></div><b>{fmt(attackedPressuredTargets.length)}</b></div>
          <p className="domain-subtitle">Von {fmt(targetedAttackReviews.length)} zugeordneten Spielerangriffen trafen {fmt(attackedPressuredTargets.length)} auf ein Ziel, auf das bereits andere Spieler angriffen.</p>
          {attackedPressuredTargets.length ? <div className="coach-stock-list">{attackedPressuredTargets.slice(0,8).map(item=><div className="coach-stock-row" key={item.frame}><span>{item.targetName} · {clock(item.seconds)}</span><b>{fmt(item.targetPressureBefore?.otherAttackerCount ?? 0)} andere Spieler</b></div>)}</div> : <p className="empty-note">Kein bereits von anderen Spielern angegriffenes Ziel in den erfassten Befehlen gefunden.</p>}
        </article>
        <article className="overview-panel"><div className="overview-panel-title"><div><span className="eyebrow">+30-SEKUNDEN-FENSTER</span><h4>Beobachtete Gebietsveränderung</h4></div></div>
          <div className="military-split"><div><span>Angriffe mit eigenem Gebietszuwachs</span><b>{fmt(ownAttackTerritoryGainCount)}</b><small>Beobachtete positive Änderung</small></div><div><span>Ziele mit Gebietsverlust</span><b>{fmt(targetTerritoryLossCount)}</b><small>Beobachtete negative Zieländerung</small></div></div>
          <p className="chart-footnote">Gleichzeitige Spielereignisse können diese Veränderung mitverursacht haben. Das ist keine Trefferquote oder kausale Erfolgswertung.</p>
        </article>
      </div>
      <div className="domain-footnote"><b>Einordnung</b><p>Einheiten in aktiven Angriffen sind gebundene Truppen, nicht dein gesamter verfügbarer Truppenbestand. Anzahl und Stärke der Angriffe belegen keine räumliche Front, Reichweite oder Siegchance.</p></div>
    </section>}
    {playerScoped && workspaceTab==='analysis' && analysisTab==='phases' && <section className="domain-workspace">
      <div className="overview-heading section-spaced"><div><span className="eyebrow">SPIELPHASEN</span><h3>Early, Mid und Late Game</h3><p>Vergleiche deine Entwicklung innerhalb dieser Partie. Die Werte sind Beobachtungen und keine allgemeine Spielstärke-Bewertung.</p></div></div>
      {ratedPhases.length ? <div className="phase-visual-grid phase-quick-grid">{ratedPhases.map(phase=><article className={"coach-phase-card phase-quick-card " + (phase.assessment==='Schwächste Phase'?'phase-needs-work':phase.assessment==='Stärkste Phase'?'phase-strong':'')} key={phase.id}>
        <span>{phase.label}</span><b>{phase.assessment}</b>
        <p>{phase.hint}</p>
        <div className="phase-quick-stats">
          <div><strong>{phase.territoryRate===null?'–':phase.territoryRate.toFixed(1).replace('.',',')}</strong><small>Gebiete/Min.</small></div>
          <div><strong>{phase.incomeRate===null?'–':Math.round(phase.incomeRate).toLocaleString('de-DE')}</strong><small>Gold/Min.</small></div>
          <div><strong>{phase.attackCount}</strong><small>Angriffe</small></div>
        </div>
      </article>)}</div> : <p className="empty-note">Phasenvergleiche erscheinen nach erfolgreicher Hash-Verifikation der Original-Engine.</p>}
      <p className="chart-footnote">Phasenwerte vergleichen nur deine eigenen Phasen. Zu wenige Stichproben werden nicht bewertet. Ein zeitgleicher Gebietszuwachs beweist nicht, dass ein einzelner Befehl ihn verursacht hat.</p>
      {recentPhaseHistory.length>1 && <section className="overview-panel section-spaced"><h4>Deine letzten Partien</h4><div className="coach-history-grid">{phaseTrend.map(phase=><article className="coach-history-card" key={phase.id}><b>{phase.label}</b><strong>{phase.strong}/{phase.games}</strong><small>starke Phasen</small><span>{phase.averageTerritory.toFixed(1)} Gebiete / Min.</span><span>{Math.round(phase.averageIncome).toLocaleString('de-DE')} Gold / Min.</span></article>)}</div></section>}
    </section>}
    {playerScoped && workspaceTab==='analysis' && analysisTab==='timeline' && <section id="match-timeline" className="overview-panel timeline-panel"><div className="overview-panel-title"><div><span className="eyebrow">04 / WICHTIGE ZEITPUNKTE</span><h4>Hier lohnt sich ein genauer Blick</h4><p>Automatisch aus dem Protokoll ermittelte Ereignisse – keine nachträgliche Bewertung.</p></div><button className="secondary compact-button" onClick={onOpenReplay}>Im Replay ansehen <ArrowRight size={15}/></button></div>
      {timeline.length ? <div className="event-timeline">{timeline.map((event,i)=><div className="event-item" key={`${event.kind}-${i}`}><div className="event-marker"><span>{String(i+1).padStart(2,'0')}</span></div><div className="event-copy"><div><b>{event.title}</b><span className="event-type">{event.kind}</span></div><p>{event.detail}</p></div><time>{clock(event.time)}</time></div>)}</div> : <p className="empty-note">Keine markierbaren Ereignisse im Protokoll gefunden.</p>}
    </section>}

    {playerScoped && workspaceTab==='analysis' && analysisTab==='technical' && <details className="technical-details" open><summary>Technische Rohdaten und vollständige Aktionsliste <ChevronDown size={16}/></summary><div className="details-grid">{Object.entries(scopedAnalysis.categoryCounts).map(([k,v])=><Detail key={k} label={k} value={fmt(v)}/>)}</div><h3>Alle Bauaktionen</h3><div className="details-grid">{builds.map(x=><Detail key={x.unit} label={x.unit} value={fmt(x.count)}/>)}</div><div className="action-list">{playerActions.slice(0,200).map((a,i)=><div className="check-row" key={`${a.turn}-${i}`}><div><b>{a.label}</b><small>Spielzug {a.turn} · {clock(a.seconds)} · {a.details}</small></div><span className="pill blue">{a.category}</span></div>)}</div>{playerActions.length>200&&<p className="muted">Die Anzeige zeigt 200 von {fmt(playerActions.length)} Aktionen. Der CSV-Export enthält alle Aktionen.</p>}</details>}
  </section>;
}

function flattenStats(value:Record<string,unknown>,prefix=''):Array<[string,string]>{const out:Array<[string,string]>=[];for(const [key,v] of Object.entries(value)){const name=prefix?`${prefix}.${key}`:key;if(Array.isArray(v))out.push([name,v.map(x=>String(x)).join(' / ')]);else if(v&&typeof v==='object')out.push(...flattenStats(v as Record<string,unknown>,name));else if(v!==null&&v!==undefined)out.push([name,String(v)]);}return out;}
function clock(seconds:number){const s=Math.max(0,Math.round(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) { return <div className="metric"><div className="metric-icon">{icon}</div><small>{label}</small><b>{value}</b></div>; }
function Detail({label,value}:{label:string;value:string}) { return <div className="detail"><small>{label}</small><b>{value}</b></div>; }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
