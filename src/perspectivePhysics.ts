/** World-space tennis simulation. X = court width, Z = length, Y = height (metres).
 * Runs with a fixed timestep. No DOM/Three.js dependency, so physics is independently testable. */
export type Side = 0 | 1;
export type GamePhase = 'ready'|'toss'|'rally'|'point'|'finished';
export type MatchKind = 'single'|'practice'|'boss'|'online';
export type ShotKind = 'serve'|'flat'|'topspin'|'slice'|'lob'|'smash';
export type MoveInput = { left:boolean;right:boolean;up:boolean;down:boolean;dash:boolean;hit:boolean;lob:boolean;smash:boolean;serve:boolean };
export const NO_INPUT:MoveInput={left:false,right:false,up:false,down:false,dash:false,hit:false,lob:false,smash:false,serve:false};
export type Athlete={x:number;z:number;vx:number;vz:number;energy:number;swing:number;cool:number;toss:number;moving:number};
export type ShotBall={x:number;y:number;z:number;vx:number;vy:number;vz:number;sideSpin:number;topSpin:number;lastTeam:Side;bounces:number;live:boolean;power:boolean;kind:ShotKind};
export type TennisWorld={phase:GamePhase;mode:MatchKind;players:Athlete[];ball:ShotBall;score:[number,number];serveTeam:Side;server:number;timer:number;winner:number;rally:number;best:number;message:string;seq:number;faults:number;lastShot:string};
export const HALF_WIDTH=5.49;
export const HALF_LENGTH=11.885;
export const SERVICE_LINE=6.4;
export const NET_HEIGHT=.914;
export const GRAVITY=12.3;
export const SPAWN=[{x:-2.1,z:9.9},{x:2.1,z:-9.9},{x:2.1,z:5.6},{x:-2.1,z:-5.6}];
export const teamOf=(seat:number):Side=>(seat%2) as Side;
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const makePlayer=(i:number):Athlete=>({...SPAWN[i],vx:0,vz:0,energy:100,swing:0,cool:0,toss:0,moving:0});
const freshBall=(side:Side,players:Athlete[],server:number):ShotBall=>({
 x:players[server].x+.38,y:1.10,z:players[server].z,vx:0,vy:0,vz:0,sideSpin:0,topSpin:0,lastTeam:side,bounces:0,live:false,power:false,kind:'serve'
});
export function makeWorld(mode:MatchKind='single'):TennisWorld {
 const players=[0,1,2,3].map(makePlayer);
 return {phase:'ready',mode,players,ball:freshBall(0,players,0),score:[0,0],serveTeam:0,server:0,timer:0,winner:-1,rally:0,best:0,message:'サーブの準備！トスしてからスイング',seq:0,faults:0,lastShot:'サーブ'};
}
export function resetPoint(w:TennisWorld) {
 w.players.forEach((p,i)=>Object.assign(p,makePlayer(i)));
 const side=w.serveTeam;
 w.server=side===0?0:1;
 w.ball=freshBall(side,w.players,w.server);
 w.phase='ready';w.faults=0;w.timer=0;w.rally=0;
 w.message=`${side===0?'レッド':'ブルー'}のサーブ：トス → スイング`;
 w.seq++;
}
export function awardPoint(w:TennisWorld,team:Side,why:string) {
 if(w.phase==='point'||w.phase==='finished')return;
 w.score[team]++;w.best=Math.max(w.best,w.rally);
 w.message=`${team===0?'レッド':'ブルー'} +1 ／ ${why}`;
 w.serveTeam=team;w.timer=1.8;w.seq++;
 if(w.score[team]>=7&&w.score[team]-w.score[1-team as Side]>=2){w.phase='finished';w.winner=team;}
 else w.phase='point';
}
export function moveAthlete(p:Athlete,i:number,k:MoveInput,dt:number){
 const dx=Number(k.right)-Number(k.left);
 const dz=Number(k.down)-Number(k.up);
 const n=Math.hypot(dx,dz)||1;
 const wantsDash=k.dash && p.energy>4;
 const speed=wantsDash?12:6.5;
 const targetVX=dx/n*speed,targetVZ=dz/n*speed*(teamOf(i)===0?1:-1);
 const smooth=Math.min(1,dt*18);
 p.vx+=(targetVX-p.vx)*smooth;
 p.vz+=(targetVZ-p.vz)*smooth;
 p.x=clamp(p.x+p.vx*dt,-HALF_WIDTH+.35,HALF_WIDTH-.35);
 p.z=clamp(p.z+p.vz*dt,teamOf(i)===0?.6:-HALF_LENGTH+.55,teamOf(i)===0?HALF_LENGTH-.55:-.6);
 p.moving=Math.hypot(p.vx,p.vz)/12;
 p.energy=clamp(p.energy+(wantsDash?-26:15)*dt,0,100);
 p.cool=Math.max(0,p.cool-dt);
 p.swing=Math.max(0,p.swing-dt);
 p.toss=Math.max(0,p.toss-dt);
}
export function tossServe(w:TennisWorld,seat:number){
 if(w.phase!=='ready'||seat!==w.server)return false;
 const p=w.players[seat];
 const b=w.ball=freshBall(w.serveTeam,w.players,seat);
 b.y=1.30;b.x=p.x+.35;b.z=p.z+(w.serveTeam===0?-.12:.12);
 b.vy=5.1;b.vx=0;b.vz=0;b.live=true;
 p.toss=1.2;w.phase='toss';w.timer=0;w.message='トス！ ボールが高いところでスイング';
 return true;
}
function aimFor(w:TennisWorld,i:number,kind:ShotKind){
 const p=w.players[i],side=teamOf(i),opp=side===0?-1:1;
 const foes=w.players.filter((_,idx)=>teamOf(idx)!==side&&(w.mode!=='single'||idx<2));
 const mean=foes.reduce((s,e)=>s+e.x,0)/Math.max(1,foes.length);
 const lateral=clamp(p.vx/12,-1,1);
 // Aim *away* from opponents, with a meaningful running forehand/backhand angle.
 const x=clamp(-mean*.73 + lateral*3.8 + (i%2===0?-.5:.5),-4.65,4.65);
 const z=opp*(kind==='lob'?9.7:kind==='slice'?5.8:kind==='smash'?8.1:kind==='serve'?5.4:8.2);
 return {x,z};
}
export function strike(w:TennisWorld,seat:number,kind:ShotKind='flat') {
 const p=w.players[seat],b=w.ball,side=teamOf(seat);
 if(!p||p.cool>0||w.phase==='point'||w.phase==='finished')return false;
 if(w.phase==='ready')return tossServe(w,seat);
 if(w.phase==='toss'){
   if(seat!==w.server||b.y<1.4||b.y>4.0)return false;
   kind='serve';
 }else if(w.phase==='rally'){
   if(b.lastTeam===side)return false;
   const reach=1.85+Math.min(.62,p.moving*.45);
   if(Math.hypot(b.x-p.x,b.z-p.z)>reach||b.y<.15||b.y>3.18)return false;
 }else return false;
 const target=aimFor(w,seat,kind);
 const distance=Math.hypot(target.x-b.x,target.z-b.z);
 const momentum=clamp((teamOf(seat)===0?-p.vz:p.vz)/12,-1,1);
 const duration=kind==='lob'?1.32:kind==='slice'?.98:kind==='smash'?.54:kind==='serve'?.73:.79;
 // Running into the stroke speeds it up; moving back gives a safer, slower arc.
 const t=clamp(duration - momentum*.085 - Math.min(.07,p.moving*.045),.44,1.6);
 const yStart=Math.max(.70,b.y);
 b.vx=(target.x-b.x)/t;
 b.vz=(target.z-b.z)/t;
 b.vy=(GRAVITY*t*t*.5-yStart)/t;
 // Guarantee ball clears the net by a reasonable margin unless intentionally a smash.
 const netTime=Math.abs(b.z/Math.max(1e-4,b.vz));
 const atNet=yStart+b.vy*netTime-GRAVITY*netTime*netTime*.5;
 if(atNet<NET_HEIGHT+(kind==='smash'?.1:.24)&&netTime<t){b.vy+=(NET_HEIGHT+(kind==='smash'?.1:.24)-atNet)/netTime;}
 // Physically curved sidespin and faster topspin are tied to lateral/forward movement.
 b.sideSpin=clamp(p.vx*.42,-3.4,3.4)*(kind==='slice'?1.3:1);
 b.topSpin=kind==='topspin'?2.3:kind==='slice'?-1.3:kind==='lob'?-0.9:kind==='smash'?1.8:1.0+momentum*.9;
 b.kind=kind;b.lastTeam=side;b.bounces=0;b.live=true;b.power=kind==='smash';
 p.swing=.38;p.cool=kind==='smash'?.48:.27;
 w.phase='rally';w.lastShot=({serve:'サーブ',flat:'フラット',topspin:'トップスピン',slice:'スライス',lob:'ロブ',smash:'スマッシュ'} as Record<ShotKind,string>)[kind];
 if(kind!=='serve'){w.rally++;w.best=Math.max(w.best,w.rally);}
 w.message=`${w.lastShot}！ ${Math.round(distance/t*3.6)} km/h`;
 return true;
}
function stepBall(w:TennisWorld,dt:number){
 const b=w.ball;
 if(!b.live)return;
 if(w.phase==='toss'){
   b.y+=b.vy*dt;b.vy-=GRAVITY*dt;
   if(b.y<=.12){
      // Missed a toss: retry without penalising the server.
      w.phase='ready';w.ball=freshBall(w.serveTeam,w.players,w.server);w.message='トスが落ちました。もう一度トス！';
   }
   return;
 }
 if(w.phase!=='rally')return;
 const oldZ=b.z;
 b.vx+=b.sideSpin*dt;
 b.vy-=(GRAVITY+b.topSpin)*dt;
 b.vz*=Math.max(.93,1-dt*.015);
 b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
 const crossedNet=oldZ*b.z<=0&&oldZ!==b.z;
 if(crossedNet&&b.y<=NET_HEIGHT+.08&&Math.abs(b.x)<HALF_WIDTH+.5){awardPoint(w,(1-b.lastTeam) as Side,'ネット');return;}
 if(b.y>0)return;
 b.y=0;
 if(Math.abs(b.x)>HALF_WIDTH||Math.abs(b.z)>HALF_LENGTH||Math.abs(b.z)<.05){awardPoint(w,b.bounces?b.lastTeam:(1-b.lastTeam) as Side,b.bounces?'返球できず':'アウト');return;}
 const landingSide:Side=b.z>0?0:1;
 if(landingSide===b.lastTeam){awardPoint(w,(1-b.lastTeam) as Side,'自分のコートへ打球');return;}
 if(b.bounces>=1){awardPoint(w,b.lastTeam,'ツーバウンド');return;}
 b.bounces++;
 b.vy=Math.abs(b.vy)*.55;b.vx*=.83;b.vz*=.75;
 w.message='ワンバウンド！ 返球しよう';
}
export function advanceWorld(w:TennisWorld,inputs:MoveInput[],dt:number,botStrength=0){
 dt=clamp(dt,0,1/30);
 if(w.phase==='finished')return;
 const act=w.mode==='single'?2:4;
 for(let i=0;i<act;i++)moveAthlete(w.players[i],i,inputs[i]||NO_INPUT,dt);
 if(w.phase==='point'){
   w.timer-=dt;if(w.timer<=0)resetPoint(w);
   return;
 }
 if(w.phase==='ready'){
   const p=w.players[w.server];
   w.ball.x=p.x+.38;w.ball.y=1.1;w.ball.z=p.z;
 }
 for(let i=0;i<act;i++){
   const k=inputs[i]||NO_INPUT;
   if(k.serve){tossServe(w,i);continue;}
   if(k.hit||k.lob||k.smash){
     let kind:ShotKind=k.smash?'smash':k.lob?'lob':'flat';
     if(kind==='flat'){
       const p=w.players[i];
       if(p.vz*(teamOf(i)===0?-1:1)>2)kind='topspin';
       else if(p.vz*(teamOf(i)===0?-1:1)<-2)kind='slice';
     }
     strike(w,i,kind);
   }
 }
 stepBall(w,dt);
 // In offline mode, smarter CPU players independently track interception points.
 if(botStrength>0&&(w.phase as TennisWorld['phase'])!=='finished'){
   for(let i=1;i<act;i++){
     const p=w.players[i];
     if(w.phase==='ready'&&i===w.server){
       if(w.timer<=0)tossServe(w,i);else w.timer-=dt;
       continue;
     }
     if(w.phase==='toss'&&i===w.server){if(w.ball.y>2.25)strike(w,i,'serve');continue;}
     const side=teamOf(i);
     if(w.phase!=='rally')continue;
     const b=w.ball;
     const myHalf=(side===0?b.z>0:b.z<0);
     const playable=b.lastTeam!==side;
     const velocityToMe=(side===0?b.vz>0:b.vz<0);
     const active=playable&&(myHalf||velocityToMe);
     let tx=SPAWN[i].x,tz=SPAWN[i].z;
     if(active){
       const forward=clamp((Math.abs(p.z-b.z))/Math.max(4,Math.abs(b.vz)),.07,.52);
       tx=clamp(b.x+b.vx*forward,-4.9,4.9);
       tz=clamp(b.z+b.vz*forward,side===0?.9:-11.2,side===0?11.2:-.9);
       if(w.mode!=='single' && i>=2){
         const mate=w.players[i===2?0:1];
         if(Math.abs(mate.x-tx)<1.5)tx=clamp(tx+(tx>mate.x?1.4:-1.4),-4.9,4.9);
       }
     }
     const dx=tx-p.x,dz=tz-p.z;
     const speed=botStrength>=3?10.4:botStrength>=2?8.5:6.0;
     const magnitude=Math.hypot(dx,dz);
     if(magnitude>.05){const step=Math.min(magnitude,speed*dt);p.x=clamp(p.x+dx/magnitude*step,-5.05,5.05);p.z=clamp(p.z+dz/magnitude*step,side===0?.7:-11.2,side===0?11.2:-.7);p.moving=step/(dt*12);}
     if(active&&Math.hypot(b.x-p.x,b.z-p.z)<(botStrength>=3?1.75:1.55)&&b.y>.35&&b.y<2.75&&p.cool<=0){
       strike(w,i,botStrength>=3&&b.y>1.7&&w.rally>3?'smash':w.rally%5===4?'lob':'topspin');
     }
   }
 }
}
