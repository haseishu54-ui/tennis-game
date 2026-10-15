import { type TennisWorld, type MatchKind, clamp } from './perspectivePhysics.ts';

export function validWorld(value:unknown):value is TennisWorld {
  if(!value||typeof value!=='object')return false;
  const w=value as TennisWorld;
  const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e6;
  return ['ready','toss','rally','point','finished'].includes(w.phase)
    &&Array.isArray(w.players)&&w.players.length===4
    &&w.players.every(p=>p&&['x','z','vx','vz','energy','swing','cool','toss','moving'].every(k=>finite(p[k as keyof typeof p])))
    &&!!w.ball&&['x','y','z','vx','vy','vz','sideSpin','topSpin','bounces','lastTeam'].every(k=>finite(w.ball[k as keyof typeof w.ball]))
    &&Array.isArray(w.score)&&w.score.length===2&&w.score.every(finite)
    &&[w.timer,w.seq,w.server,w.serveTeam,w.rally,w.best,w.winner].every(finite)
    &&Number.isInteger(w.server)&&w.server>=0&&w.server<4
    &&typeof w.message==='string'&&typeof w.lastShot==='string';
}
export function cloneWorld(w:TennisWorld):TennisWorld {
  return {...w,score:[...w.score],players:w.players.map(p=>({...p})),ball:{...w.ball}};
}
/** Render-only smoothing. Scoring and collision always use the host's world. */
export function smoothWorld(previous:TennisWorld|undefined,next:TennisWorld,dt:number,seat:number,age:number):TennisWorld {
  if(!previous||previous.phase!==next.phase||previous.seq!==next.seq)return cloneWorld(next);
  const out=cloneWorld(next),alpha=1-Math.exp(-24*dt);
  for(let i=0;i<4;i++){
    if(i===seat)continue;
    out.players[i].x=previous.players[i].x+(next.players[i].x-previous.players[i].x)*alpha;
    out.players[i].z=previous.players[i].z+(next.players[i].z-previous.players[i].z)*alpha;
  }
  if(next.phase==='rally'&&previous.ball.lastTeam===next.ball.lastTeam){
    const ahead=clamp(age/1000,0,.07);
    for(const [axis,velocity] of [['x','vx'],['y','vy'],['z','vz']] as const){
      const target=next.ball[axis]+next.ball[velocity]*ahead;
      out.ball[axis]=previous.ball[axis]+(target-previous.ball[axis])*alpha;
    }
    out.ball.y=Math.max(.1,out.ball.y);
  }
  return out;
}
export const wireKind=(mode:MatchKind)=>mode==='online-single'?'3d-singles':'3d-doubles';
