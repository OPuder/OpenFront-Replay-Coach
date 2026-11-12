import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FileUp, Gamepad2, Clock3, Users, Map, ShieldCheck, AlertTriangle, CheckCircle2, HardDrive, ArrowRight, Link2, DownloadCloud, LayoutDashboard, Brain, ListChecks, ChevronDown, Building2, Activity, Search, Trophy, Swords, Ship, TrendingUp, CalendarDays, SlidersHorizontal, Home, ChevronRight, Sparkles } from 'lucide-react';
import './style.css';
import { analyzeActions } from '../main/decoder/ActionAnalysis';
import { analyzeDetailedActions } from '../main/decoder/DetailedAnalysis';
import { buildCoachInsights } from '../main/decoder/CoachInsights';

function App() {
  const [replay, setReplay] = useState<ReplaySummary | null>(null);
  const [activePage, setActivePage] = useState<'dashboard'|'games'|'analysis'>('dashboard');
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  function navigateTo(page: 'dashboard'|'games'|'analysis') {
    setActivePage(page);
    setMapRefreshKey(key => key + 1);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [url, setUrl] = useState('https://openfront.io/w5/game/e9D8juQg');
  const [apiResult, setApiResult] = useState<ApiImportSummary | null>(null);
  const [decodedActions, setDecodedActions] = useState<DecodedAction[]>([]);
  const [playerId, setPlayerId] = useState('https://openfront.io/player/5SVg4WbI');
  const [playerPage, setPlayerPage] = useState<PlayerPage | null>(null);
  const [playerBusy, setPlayerBusy] = useState(false);
  const [playerProgress, setPlayerProgress] = useState<{loaded:number;pages:number;status:string}|null>(null);
  const [gameFilter, setGameFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [gameSearch, setGameSearch] = useState('');
  async function loadPlayer() { setPlayerBusy(true); setError(''); setPlayerProgress({loaded:0,pages:0,status:'Profil wird geladen …'}); try { const page = await window.replayAPI.loadPlayer(playerId, progress => setPlayerProgress(progress)); setPlayerPage(page); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setPlayerBusy(false); } }
  async function choosePlayerGame(gameId: string) {
    setUrl(`https://openfront.io/w5/game/${gameId}`);
    setBusy(true); setError('');
    try {
      const selectedGame = playerPage?.games.find(game => game.gameId === gameId);
      const result = await window.replayAPI.importReplayUrl(`https://openfront.io/w5/game/${gameId}`);
      if (!('canceled' in result)) {
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
        setApiResult(result);
        setDecodedActions(result.decodedActions ?? []);
        setReplay(null);
        setMapRefreshKey(key => key + 1);
        setActivePage('analysis');
      }
    } catch(e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function importUrl() { setBusy(true); setError(''); setApiResult(null); try { const result = await window.replayAPI.importReplayUrl(url); if ('canceled' in result) { setError('Speichern abgebrochen. Die API-Antwort wurde nicht lokal abgelegt.'); } else { setApiResult(result); setDecodedActions(result.decodedActions ?? []); setReplay(null); setActivePage('analysis'); } } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  async function openReplay() { setBusy(true); setError(''); try { const result = await window.replayAPI.openReplay(); if (result) { setReplay(result); setDecodedActions(result.decodedActions ?? []); setApiResult(null); setActivePage('analysis'); } } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  async function saveReplayJson() {
    if (!apiResult?.gameId) {
      setError('Für diese Partie liegt kein herunterladbarer Original-Datensatz in der aktuellen Sitzung vor. Bitte die Partie zuerst erneut über ihren OpenFront-Link laden.');
      return;
    }
    setError(''); setSaveNotice('');
    try {
      const result = await window.replayAPI.saveReplayJson(apiResult.gameId);
      if (result?.saved) setSaveNotice(`Gespeichert (${result.bytes} Bytes): ${result.filePath} – der Speicherort wurde im Explorer geöffnet.`);
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
  const wins = loadedGames.filter(g => g.result === 'victory').length;
  const losses = loadedGames.filter(g => g.result === 'defeat').length;
  const completedGames = wins + losses;
  const winRate = completedGames ? wins / completedGames * 100 : 0;
  const avgDuration = loadedGames.filter(g => Number.isFinite(g.durationSeconds) && (g.durationSeconds ?? 0) > 0).reduce((sum,g)=>sum+(g.durationSeconds ?? 0),0) / Math.max(1, loadedGames.filter(g => (g.durationSeconds ?? 0) > 0).length);
  const modeStats = Object.entries(loadedGames.reduce((acc:Record<string,number>,g)=>{const key=g.mode ?? 'Unbekannt';acc[key]=(acc[key]??0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const recentGames = [...loadedGames].filter(g=>g.start).sort((a,b)=>new Date(b.start!).getTime()-new Date(a.start!).getTime()).slice(0,10);
  const resultLabel = (result?:string) => result === 'victory' ? 'Sieg' : result === 'defeat' ? 'Niederlage' : 'Unvollständig';
  const size = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
  const profileName = playerPage?.profile.username ?? playerPage?.profile.accountUsername ?? playerPage?.profile.displayName ?? playerPage?.playerId ?? 'Dein OpenFront-Profil';
  const gameCards = (games: PlayerGame[]) => games.map(g => <GameCard key={g.gameId} game={g} previewUrl={playerPage?.mapPreviews?.[String(g.map ?? '').trim().toLowerCase()]} refreshKey={mapRefreshKey} onAnalyze={() => void choosePlayerGame(g.gameId)} />);
  return <div className="studio-shell">
    <aside className="studio-sidebar">
      <div className="studio-brand"><div className="studio-brand-icon"><Gamepad2 size={22}/></div><div><b>REPLAY COACH</b><small>PERFORMANCE STUDIO</small></div></div>
      <div className="studio-nav-label">WORKSPACE</div>
      <button className={`studio-nav ${activePage==='dashboard'?'active':''}`} onClick={()=>navigateTo('dashboard')}><LayoutDashboard size={17}/>Dashboard</button>
      <button className={`studio-nav ${activePage==='games'?'active':''}`} onClick={()=>navigateTo('games')}><ListChecks size={17}/>Meine Partien</button>
      <button className={`studio-nav ${activePage==='analysis'?'active':''}`} onClick={()=>navigateTo('analysis')} disabled={!apiResult && !replay}><Brain size={17}/>Replay-Analyse</button>
      <div className="studio-sidebar-bottom"><span><ShieldCheck size={14}/> Lokal auf diesem PC</span><small>OpenFront Replay Coach · 2.1.2</small></div>
    </aside>
    <main className="studio-main">
      <header className="studio-header"><div><div className="studio-eyebrow">OPENFRONT / PERFORMANCE STUDIO</div><h1>{activePage==='dashboard'?'Dein Performance-Dashboard':activePage==='games'?'Deine Spielbibliothek':'Match Review'}</h1><p>{activePage==='dashboard'?'Deine Entwicklung, letzte Partien und nächste Trainingsschwerpunkte.':activePage==='games'?'Finde eine Partie und öffne ihre Karten- und Aktionsübersicht.':'Spielverlauf, beobachtete Entscheidungen und Replay an einem Ort.'}</p></div><div className="studio-header-actions"><button className="studio-button subtle" onClick={openReplay} disabled={busy}><FileUp size={16}/> Replay importieren</button></div></header>
      {error && <div className="error"><AlertTriangle size={18}/>{error}</div>}{saveNotice && <div className="success"><CheckCircle2 size={18}/>{saveNotice}</div>}
      {playerBusy && playerProgress && <div className="load-progress studio-card"><div><b>{playerProgress.status}</b><span>{playerProgress.loaded.toLocaleString('de-DE')} Partien · {playerProgress.pages} Seiten</span></div><div className="load-progress-track"><div/></div></div>}
      {activePage==='dashboard' && <>
        <section className="welcome-strip"><div><span className="studio-eyebrow">PLAYER PROFILE</span><h2>Willkommen zurück, {profileName}</h2><p>Deine OpenFront-Partien auf einen Blick.</p></div><div className="profile-loader"><input value={playerId} onChange={e=>setPlayerId(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void loadPlayer();}} placeholder="OpenFront-Profillink oder Spieler-ID"/><button className="studio-button primary" onClick={()=>loadPlayer()} disabled={playerBusy || !playerId.trim()}><Users size={16}/>{playerBusy?'Lade …':'Konto laden'}</button></div></section>
        {playerPage ? <>
          <section className="stat-grid">
            <StatCard icon={<Trophy/>} label="SIEGQUOTE" value={completedGames?`${winRate.toFixed(1).replace('.',',')} %`:'—'} note={`${wins} Siege · ${losses} Niederlagen`} accent="cyan"/>
            <StatCard icon={<Gamepad2/>} label="GELADENE PARTIEN" value={fmt(loadedGames.length)} note="Aktuell geladene Historie" accent="blue"/>
            <StatCard icon={<Clock3/>} label="Ø SPIELDAUER" value={avgDuration?clock(avgDuration):'—'} note="Über geladene Partien" accent="violet"/>
            <StatCard icon={<Activity/>} label="UNVOLLSTÄNDIG" value={fmt(loadedGames.filter(g=>g.result!=='victory'&&g.result!=='defeat').length)} note="Nicht in der Siegquote" accent="amber"/>
          </section>
          <section className="dashboard-grid">
            <article className="studio-card performance-card"><div className="card-heading"><div><span className="studio-eyebrow">MATCH HISTORY</span><h3>Deine letzten Partien</h3></div><button className="text-action" onClick={()=>navigateTo('games')}>Alle Partien <ChevronRight size={15}/></button></div><div className="recent-game-grid">{gameCards(recentGames.slice(0,4))}</div></article>
            <article className="studio-card focus-card"><div className="card-heading"><div><span className="studio-eyebrow">DEIN TRAININGSPLAN</span><h3>Diese Situationen solltest du prüfen</h3></div><Sparkles size={18}/></div>
              {apiResult?.actionAnalysis ? <div className="empty-training"><Brain size={28}/><b>Persönliches Coaching öffnen</b><p>Die Lobby-Aktionszahlen sind kein persönlicher Trainingsplan. Öffne die Replay-Analyse, wähle deinen Spielernamen und erhalte dort deine eigenen Zeitpunkte und Entscheidungen.</p><button className="studio-button primary" onClick={()=>navigateTo('analysis')}>Zur Replay-Analyse <ArrowRight size={15}/></button></div> : <div className="empty-training"><Brain size={28}/><b>Noch keine Partie im Coach</b><p>Lade eine deiner Partien, um deine persönlichen Entscheidungen zu untersuchen.</p><button className="studio-button primary" onClick={()=>navigateTo('games')}>Partie auswählen <ArrowRight size={15}/></button></div>}
            </article>
          </section>
          <section className="studio-card account-strip"><div><span className="studio-eyebrow">ACCOUNT</span><h3>{profileName}</h3><p>Spieler-ID: {playerPage.profile.publicId ?? playerPage.playerId}</p></div><div className="account-strip-right"><span className="status-dot"/>Konto geladen<button className="studio-button subtle" onClick={()=>loadPlayer()} disabled={playerBusy}>Aktualisieren</button></div></section>
          
        </> : <section className="empty-account studio-card"><Users size={32}/><h2>Lade dein OpenFront-Konto</h2><p>Mit deinem öffentlichen Profil können wir deine Partien, Ergebnisse und Karten in einer persönlichen Bibliothek anzeigen.</p><button className="studio-button primary" onClick={()=>loadPlayer()} disabled={playerBusy}>{playerBusy?'Lade Konto …':'Konto laden'}</button></section>}
      </>}
      {activePage==='games' && <>
        <section className="library-toolbar studio-card"><div><span className="studio-eyebrow">MATCH LIBRARY</span><h2>Spielbibliothek</h2><p>{filteredGames.length} von {loadedGames.length} geladenen Partien</p></div><div className="library-filters"><label><SlidersHorizontal size={15}/><select value={gameFilter} onChange={e=>setGameFilter(e.target.value)}><option value="all">Alle Ergebnisse</option><option value="victory">Siege</option><option value="defeat">Niederlagen</option><option value="incomplete">Unvollständig</option></select></label><select value={modeFilter} onChange={e=>setModeFilter(e.target.value)}><option value="all">Alle Modi</option>{Array.from(new Set(loadedGames.map(g=>g.mode).filter(Boolean))).sort().map(m=><option key={m} value={m}>{m}</option>)}</select><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">Alle Spieltypen</option>{Array.from(new Set(loadedGames.map(g=>g.type).filter(Boolean))).sort().map(t=><option key={t} value={t}>{t}</option>)}</select><div className="search-box"><Search size={15}/><input value={gameSearch} onChange={e=>setGameSearch(e.target.value)} placeholder="Karte oder Match-ID suchen"/></div></div></section>
        {filteredGames.length ? <div className="game-library-grid">{gameCards(filteredGames)}</div> : <section className="empty-account studio-card"><Map size={28}/><b>Keine Partien gefunden</b><p>Lade dein Konto oder passe die Filter an.</p></section>}
        
      </>}
      {activePage==='analysis' && <>
        {apiResult ? <>
          <div className="analysis-hero studio-card"><div className="analysis-map-preview"><MapPreview map={apiResult.mapName} src={apiResult.previewUrl} refreshKey={mapRefreshKey}/><div className="map-overlay"><span className="studio-eyebrow">MATCH REVIEW</span><h2>{apiResult.mapName}</h2><p>{apiResult.gameMode} · {apiResult.gameType} · {clock(apiResult.durationSeconds??0)} · {fmt(apiResult.playerCount??0)} Spieler</p></div></div><div className="analysis-hero-side"><span className="studio-eyebrow">MATCH ID</span><b>{apiResult.gameId}</b><button className="studio-button primary" onClick={()=>window.replayAPI.openOfficialReplay(apiResult.gameId)}><Gamepad2 size={16}/> Original-Replay ansehen</button><button className="studio-button subtle" onClick={exportActionsCsv}><DownloadCloud size={16}/> Aktionsprotokoll exportieren</button></div></div>
          {apiResult.actionAnalysis && <CoachPanel apiResult={apiResult} preferredPlayerPublicId={playerPage?.profile?.publicId ?? playerPage?.profile?.publicID ?? null} decodedActions={decodedActions} onExport={exportActionsCsv} onSaveReplayJson={()=>void saveReplayJson()} onOpenReplay={()=>window.replayAPI.openOfficialReplay(apiResult.gameId)} fmt={fmt}/>}
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
    {src && !failed ? <img ref={imageRef} key={`${src}-${refreshKey}-${retry}`} src={imageSrc!} alt={`OpenFront-Karte ${map}`} loading="eager" decoding="async" onLoad={()=>setLoaded(true)} onError={()=>{if(retry<1){setRetry(1);setLoaded(false);}else setFailed(true);}}/> :
      <div className="map-fallback" role="img" aria-label={`Kartenvorschau für ${map} wird gesucht`}>
        <Map size={28}/><b>{map}</b><small>{src ? 'Vorschaubild konnte nicht geladen werden' : 'Offizielle Kartenvorschau nicht verfügbar'}</small>
      </div>}
  </div>;
}
function GameCard({game,previewUrl,refreshKey=0,onAnalyze}:{game:PlayerGame;previewUrl?:string|null;refreshKey?:number;onAnalyze:()=>void}){const win=game.result==='victory',loss=game.result==='defeat';return <article className="game-card"><div className="game-card-visual"><MapPreview map={game.map??'OpenFront'} src={previewUrl} refreshKey={refreshKey}/><span className={`game-result ${win?'win':loss?'loss':'unfinished'}`}>{win?'SIEG':loss?'NIEDERLAGE':'UNVOLLSTÄNDIG'}</span><span className="game-card-duration">{game.durationSeconds?clock(game.durationSeconds):'—'}</span></div><div className="game-card-content"><div className="game-card-title"><div><h3>{game.map??'Unbekannte Karte'}</h3><p>{game.mode??'Spielmodus unbekannt'} · {game.type??'Spieltyp unbekannt'}</p></div><span className="players-count"><Users size={14}/>{game.totalPlayers??'?'}</span></div><div className="game-card-meta"><span><CalendarDays size={13}/>{game.start?new Date(game.start).toLocaleDateString('de-DE'):'Datum unbekannt'}</span><span>Match {game.gameId.slice(0,8)}</span></div><button className="game-card-action" onClick={onAnalyze}>Partie analysieren <ArrowRight size={15}/></button></div></article>;}
function TrainingFocus({apiResult,decodedActions}:{apiResult:ApiImportSummary;decodedActions:DecodedAction[]}){
  const attacks=apiResult.actionAnalysis?.attackCount??0;
  const boats=apiResult.actionAnalysis?.boatCount??0;
  const builds=apiResult.actionAnalysis?.buildCount??0;
  const firstAttack=playerActions.find(a=>a.type==='attack');
  const firstBuild=playerActions.find(a=>a.type==='build_unit');
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
function selectedPlayerName(players:Array<{name:string;clientID:string|null}>,id:string){return players.find(p=>p.clientID===id)?.name ?? '';}
function CoachPanel({apiResult,preferredPlayerPublicId,decodedActions,onExport,onSaveReplayJson,onOpenReplay,fmt}:{preferredPlayerPublicId:string|null;apiResult:ApiImportSummary & {actionAnalysis:NonNullable<ApiImportSummary['actionAnalysis']>};decodedActions:DecodedAction[];onExport:()=>void;onSaveReplayJson:()=>void;onOpenReplay:()=>void;fmt:(n:number)=>string}) {
  const [analysisTab,setAnalysisTab]=useState<'overview'|'decisions'|'economy'|'military'|'timeline'>('decisions');
  const players=apiResult.playerStats ?? [];
  const preferredPlayer=players.find(p=>preferredPlayerPublicId && p.publicID===preferredPlayerPublicId);
  const initialPlayer=preferredPlayer ?? (players.length===1 ? players[0] : null);
  const [selectedClientId,setSelectedClientId]=useState<string>(()=>initialPlayer?.clientID ?? '');
  React.useEffect(()=>{const match=players.find(p=>preferredPlayerPublicId && p.publicID===preferredPlayerPublicId) ?? (players.length===1 ? players[0] : null);setSelectedClientId(match?.clientID ?? '');},[apiResult.gameId,preferredPlayerPublicId]);
  const playerScoped=Boolean(selectedClientId);
  const playerActions=playerScoped ? decodedActions.filter(a=>a.clientId===selectedClientId) : [];
  const scopedAnalysis=analyzeActions(playerActions,apiResult.durationSeconds ?? 0);
  const details=analyzeDetailedActions(playerActions,apiResult.durationSeconds ?? 0);
  const builds=details.buildsByUnit;
  const count=(name:string)=>builds.find(x=>x.unit.toLowerCase()===name.toLowerCase())?.count ?? 0;
  const warships=count('Warship'), ports=count('Port'), cities=count('City'), factories=count('Factory');
  const buckets=details.timeBuckets;
  const peak=[...buckets].sort((a,b)=>b.total-a.total)[0];
  const firstAttack=playerActions.find(a=>a.type==='attack');
  const firstBuild=playerActions.find(a=>a.type==='build_unit');
  const categories=Object.entries(scopedAnalysis.categoryCounts).sort((a,b)=>b[1]-a[1]);
  const timeline=[
    firstBuild ? {time:firstBuild.seconds,title:'Dein erster protokollierter Bau',detail:firstBuild.details || firstBuild.label,kind:'Bau',turn:firstBuild.turn} : null,
    firstAttack ? {time:firstAttack.seconds,title:'Erster protokollierter Angriff',detail:firstAttack.details || firstAttack.label,kind:'Angriff',turn:firstAttack.turn} : null,
    peak ? {time:(buckets.indexOf(peak)*300),title:'Aktivster Fünf-Minuten-Abschnitt',detail:`${fmt(peak.total)} Aktionen · ${peak.attacks} Angriffe · ${peak.boats} Bootsaktionen · ${peak.builds} Bauaktionen`,kind:'Aktivität',turn:null} : null
  ].filter(Boolean).sort((a,b)=>(a?.time??0)-(b?.time??0)) as Array<{time:number;title:string;detail:string;kind:string;turn:number|null}>;
  const totalBuilds=builds.reduce((sum,x)=>sum+x.count,0);
  const formatPct=(n:number)=>`${Math.round(n)} %`;
  const insights=buildCoachInsights(playerActions,apiResult.durationSeconds ?? 0);
  return <section id="analyse" className="coach-workspace review-v2">
    <div className="review-topline"><div><div className="eyebrow">MATCH CENTER / PARTIEÜBERSICHT</div><h2>{apiResult.mapName}</h2><p>{apiResult.gameMode} <span>·</span> {apiResult.gameType} <span>·</span> {clock(apiResult.durationSeconds ?? 0)} <span>·</span> Match-ID {apiResult.gameId}</p></div><div className="review-actions"><button className="secondary" onClick={onExport}><DownloadCloud size={16}/> CSV exportieren</button><button className="secondary" onClick={onSaveReplayJson}><FileUp size={16}/> Replay-JSON speichern</button><button className="primary" onClick={onOpenReplay}><Gamepad2 size={17}/> Replay öffnen</button></div></div>
    <div className="player-scope-bar"><div><b>Wessen Spielverlauf soll gecoacht werden?</b><small>{selectedPlayerName(players,selectedClientId) ? `Persönliche Analyse für ${selectedPlayerName(players,selectedClientId)}. Fremde Spieleraktionen sind ausgeschlossen.` : 'Die Aktionsliste enthält Befehle aller Spieler. Für persönliche Empfehlungen muss zuerst dein Spieler ausgewählt werden.'}</small></div><select aria-label="Spieler für Coaching auswählen" value={selectedClientId} onChange={e=>setSelectedClientId(e.target.value)}><option value="">Spieler auswählen …</option>{players.filter(p=>p.clientID).map(p=><option key={p.clientID!} value={p.clientID!}>{p.name}</option>)}</select></div>
    {!playerScoped && <div className="player-scope-empty"><b>Persönliche Analyse noch nicht gestartet</b><p>Wähle deinen Namen aus der Liste. Danach beziehen sich Zeitpunkte, Angriffe, Bootsaktionen und Bauentscheidungen ausschließlich auf diesen Spieler – nicht auf die gesamte Lobby.</p></div>}
    <nav className="review-tabs" aria-label="Analysebereiche">{([{id:"overview",label:"Übersicht"},{id:"decisions",label:"Coaching"},{id:"economy",label:"Wirtschaft & Bau"},{id:"military",label:"Militär & Marine"},{id:"timeline",label:"Zeitpunkte"}] as const).map(tab=><button type="button" key={tab.id} className={analysisTab===tab.id?"selected":""} aria-pressed={analysisTab===tab.id} onClick={()=>setAnalysisTab(tab.id)}>{tab.label}</button>)}</nav>
    {playerScoped && analysisTab==='decisions' && <section id="match-coach-insights" className="coach-insights-section">
      <div className="overview-heading"><div><span className="eyebrow">01 / DEIN SPIELBERICHT</span><h3>Die wichtigsten Erkenntnisse</h3><p>Nach Priorität sortiert. Jede Karte nennt deine Entscheidung, einen konkreten nächsten Prüf- bzw. Handlungsansatz und die Beleggrenze. Zeiten sind Befehlszeitpunkte; Bootszeit = Startbefehl, nicht Ankunft.</p></div></div>
      <div className="coach-engine-status" role="status">
        <div className="coach-engine-status-title"><b>Engine-Simulation noch nicht aktiv</b><span>Aktionsprotokoll-Modus</span></div>
        <p>Diese Partie wurde in dieser Version noch nicht mit der OpenFront-Engine rekonstruiert. Deshalb kann der Coach aktuell weder tatsächliche Gebietsgewinne noch Truppenverluste, Goldverläufe oder alternative Spielzüge verlässlich bewerten. Die angezeigten Zeitpunkte sind protokollierte Befehlszeitpunkte.</p>
      </div>
      <div className="coach-report-summary">
        <div><span className="coach-report-label">ZUERST ANSEHEN</span><b>{insights.find(x=>x.kind==='review')?.title ?? 'Keine kritischen Prüfpunkte erkannt'}</b><p>{insights.find(x=>x.kind==='review')?.nextStep ?? 'Für diese Partie liegen keine ausreichend belegten Hinweise vor.'}</p></div>
        <div><span className="coach-report-label">WAS SICHER FESTSTEHT</span><b>{fmt(scopedAnalysis.totalActions)} protokollierte Aktionen</b><p>{fmt(scopedAnalysis.attackCount)} Angriffe · {fmt(scopedAnalysis.boatCount)} Bootsaktionen · {fmt(totalBuilds)} Bauaktionen</p></div>
      </div>
      <div className="coach-report-list">
        {[...insights].filter(x=>x.seconds!==null).sort((a,b)=>(b.priority??0)-(a.priority??0)).map((item,i)=><article className={`coach-report-row insight-${item.kind}`} key={item.id}>
          <div className="coach-report-time"><b>{clock(item.seconds??0)}</b><small>{item.kind==='strength'?'GUT GEMACHT':item.kind==='review'?'PRÜFEN':'BEOBACHTUNG'}</small></div>
          <div className="coach-report-body"><h4>{item.title}</h4><p>{item.summary}</p><div className="coach-report-evidence"><b>Beleg:</b> {item.evidence}</div><p><b>Warum wichtig:</b> {item.why}</p><div className="coach-report-action"><b>Was du daraus lernen kannst</b><span>{item.nextStep}</span></div><div className="coach-report-action"><b>Konkrete Alternative / nächster Entscheidungscheck</b><span>{item.alternative ?? item.nextStep}</span></div><div className="coach-report-evidence"><b>Grenze der Aussage:</b> {item.limitation ?? "Der Aktionsdatensatz belegt den Befehl, nicht automatisch dessen Ergebnis."}</div></div>
        </article>)}
      </div>
      <div className="coach-report-limit"><b>Was noch nicht seriös bewertet werden kann</b><p>Ob ein Angriff erfolgreich war, wie viele Truppen verloren gingen oder ob ein Bau optimal war, erfordert den rekonstruierten Karten-, Gold- und Truppenstand. Diese Analyse erfindet dafür keine Ergebnisse.</p></div>
    </section>}
    {playerScoped && analysisTab==='overview' && <section id="match-overview" className="overview-block">
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
    {playerScoped && (analysisTab==='economy'||analysisTab==='military') && <><div className="overview-heading section-spaced"><div><span className="eyebrow">03 / DEINE SPIELWEISE</span><h3>Wirtschaft, Militär und Marine</h3></div><span className="unit-note">Beobachtete Aktionen – keine Erfolgswertung</span></div>
    <div className="domain-grid">
      {analysisTab==='economy' && <article id="match-economy" className="domain-panel"><div className="domain-icon economy-icon"><Building2 size={20}/></div><div className="domain-title"><div><span className="eyebrow">WIRTSCHAFT & BAU</span><h4>Deine Bauentscheidungen</h4></div><b>{fmt(totalBuilds)}</b></div><p className="domain-subtitle">Protokollierte Bauaktionen nach Typ</p><div className="build-list">{builds.slice().sort((a,b)=>b.count-a.count).map(x=><div className="build-row" key={x.unit}><span>{x.unit}</span><div className="build-track"><div style={{width:`${x.count/Math.max(1,...builds.map(v=>v.count))*100}%`}}/></div><b>{fmt(x.count)}</b></div>)}</div><div className="domain-footnote"><b>Was sich daraus lesen lässt</b><p>Welche Gebäude du wie oft gebaut hast. Ob die Reihenfolge wirtschaftlich optimal war, lässt sich ohne Gold- und Produktionsstände nicht beurteilen.</p></div></article>}
      {analysisTab==='military' && <article id="match-military" className="domain-panel"><div className="domain-icon military-icon"><ShieldCheck size={20}/></div><div className="domain-title"><div><span className="eyebrow">MILITÄR & MARINE</span><h4>Deine offensiven Aktionen</h4></div><b>{fmt(scopedAnalysis.attackCount+scopedAnalysis.boatCount)}</b></div><div className="military-split"><div><span>Angriffsbefehle</span><b>{fmt(scopedAnalysis.attackCount)}</b><small>{firstAttack ? `Erster Angriff ${clock(firstAttack.seconds)}` : 'Kein Angriff protokolliert'}</small></div><div><span>Bootstransporte</span><b>{fmt(scopedAnalysis.boatCount)}</b><small>Protokollierte Transportaktionen</small></div></div><div className="military-builds"><div><span>Warships gebaut</span><b>{fmt(warships)}</b></div><div><span>Ports gebaut</span><b>{fmt(ports)}</b></div></div><div className="domain-footnote"><b>Was noch nicht bewertet werden kann</b><p>Treffer, eroberte Gebiete, Verluste und Kosten. Dafür müssen Karten- und Truppenstände vor und nach jeder Aktion rekonstruiert werden.</p></div></article>}
    </div></>}
    {playerScoped && analysisTab==='timeline' && <section id="match-timeline" className="overview-panel timeline-panel"><div className="overview-panel-title"><div><span className="eyebrow">04 / WICHTIGE ZEITPUNKTE</span><h4>Hier lohnt sich ein genauer Blick</h4><p>Automatisch aus dem Protokoll ermittelte Ereignisse – keine nachträgliche Bewertung.</p></div><button className="secondary compact-button" onClick={onOpenReplay}>Im Replay ansehen <ArrowRight size={15}/></button></div>
      {timeline.length ? <div className="event-timeline">{timeline.map((event,i)=><div className="event-item" key={`${event.kind}-${i}`}><div className="event-marker"><span>{String(i+1).padStart(2,'0')}</span></div><div className="event-copy"><div><b>{event.title}</b><span className="event-type">{event.kind}</span></div><p>{event.detail}</p></div><time>{clock(event.time)}</time></div>)}</div> : <p className="empty-note">Keine markierbaren Ereignisse im Protokoll gefunden.</p>}
    </section>}

    <details className="technical-details"><summary>Technische Rohdaten und vollständige Aktionsliste <ChevronDown size={16}/></summary><div className="details-grid">{Object.entries(scopedAnalysis.categoryCounts).map(([k,v])=><Detail key={k} label={k} value={fmt(v)}/>)}</div><h3>Alle Bauaktionen</h3><div className="details-grid">{builds.map(x=><Detail key={x.unit} label={x.unit} value={fmt(x.count)}/>)}</div><div className="action-list">{playerActions.slice(0,200).map((a,i)=><div className="check-row" key={`${a.turn}-${i}`}><div><b>{a.label}</b><small>Spielzug {a.turn} · {clock(a.seconds)} · {a.details}</small></div><span className="pill blue">{a.category}</span></div>)}</div>{playerActions.length>200&&<p className="muted">Die Anzeige zeigt 200 von {fmt(playerActions.length)} Aktionen. Der CSV-Export enthält alle Aktionen.</p>}</details>
  </section>;
}

function flattenStats(value:Record<string,unknown>,prefix=''):Array<[string,string]>{const out:Array<[string,string]>=[];for(const [key,v] of Object.entries(value)){const name=prefix?`${prefix}.${key}`:key;if(Array.isArray(v))out.push([name,v.map(x=>String(x)).join(' / ')]);else if(v&&typeof v==='object')out.push(...flattenStats(v as Record<string,unknown>,name));else if(v!==null&&v!==undefined)out.push([name,String(v)]);}return out;}
function clock(seconds:number){const s=Math.max(0,Math.round(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) { return <div className="metric"><div className="metric-icon">{icon}</div><small>{label}</small><b>{value}</b></div>; }
function Detail({label,value}:{label:string;value:string}) { return <div className="detail"><small>{label}</small><b>{value}</b></div>; }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
