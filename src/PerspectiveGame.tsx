import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import MotionCamera, { type MotionKeys } from './MotionCamera';
import { PerspectiveStage, VIEW_NAMES, type ViewMode } from './PerspectiveStage';
import { advanceWorld, clamp, makeWorld, moveAthlete, NO_INPUT, isOnline, isSingles, type MatchKind, type MoveInput, type TennisWorld } from './perspectivePhysics';
import { cloneWorld, smoothWorld, validWorld, wireKind } from './perspectiveNetwork';
import { cleanInput } from '../shared/tennisProtocol';
import './perspective.css';

const ZERO:MotionKeys={left:false,right:false,up:false,down:false,jump:false,hit:false,lob:false,dash:false};
const VIEWS:ViewMode[]=['follow','overhead','side','ball'];
type Action={key:'hit'|'lob'|'smash'|'serve';aim?:number;power?:number;at:number};
const initialMode=():MatchKind=>new URLSearchParams(location.search).has('room')?(new URLSearchParams(location.search).get('match')==='singles'?'online-single':'online'):'single';
const capacity=(m:MatchKind)=>isSingles(m)?2:4;

export default function PerspectiveGame({onClassic,onLegacyDoubles}:{onClassic:()=>void;onLegacyDoubles:()=>void}){
 const [mode,setMode]=useState<MatchKind>(initialMode),[view,setView]=useState<ViewMode>('follow');
 const [showCamera,setShowCamera]=useState(true),[focus,setFocus]=useState(false),[cameraActive,setCameraActive]=useState(false);
 const [room,setRoom]=useState(()=>new URLSearchParams(location.search).get('room')||'T'+Math.floor(10000+Math.random()*90000));
 const [netStatus,setNetStatus]=useState('off'),[seat,setSeat]=useState(-1),[roster,setRoster]=useState<number[]>([]);
 const [started,setStarted]=useState(false),[notice,setNotice]=useState('カメラ開始で全画面プレイ。両手を上げてトス → 片腕を振ってサーブ。');
 const [ui,setUi]=useState(()=>makeWorld(initialMode())),[rendererError,setRendererError]=useState('');
 const [rtt,setRtt]=useState(0),[networkStale,setNetworkStale]=useState(false),[fps,setFps]=useState(60);
 const workspace=useRef<HTMLDivElement>(null),stageDiv=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const game=useRef(makeWorld(initialMode())),stage=useRef<PerspectiveStage|null>(null);
 const modeRef=useRef(mode),viewRef=useRef(view),seatRef=useRef(-1),startedRef=useRef(false),epoch=useRef(0);
 const pressed=useRef<Record<string,boolean>>({}),touch=useRef<Record<string,boolean>>({});
 const motion=useRef<MotionKeys>(ZERO),motionAt=useRef(0),actions=useRef<Action[]>([]);
 const socket=useRef<WebSocket|null>(null),lastSnapshot=useRef(0),lastInput=useRef(0),receivedAt=useRef(0);
 const remote=useRef<Record<number,{input:MoveInput;at:number;actionId:number}>>({});
 const actionId=useRef(0),renderWorld=useRef<TennisWorld|undefined>(undefined),cameraEvent=useRef(0);
 modeRef.current=mode;viewRef.current=view;
 const publish=()=>setUi(cloneWorld(game.current));
 const reset=(kind:MatchKind)=>{game.current=makeWorld(kind);actions.current=[];remote.current={};renderWorld.current=undefined;publish();};
 const send=(data:object)=>{const s=socket.current;if(s?.readyState===WebSocket.OPEN&&s.bufferedAmount<64000)s.send(JSON.stringify(data));};
 const disconnect=useCallback(()=>{
   const s=socket.current;socket.current=null;s?.close();startedRef.current=false;setStarted(false);
   seatRef.current=-1;setSeat(-1);setRoster([]);setNetStatus('off');remote.current={};
 },[]);
 const chooseMode=(kind:MatchKind)=>{disconnect();modeRef.current=kind;setMode(kind);reset(kind);setNetworkStale(false);};
 const queue=(key:Action['key'],aim?:number,power?:number)=>{
   if(actions.current.length<4)actions.current.push({key,aim,power,at:performance.now()});
 };
 const changeView=useCallback((v:ViewMode)=>{
   setView(v);viewRef.current=v;stage.current?.setView(v);
   if(stageDiv.current)stage.current?.setSize(stageDiv.current.clientWidth,stageDiv.current.clientHeight);
 },[]);
 const connect=()=>{
   disconnect();const roomId=room.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);
   if(!roomId){setNotice('部屋コードを入力してください');return;}
   setRoom(roomId);reset(modeRef.current);setNetStatus('connecting');
   const s=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws?room='+encodeURIComponent(roomId));socket.current=s;
   let ping=0;
   const timeout=window.setTimeout(()=>{if(s.readyState!==WebSocket.OPEN){s.close();}},10000);
   s.onopen=()=>{
     clearTimeout(timeout);if(socket.current!==s)return;
     s.send(JSON.stringify({type:'join',roomId,matchType:wireKind(modeRef.current)}));
     ping=window.setInterval(()=>send({type:'ping',at:performance.now()}),2000);
   };
   s.onmessage=event=>{
     if(socket.current!==s)return;
     try{
       const m=JSON.parse(event.data);
       if(m.type==='error'){disconnect();setNotice(String(m.message));return;}
       if(m.type==='pong'){if(Number.isFinite(m.at))setRtt(Math.round(performance.now()-m.at));return;}
       if(m.type==='joined'||m.type==='player_joined'||m.type==='player_left'){
         if(m.type==='joined'){seatRef.current=m.playerIndex;setSeat(m.playerIndex);}
         setRoster(m.playerIndices||[]);setNetStatus(m.playersCount===capacity(modeRef.current)?'ready':'waiting');
         if(m.type==='player_left'){
           startedRef.current=false;setStarted(false);reset(modeRef.current);
           setNotice('プレイヤーが退出しました。人数が揃ったらホストが再開できます。');
         }else setNotice('接続 '+m.playersCount+'/'+capacity(modeRef.current)+'人。黄色の輪があなたです。');
       }else if(m.type==='t_start'){
         epoch.current=m.epoch;reset(modeRef.current);receivedAt.current=performance.now();
         startedRef.current=true;setStarted(true);setNotice('試合開始！');
       }else if(m.type==='t_reset'){
         startedRef.current=false;setStarted(false);reset(modeRef.current);
       }else if(m.epoch===epoch.current&&m.type==='t_input'&&seatRef.current===0&&startedRef.current){
         const i=Number(m.seat);if(!Number.isInteger(i)||i<1||i>=capacity(modeRef.current))return;
         const input=cleanInput(m.input),old=remote.current[i];
         if(old&&input.actionId<=old.actionId){
           // Keep an action that arrived between physics ticks, but never replay it.
           input.hit=old.input.hit;input.lob=old.input.lob;input.smash=old.input.smash;input.serve=old.input.serve;
           input.aim=old.input.aim??0;input.power=old.input.power??.5;
         }
         remote.current[i]={input,at:performance.now(),actionId:Math.max(input.actionId,old?.actionId??0)};
       }else if(m.epoch===epoch.current&&m.type==='t_snapshot'&&seatRef.current>0&&startedRef.current&&validWorld(m.world)){
         const next=cloneWorld(m.world),own=seatRef.current,prev=game.current;
         next.mode=modeRef.current;
         if(next.phase===prev.phase&&next.seq===prev.seq){
           const p=next.players[own],local=prev.players[own];
           if(Math.hypot(p.x-local.x,p.z-local.z)<2){p.x=local.x+(p.x-local.x)*.22;p.z=local.z+(p.z-local.z)*.22;}
         }
         game.current=next;receivedAt.current=performance.now();
       }
     }catch{ /* malformed network data never enters the world */ }
   };
   s.onerror=()=>{if(socket.current===s)setNotice('接続できません。オンライン対応サーバーと部屋コードを確認してください。');};
   s.onclose=()=>{clearTimeout(timeout);clearInterval(ping);if(socket.current!==s)return;disconnect();reset(modeRef.current);setNotice('接続が切れました。再入室してください。');};
 };
 const startOnline=()=>{if(seatRef.current===0&&roster.length===capacity(modeRef.current))send({type:'t_start'});};
 const restart=()=>{if(isOnline(modeRef.current)){if(seatRef.current===0)send({type:'t_reset'});}else reset(modeRef.current);};
 const copyInvite=async()=>{
   const u=new URL(location.href);u.search='';u.searchParams.set('room',room);u.searchParams.set('match',mode==='online-single'?'singles':'doubles');
   try{await navigator.clipboard.writeText(u.toString());setNotice('招待リンクをコピーしました');}catch{setNotice('招待リンク: '+u.toString());}
 };
 const enterFullscreen=()=>{
   setFocus(true);
   const elem=workspace.current;
   if(elem&&!document.fullscreenElement){
     if(elem.requestFullscreen)void elem.requestFullscreen().catch(()=>setNotice('画面いっぱいの表示でプレイ中。全画面ボタンで再試行できます。'));
   }
 };
 const leaveFullscreen=()=>{setFocus(false);if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});};
 useEffect(()=>{
   const change=()=>{if(!document.fullscreenElement)setFocus(false);};
   document.addEventListener('fullscreenchange',change);
   return()=>document.removeEventListener('fullscreenchange',change);
 },[]);
 useEffect(()=>{
   const cv=canvas.current,host=stageDiv.current;if(!cv||!host)return;
   let arena:PerspectiveStage;
   try{arena=new PerspectiveStage(cv);stage.current=arena;arena.setView(viewRef.current);arena.setSize(host.clientWidth,host.clientHeight);}
   catch(err){setRendererError('3D表示を開始できません。WebGL対応ブラウザで開いてください。 '+String(err));return;}
   const resize=new ResizeObserver(()=>arena.setSize(host.clientWidth,host.clientHeight));resize.observe(host);
   let raf=0,last=performance.now(),accumulator=0,elapsed=0,lastUI=0,frames=0,fpsAt=last;
   const frame=(now:number)=>{
     const dt=clamp((now-last)/1000,0,.06);last=now;elapsed+=dt;accumulator+=dt;frames++;
     const online=isOnline(modeRef.current),guest=online&&seatRef.current>0,me=online?Math.max(0,seatRef.current):0;
     const raw=pressed.current,t=touch.current,c=now-motionAt.current<250?motion.current:ZERO;
     const k:MoveInput={...NO_INPUT,left:!!(raw.KeyA||raw.ArrowLeft||t.left||c.left),right:!!(raw.KeyD||raw.ArrowRight||t.right||c.right),
       up:!!(raw.KeyW||raw.ArrowUp||t.up||c.up),down:!!(raw.KeyS||raw.ArrowDown||t.down||c.down),dash:!!(raw.ShiftLeft||raw.ShiftRight||t.dash||c.dash)};
     while(actions.current.length&&now-actions.current[0].at>250)actions.current.shift();
     const action=(guest||accumulator>=1/60)?actions.current.shift():undefined;
     if(action){k[action.key]=true;k.aim=action.aim;k.power=action.power;}
     const stale=guest&&now-receivedAt.current>1200;
     if(guest&&startedRef.current&&!stale){
       moveAthlete(game.current.players[me],me,k,dt);
       if(action){game.current.players[me].swing=.25;actionId.current++;}
       if(now-lastInput.current>=33||action){send({type:'t_input',epoch:epoch.current,input:{...k,actionId:actionId.current}});lastInput.current=now;}
       accumulator=0;
     }else if(!online||(me===0&&startedRef.current)){
       let steps=0;
       while(accumulator>=1/60&&steps++<4){
         const inputs=Array.from({length:4},()=>({...NO_INPUT}));inputs[me]={...k};
         if(online)for(const [i,r] of Object.entries(remote.current)){
           if(now-r.at<300)inputs[Number(i)]={...r.input};
         }
         advanceWorld(game.current,inputs,1/60,online?0:modeRef.current==='boss'?3:2);
         for(const r of Object.values(remote.current)){r.input.hit=false;r.input.lob=false;r.input.smash=false;r.input.serve=false;}
         k.hit=false;k.lob=false;k.smash=false;k.serve=false;accumulator-=1/60;
       }
       if(accumulator>.1)accumulator=0;
       if(online&&now-lastSnapshot.current>=33){send({type:'t_snapshot',epoch:epoch.current,world:game.current});lastSnapshot.current=now;}
     }else accumulator=0;
     renderWorld.current=guest?smoothWorld(renderWorld.current,game.current,dt,me,now-receivedAt.current):game.current;
     arena.frame(renderWorld.current,me,dt,elapsed);
     if(now-lastUI>120){publish();setNetworkStale(stale);lastUI=now;}
     if(now-fpsAt>1000){setFps(Math.round(frames*1000/(now-fpsAt)));fpsAt=now;frames=0;}
     raf=requestAnimationFrame(frame);
   };
   raf=requestAnimationFrame(frame);
   return()=>{cancelAnimationFrame(raf);resize.disconnect();arena.dispose();stage.current=null;};
 },[]);
 useEffect(()=>{
   const down=(e:KeyboardEvent)=>{
     if((e.target as HTMLElement)?.matches('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;
     if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
     pressed.current[e.code]=true;if(e.repeat)return;
     if(e.code==='Space'||e.code==='KeyQ')queue('hit');if(e.code==='KeyE')queue('lob');if(e.code==='KeyF')queue('smash');if(e.code==='KeyT')queue('serve');
   };
   const up=(e:KeyboardEvent)=>{pressed.current[e.code]=false;};
   const blur=()=>{pressed.current={};touch.current={};motion.current=ZERO;actions.current=[];};
   window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',blur);
   return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',blur);};
 },[]);
 useEffect(()=>()=>{socket.current?.close();},[]);
 const updateCamera=(keys:MotionKeys)=>{
   const prev=motion.current,newEvent=keys.swingId?keys.swingId!==cameraEvent.current:(keys.hit&&!prev.hit)||(keys.lob&&!prev.lob);
   if(newEvent&&(keys.hit||keys.lob)){
     cameraEvent.current=keys.swingId??0;
     const key=game.current.phase==='ready'?'serve':keys.lob?'lob':keys.jump?'smash':'hit';
     queue(key,keys.aim,keys.power);
   }
   if(!keys.capturedAt)cameraEvent.current=0;
   motion.current=keys;motionAt.current=performance.now();
 };
 const downMove=(code:string)=>(e:PointerEvent<HTMLButtonElement>)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);touch.current[code]=true;};
 const upMove=(code:string)=>()=>{touch.current[code]=false;};
 const online=isOnline(mode),single=isSingles(mode),waiting=online&&!started;
 const phaseLabel={ready:'両手を上げてトス',toss:'腕を振ってサーブ',rally:'ラリー中',point:'ポイント',finished:'試合終了'}[ui.phase];
 return <div className="tennis-3d-page">
   <header className="tennis-3d-header"><div className="tennis-3d-brand"><span className="tennis-3d-logo">🎾</span><div><h1>MOTION TENNIS 3D</h1><p>体で動いて、腕で打つ。カジュアル3Dテニス</p></div></div>
     <nav className="tennis-3d-topnav"><button onClick={onClassic}>従来の2Dテニス</button><button onClick={onLegacyDoubles}>従来の2Dダブルス</button></nav></header>
   <section className="tennis-3d-modes" aria-label="対戦モード">
     {([['single','シングルス練習','CPUと1対1'],['practice','ダブルス練習','CPUと2対2'],['online-single','オンライン1対1','2人で対戦'],['online','オンラインダブルス','4人で2対2']] as const).map(([key,title,sub])=><button key={key} className={mode===key?'chosen':''} onClick={()=>chooseMode(key)}><b>{title}</b><small>{sub}</small></button>)}
   </section>
   {online&&<section className="tennis-3d-room" aria-label="オンラインロビー">
     <label>部屋コード<input maxLength={24} disabled={netStatus!=='off'} value={room} onChange={e=>setRoom(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,''))}/></label>
     <button disabled={netStatus!=='off'} onClick={connect}>ルームに参加</button><button onClick={copyInvite}>招待リンクをコピー</button><button onClick={disconnect} disabled={netStatus==='off'}>退出</button>
     <div className="tennis-3d-roster">{roster.length}/{capacity(mode)}人 {roster.map(i=><span className="in" key={i}>{i+1}P {i===seat?'あなた':''}</span>)}</div>
     <button className="tennis-3d-start" onClick={startOnline} disabled={seat!==0||netStatus!=='ready'||started}>試合開始（ホスト）</button>
     <small>同じリンク・同じモードで入室。{capacity(mode)}人揃うと開始できます。1Pと3P、2Pと4Pが同じチームです。</small>
   </section>}
   <main ref={workspace} className={'tennis-3d-workspace '+(showCamera?'tennis-3d-with-camera ':'')+(focus?'is-focused':'')}>
     <div className="tennis-3d-play-column">
       <div className="tennis-3d-score"><div className="tennis-3d-team"><span className="team-flag red"/><strong>{single?'1P':'1P + 3P'}</strong><b>{ui.score[0]}</b></div>
         <div className="tennis-3d-center"><span>{phaseLabel}</span><strong>VS</strong><small>先に7点・2点差 / ラリー {ui.rally}</small></div>
         <div className="tennis-3d-team blue"><b>{ui.score[1]}</b><strong>{single?(online?'2P':'CPU'):'2P + 4P'}</strong><span className="team-flag blue"/></div></div>
       <div className="tennis-3d-scene" ref={stageDiv}><canvas ref={canvas} className="tennis-3d-canvas" aria-label="3Dテニスコート"/>
         <div className="tennis-3d-topline"><span>{VIEW_NAMES[view]} · {fps} FPS</span><span>{online?'通信往復 '+rtt+' ms':'CPU対戦'} · {cameraActive?'カメラ操作中':'キーボード・タッチ対応'}</span></div>
         {rendererError&&<div className="tennis-3d-overlay">{rendererError}</div>}
         {waiting&&<div className="tennis-3d-ready-hint"><b>ルーム待機中</b><p>{capacity(mode)}人で入室し、ホストが開始してください。</p>{focus&&<button onClick={leaveFullscreen}>ロビーに戻る</button>}</div>}
         {networkStale&&started&&<div className="tennis-3d-ready-hint">ホストの応答待ちです。ホストはゲーム画面を開いたままにしてください。</div>}
         {ui.phase==='finished'&&<div className="tennis-3d-result"><b>{ui.winner===0?'レッド':'ブルー'}の勝利！</b><button onClick={restart}>もう一度</button></div>}
       </div>
       <div className="tennis-3d-message" aria-live="polite"><span>{ui.message}</span><span>サーブ {ui.server+1}P · 強さ {Math.round((motion.current.power??.5)*100)}%</span></div>
       <div className="tennis-3d-camera-select"><strong>視点</strong>{VIEWS.map(v=><button key={v} className={view===v?'active':''} onClick={()=>changeView(v)}>{VIEW_NAMES[v]}</button>)}</div>
       <div className="tennis-3d-controls"><div className="tennis-3d-pad"><div>{[['up','▲'],['left','◀'],['down','▼'],['right','▶']].map(([key,label])=><button key={key} aria-label={key} onPointerDown={downMove(key)} onPointerUp={upMove(key)} onPointerCancel={upMove(key)} onLostPointerCapture={upMove(key)}>{label}</button>)}</div></div>
         <div className="tennis-3d-strikes"><button className="serve" onClick={()=>queue('serve')}>トス <small>T</small></button><button className="hit" onClick={()=>queue('hit')}>打つ <small>Q / Space</small></button><button onClick={()=>queue('lob')}>ロブ <small>E</small></button><button onClick={()=>queue('smash')}>スマッシュ <small>F</small></button></div></div>
       <div className="tennis-3d-options"><button onClick={()=>setShowCamera(v=>!v)}>{showCamera?'カメラパネルを閉じる':'カメラパネルを開く'}</button><button onClick={focus?leaveFullscreen:enterFullscreen}>{focus?'全画面を終了':'全画面'}</button><button onClick={restart} disabled={online&&seat!==0}>試合リセット</button></div>
     </div>
     {showCamera&&<aside className="tennis-3d-camera-column"><MotionCamera onKeys={updateCamera} onStartRequest={enterFullscreen} onActiveChange={active=>{setCameraActive(active);if(!active){motion.current=ZERO;setFocus(false);if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});}}}/></aside>}
     <div className="tennis-3d-notice" role="status">{notice}</div>
   </main>
   {!focus&&<footer className="tennis-3d-help"><p><b>カメラ操作：</b>肩・腰が入る位置で静止して位置合わせ。左右に体をずらして移動、近づくと前進。両手を上げてトス、片腕を振って打ちます。振る方向で狙い、速さで強さが変わります。</p><p>WASD / 矢印：移動 · Shift：ダッシュ · T：トス · Q / Space：打つ · E：ロブ · F：スマッシュ。映像は端末内で処理し、対戦相手には送りません。</p><p>認識の ms は画像処理の時間です。カメラや通信を含めた実際の遅延とは異なります。簡易認識では左右移動と打球のみ利用できます。</p></footer>}
 </div>;
}
