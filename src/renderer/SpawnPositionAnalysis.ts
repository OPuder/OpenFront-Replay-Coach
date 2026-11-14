export interface SpawnPlayerRef { id:number; clientID:string|null; name:string }
export interface SpawnPositionMetric { id:number; clientID:string|null; name:string; startTiles:number; centerX:number; centerY:number; adjacentRivals:number[]; rivalBorderContacts:number; nearestRivalDistance:number|null; classification:"isolated"|"contested"|"mixed"|"unknown" }

/** Uses the actual owner grid from the first replay frame; no terrain is inferred. */
export function analyzeSpawnPositions(tileState:Uint16Array,width:number,height:number,players:readonly SpawnPlayerRef[]):SpawnPositionMetric[]{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||tileState.length!==width*height)return [];
 const ownerMask=0x0fff;
 const stats=new Map<number,{count:number;x:number;y:number;adjacent:Set<number>;contacts:number}>();
 for(const player of players)stats.set(player.id,{count:0,x:0,y:0,adjacent:new Set(),contacts:0});
 for(let ref=0;ref<tileState.length;ref++){
  const owner=tileState[ref]&ownerMask;const stat=stats.get(owner);if(!owner||!stat)continue;
  const x=ref%width,y=Math.floor(ref/width);stat.count++;stat.x+=x;stat.y+=y;
  const neighbors=[y>0?ref-width:-1,y+1<height?ref+width:-1,x>0?ref-1:-1,x+1<width?ref+1:-1];
  for(const next of neighbors){if(next<0)continue;const other=tileState[next]&ownerMask;if(other&&other!==owner&&stats.has(other)){stat.adjacent.add(other);stat.contacts++;}}
 }
 const centers=new Map<number,{x:number;y:number}>();
 for(const [id,s] of stats)if(s.count)centers.set(id,{x:s.x/s.count,y:s.y/s.count});
 const raw=players.map(player=>{
  const s=stats.get(player.id)!;const center=centers.get(player.id);if(!center||!s.count)return {player,s,center:null as null|{x:number;y:number},nearest:null as number|null};
  const distances=players.filter(other=>other.id!==player.id&&other.clientID!==null&&centers.has(other.id)).map(other=>{const c=centers.get(other.id)!;return Math.hypot(center.x-c.x,center.y-c.y);});
  return {player,s,center,nearest:distances.length?Math.min(...distances):null};
 });
 const humanNearest=raw.filter(x=>x.player.clientID!==null&&x.nearest!==null).map(x=>x.nearest as number).sort((a,b)=>a-b);
 const median=humanNearest.length?humanNearest[Math.floor(humanNearest.length/2)]:null;
 return raw.map(({player,s,center,nearest})=>({id:player.id,clientID:player.clientID,name:player.name,startTiles:s.count,centerX:center?Number(center.x.toFixed(1)):0,centerY:center?Number(center.y.toFixed(1)):0,adjacentRivals:[...s.adjacent],rivalBorderContacts:s.contacts,nearestRivalDistance:nearest===null?null:Number(nearest.toFixed(1)),classification:!center||nearest===null?"unknown":s.adjacent.size>0&&median!==null&&nearest<=median?"contested":s.adjacent.size===0&&median!==null&&nearest>median?"isolated":"mixed"}));
}
