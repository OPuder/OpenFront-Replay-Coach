import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowUpRight, Crosshair, Map as MapIcon, Play, ShieldAlert, Swords } from 'lucide-react';
import type { ReplayStateSample } from './ReplaySimulation';
import { decodeTileOwners, selectTerritorySample, tileCoordinates } from './ReplayTerritory';
import './ReplayVisualization.css';

export type ReplayVisualizationEvent = {
  id: string;
  title: string;
  kind: string;
  detail: string;
  time: number;
  isCoach: boolean;
};

type Props = {
  mapName: string;
  mapPreview?: string | null;
  durationSeconds: number;
  events: ReplayVisualizationEvent[];
  samples: ReplayStateSample[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onOpenReplay: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
};
const playerColor = (id: number, players: ReplayStateSample['players']) =>
  players.find(player => player.id === id)?.color ?? `hsl(${(id * 137.508) % 360} 68% 58%)`;

export function ReplayVisualization({
  mapName, mapPreview, durationSeconds, events, samples, selectedEventId, onSelectEvent, onOpenReplay,
}: Props) {
  const selected = events.find(event => event.id === selectedEventId) ?? events[0] ?? null;
  const duration = Math.max(1, durationSeconds);
  const currentTime = selected ? clamp(selected.time, 0, duration) : 0;
  const sample = useMemo(() => selectTerritorySample(samples, currentTime), [samples, currentTime]);
  const territoryCanvas = useRef<HTMLCanvasElement>(null);
  const territory = sample?.territory ?? null;
  const previousSample = sample ? samples.reduce<ReplayStateSample | null>((previous, candidate) =>
    candidate.territory && candidate.tick < sample.tick && (!previous || candidate.tick > previous.tick) ? candidate : previous, null) : null;
  const changedTerritoryTiles = useMemo(() => {
    if (!territory || !previousSample?.territory ||
        territory.width !== previousSample.territory.width || territory.height !== previousSample.territory.height) return null;
    const currentOwners = decodeTileOwners(territory);
    const previousOwners = decodeTileOwners(previousSample.territory);
    if (!currentOwners || !previousOwners || currentOwners.length !== previousOwners.length) return null;
    let changed = 0;
    for (let index = 0; index < currentOwners.length; index++) if (currentOwners[index] !== previousOwners[index]) changed++;
    return changed;
  }, [territory, previousSample?.territory]);
  useEffect(() => {
    const canvas = territoryCanvas.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !territory) return;
    canvas.width = territory.width;
    canvas.height = territory.height;
    const owners = decodeTileOwners(territory);
    if (!owners) return;
    const image = context.createImageData(territory.width, territory.height);
    for (let tile = 0; tile < owners.length; tile++) {
      const owner = owners[tile];
      if (!owner) continue;
      const color = playerColor(owner, sample?.players ?? []);
      let red = 0, green = 0, blue = 0;
      if (color.startsWith('#')) {
        red = parseInt(color.slice(1, 3), 16);
        green = parseInt(color.slice(3, 5), 16);
        blue = parseInt(color.slice(5, 7), 16);
      } else {
        const hue = Number(color.match(/[0-9.]+/)?.[0] ?? 0) / 60;
        const chroma = .68 * .58;
        const x = chroma * (1 - Math.abs(hue % 2 - 1));
        const rgb = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
        const match = .58 - chroma / 2;
        [red, green, blue] = rgb.map(value => Math.round((value + match) * 255));
      }
      const pixel = tile * 4;
      image.data[pixel] = red;
      image.data[pixel + 1] = green;
      image.data[pixel + 2] = blue;
      image.data[pixel + 3] = 150;
    }
    context.putImageData(image, 0, 0);
  }, [territory, sample?.players]);

  const movements = sample?.unitMovements ?? [];
  const playerNames = new Map((sample?.players ?? []).map(player => [player.id, player.name]));
  const attackLinks = (sample?.players ?? []).flatMap(player => player.outgoingAttackDetails.map(attack => ({
    id: player.id + ':' + attack.id,
    attacker: player.name,
    target: playerNames.get(attack.targetID) ?? `Spieler ${attack.targetID}`,
    troops: attack.troops,
    retreating: attack.retreating,
  })));
  const phases = [
    { label: 'EARLY', start: 0, end: .3, note: 'Start & Expansion', tone: 'early' },
    { label: 'MID', start: .3, end: .7, note: 'Fronten & Druck', tone: 'mid' },
    { label: 'LATE', start: .7, end: 1, note: 'Entscheidung', tone: 'late' },
  ];

  return <section className="replay-viz" aria-label="Interaktive Replay-Übersicht">
    <div className="replay-viz-top">
      <div><span className="studio-eyebrow">TACTICAL OVERVIEW</span><h3>Schlachtfeld & Zeitachse</h3><p>Territorien und Einheitenziele stammen aus dem rekonstruierten Original-Engine-Zustand.</p></div>
      <div className="replay-viz-status"><span className="replay-viz-live-dot"/>{events.length} Ereignisse · {formatTime(durationSeconds)} Gesamt</div>
    </div>
    <div className="replay-viz-grid">
      <div className="replay-viz-map">
        <div className="replay-viz-map-head"><span><MapIcon size={14}/> {mapName || 'Unbekannte Karte'}</span><span>{sample ? `Engine-Frame ${sample.frame}` : 'Kein Engine-Snapshot'}</span></div>
        <div className="replay-viz-map-canvas" style={{aspectRatio: territory ? `${territory.width} / ${territory.height}` : '16 / 9'}}>
          {mapPreview && <img src={mapPreview} alt={`Kartenbasis ${mapName}`} loading="lazy"/>}
          {territory && <canvas ref={territoryCanvas} className="replay-viz-territory" aria-label="Territoriumsbesitz aus Replay-Engine-Snapshot"/>}
          {territory && <svg className="replay-viz-movements" viewBox={`0 0 ${territory.width} ${territory.height}`} preserveAspectRatio="none" aria-label="Aktive Einheitenziele aus Replay-Engine-Frame">
            <defs><marker id="replay-viz-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="#fff2a8"/></marker></defs>
            {movements.slice(0, 180).map((movement,index)=>{
              const from=tileCoordinates(movement.fromTile,territory.width,territory.height), target=tileCoordinates(movement.targetTile,territory.width,territory.height);
              if(!from||!target)return null;
              const x1=from.x, y1=from.y, x2=target.x, y2=target.y;
              return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={playerColor(movement.ownerID,sample?.players??[])} strokeWidth={Math.max(.7,territory.width/700)} opacity=".88" markerEnd="url(#replay-viz-arrow)"><title>{`${playerNames.get(movement.ownerID)??'Spieler'} · ${movement.unitType} · ${movement.troops} Truppen`}</title></line>;
            })}
          </svg>}
          {!territory && <div className="replay-viz-map-label"><MapIcon size={24}/><b>Kein Territoriums-Snapshot verfügbar</b><small>{samples.length ? 'Für diesen Zeitpunkt ist kein passender Engine-Zustand gespeichert.' : 'Die Partie wurde noch nicht mit der Original-Engine rekonstruiert.'}</small></div>}
          {territory && <div className="replay-viz-map-overlay"><span><Crosshair size={12}/> TERRITORIUM · {territory.width}×{territory.height}</span><b>{formatTime(currentTime)}</b></div>}
        </div>
        <div className="replay-viz-map-note"><ShieldAlert size={13}/>{territory ? <>Besitzfarben: Replay-TileState (Owner-ID). Pfeile: aktive Einheiten mit explizitem Engine-Ziel.{changedTerritoryTiles !== null && <b className="replay-viz-front-change">{changedTerritoryTiles.toLocaleString('de-DE')} Tiles mit Besitzerwechsel seit letztem Snapshot</b>}</> : 'Besitzstände und Bewegungen werden nur bei vorhandenem Engine-Snapshot angezeigt.'}</div>
        {sample && <div className="replay-viz-legend" aria-label="Spielerlegende">{sample.players.filter(player=>player.tiles>0).sort((a,b)=>b.tiles-a.tiles).slice(0,8).map(player=><span key={player.id}><i style={{background:playerColor(player.id,sample.players)}}/><b>{player.name}</b><small>{player.tiles.toLocaleString('de-DE')} Tiles</small></span>)}</div>}
      </div>
      <div className="replay-viz-focus">
        <div className="replay-viz-focus-head"><span>SELECTED MOMENT</span><b>{selected ? formatTime(selected.time) : '—'}</b></div>
        {selected ? <>
          <span className={`replay-viz-event-tag ${selected.isCoach ? 'coach' : 'event'}`}>{selected.isCoach ? <Swords size={12}/> : <Crosshair size={12}/>} {selected.isCoach ? 'COACH INSIGHT' : selected.kind}</span>
          <h4>{selected.title}</h4><p>{selected.detail}</p>
          <div className="replay-viz-focus-foot"><small>{selected.isCoach ? 'Mit Replay-Zeitpunkt verknüpft' : 'Protokolliertes Replay-Ereignis'}</small><button type="button" onClick={onOpenReplay}>Original-Replay öffnen <ArrowUpRight size={14}/></button></div>
        </> : <div className="replay-viz-no-event"><Crosshair size={22}/><b>Noch keine Ereignisse markiert</b><small>Für diese Partie enthält die Timeline keine verwertbaren Marker.</small></div>}
        <div className="replay-viz-engagements"><b>Aktive Angriffe · Engine-State</b>{attackLinks.length ? attackLinks.slice(0,8).map(link=><span key={link.id}><Swords size={12}/>{link.attacker} → {link.target}<small>{link.troops.toLocaleString('de-DE')} Truppen{link.retreating?' · Rückzug':''}</small></span>) : <small>Keine aktiven Angriffsbeziehungen in diesem Snapshot.</small>}</div>
        {movements.length>0 && <small className="replay-viz-movement-count">{movements.length} aktive Einheitenziele im ausgewählten Snapshot</small>}
      </div>
    </div>
    <div className="replay-viz-timeline">
      <div className="replay-viz-timeline-head"><div><span className="studio-eyebrow">MATCH FLOW</span><b>Spielphasen & Ereignisse</b></div><span>{selected ? formatTime(currentTime) : 'Noch kein Moment gewählt'}</span></div>
      <div className="replay-viz-phase-track" aria-label="Spielphasen: Early, Mid und Late Game">
        {phases.map(phase=><div key={phase.label} className={`replay-viz-phase ${phase.tone}`} style={{width:`${(phase.end-phase.start)*100}%`}}><b>{phase.label}</b><small>{phase.note}</small></div>)}
        <div className="replay-viz-playhead" style={{left:`${currentTime/duration*100}%`}} aria-hidden="true"/>
      </div>
      <div className="replay-viz-event-track" role="group" aria-label="Replay-Ereignisse auswählen">
        {events.map((event,index)=>{
          const position=clamp(event.time/duration*100,0,100), active=selected?.id===event.id;
          return <button key={event.id} type="button" className={`replay-viz-marker ${event.isCoach?'coach':''} ${active?'active':''}`} style={{left:`${position}%`}} onClick={()=>onSelectEvent(event.id)} aria-label={`${formatTime(event.time)}: ${event.title}`} aria-pressed={active} title={`${formatTime(event.time)} · ${event.title}`}><span>{index+1}</span></button>;
        })}
      </div>
      <div className="replay-viz-timeline-footer"><span>00:00 · START</span><span className="replay-viz-seek-note">Auswahl aktualisiert Karte & Coaching-Kontext. Der externe OpenFront-Viewer bietet keine Seek-Schnittstelle.</span><span>{formatTime(durationSeconds)} · ENDE</span></div>
      {!events.length && <p className="replay-viz-empty">Noch keine Timeline-Ereignisse vorhanden. Es werden keine Marker aus geschätzten oder fehlenden Daten erzeugt.</p>}
    </div>
  </section>;
}
