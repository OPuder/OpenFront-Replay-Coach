import React from 'react';
import { ArrowUpRight, Crosshair, Map as MapIcon, Play, ShieldAlert, Swords } from 'lucide-react';
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
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onOpenReplay: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
};

export function ReplayVisualization({
  mapName, mapPreview, durationSeconds, events, selectedEventId, onSelectEvent, onOpenReplay,
}: Props) {
  const selected = events.find(event => event.id === selectedEventId) ?? events[0] ?? null;
  const duration = Math.max(1, durationSeconds);
  const currentTime = selected ? clamp(selected.time, 0, duration) : 0;
  const phases = [
    { label: 'EARLY', start: 0, end: .3, note: 'Start & Expansion', tone: 'early' },
    { label: 'MID', start: .3, end: .7, note: 'Fronten & Druck', tone: 'mid' },
    { label: 'LATE', start: .7, end: 1, note: 'Entscheidung', tone: 'late' },
  ];

  return <section className="replay-viz" aria-label="Interaktive Replay-Übersicht">
    <div className="replay-viz-top">
      <div><span className="studio-eyebrow">TACTICAL OVERVIEW</span><h3>Schlachtfeld & Zeitachse</h3><p>Wähle einen belegten Moment, um Kontext und Coaching-Hinweise direkt daneben zu sehen.</p></div>
      <div className="replay-viz-status"><span className="replay-viz-live-dot"/>{events.length} Ereignisse · {formatTime(durationSeconds)} Gesamt</div>
    </div>
    <div className="replay-viz-grid">
      <div className="replay-viz-map">
        <div className="replay-viz-map-head"><span><MapIcon size={14}/> {mapName || 'Unbekannte Karte'}</span><span>Replay-Referenz</span></div>
        <div className="replay-viz-map-canvas">
          {mapPreview ? <img src={mapPreview} alt={`Vorschau der Karte ${mapName}`} loading="lazy"/> : <div className="replay-viz-map-placeholder"><div className="replay-viz-continent continent-a"/><div className="replay-viz-continent continent-b"/><div className="replay-viz-map-label"><MapIcon size={24}/><b>Keine Karten-Vorschau verfügbar</b><small>Die Karte wird nicht künstlich rekonstruiert.</small></div></div>}
          <div className="replay-viz-map-overlay"><span><Crosshair size={12}/> MAP PREVIEW</span><b>{mapName || 'OpenFront Map'}</b></div>
        </div>
        <div className="replay-viz-map-note"><ShieldAlert size={13}/> Die Vorschau zeigt das Kartenbild, keine erfundenen Besitzstände oder Angriffsvektoren.</div>
      </div>
      <div className="replay-viz-focus">
        <div className="replay-viz-focus-head"><span>SELECTED MOMENT</span><b>{selected ? formatTime(selected.time) : '—'}</b></div>
        {selected ? <>
          <span className={`replay-viz-event-tag ${selected.isCoach ? 'coach' : 'event'}`}>{selected.isCoach ? <Swords size={12}/> : <Crosshair size={12}/>} {selected.isCoach ? 'COACH INSIGHT' : selected.kind}</span>
          <h4>{selected.title}</h4>
          <p>{selected.detail}</p>
          <div className="replay-viz-focus-foot"><small>{selected.isCoach ? 'Priorisierter Coaching-Moment' : 'Protokolliertes Replay-Ereignis'}</small><button type="button" onClick={onOpenReplay}>Original-Replay <ArrowUpRight size={14}/></button></div>
        </> : <div className="replay-viz-no-event"><Crosshair size={22}/><b>Noch keine Ereignisse markiert</b><small>Für diese Partie enthält die Timeline keine verwertbaren Marker.</small></div>}
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
          const position=clamp(event.time/duration*100,0,100);
          const active=selected?.id===event.id;
          return <button key={event.id} type="button" className={`replay-viz-marker ${event.isCoach?'coach':''} ${active?'active':''}`} style={{left:`${position}%`}} onClick={()=>onSelectEvent(event.id)} aria-label={`${formatTime(event.time)}: ${event.title}`} aria-pressed={active} title={`${formatTime(event.time)} · ${event.title}`}><span>{index+1}</span></button>;
        })}
      </div>
      <div className="replay-viz-timeline-footer"><span>00:00 · START</span><button type="button" className="replay-viz-open" onClick={onOpenReplay}><Play size={13}/> Im Original-Viewer öffnen</button><span>{formatTime(durationSeconds)} · ENDE</span></div>
      {!events.length && <p className="replay-viz-empty">Noch keine Timeline-Ereignisse vorhanden. Es werden keine Marker aus geschätzten oder fehlenden Daten erzeugt.</p>}
    </div>
  </section>;
}
