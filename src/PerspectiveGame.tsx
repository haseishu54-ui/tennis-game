import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import MotionCamera, { type MotionKeys } from './MotionCamera';
import { PerspectiveStage, VIEW_NAMES, type ViewMode } from './PerspectiveStage';
import { advanceWorld, clamp, makeWorld, moveAthlete, NO_INPUT, teamOf, type MatchKind, type MoveInput, type TennisWorld } from './perspectivePhysics';
import './perspective.css';

const VIEWS:ViewMode[]=['photo','follow','side','overhead','ball'];
const MOTION_ZERO:MotionKeys={left:false,right:false,up:false,down:false,jump:false,hit:false,lob:false,dash:false};
const nextView=(now:ViewMode):ViewMode=>VIEWS[(VIEWS.indexOf(now)+1)%VIEWS.length];
const encodeX=(x:number)=>clamp((x+5.49)/10.98*1200,0,1200);
const encodeZ=(z:number)=>clamp((z+11.885)/23.77*750,0,750);
const decodeX=(x:number)=>clamp(x/1200*10.98-5.49,-5.1,5.1);
const decodeZ=(y:number,seat:number)=>clamp(y/750*23.77-11.885,teamOf(seat)===0?.7:-11.2,teamOf(seat)===0?11.2:-.7);
const stamp=(w:TennisWorld)=>`${w.score[0]}-${w.score[1]}-${w.phase}-${w.message}-${w.rally}`;

type NetStatus='off'|'connecting'|'waiting'|'ready';
export default function PerspectiveGame({onClassic,onLegacyDoubles}:{onClassic:()=>void;onLegacyDoubles:()=>void}){
 const [mode,setMode]=useState<MatchKind>(()=>new URLSearchParams(location.search).has('room')?'online':'single');
 const [view,setView]=useState<ViewMode>('photo');
 const [showCamera,setShowCamera]=useState(false);
 const [focus,setFocus]=useState(false);
 const [room,setRoom]=useState(()=>new URLSearchParams(location.search).get('room')||`3D${Math.floor(1000+Math.random()*9000)}`);
 const [netStatus,setNetStatus]=useState<NetStatus>('off');
 const [seat,setSeat]=useState(-1);
 const [roster,setRoster]=useState<number[]>([]);
 const [notice,setNotice]=useState('カメラなしでもキーボードでプレーできます。');
 const [ui,setUi]=useState(()=>makeWorld(new URLSearchParams(location.search).has('room')?'online':'single'));
 const [rendererError,setRendererError]=useState('');
 const [copied,setCopied]=useState(false);
 const workspace=useRef<HTMLDivElement>(null),stageDiv=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const game=useRef<TennisWorld>(makeWorld(mode));
 const stage=useRef<PerspectiveStage|null>(null);
 const modeRef=useRef<MatchKind>(mode),viewRef=useRef<ViewMode>(view),seatRef=useRef(-1);
 const pressed=useRef<Record<string,boolean>>({}),touch=useRef<Record<string,boolean>>({});
 const motion=useRef<MotionKeys>(MOTION_ZERO);
 const actions=useRef<Array<'hit'|'lob'|'smash'|'serve'>>([]);
 const ws=useRef<WebSocket|null>(null),lastUi=useRef(0),lastInput=useRef(0),lastSnapshot=useRef(0);
 const lastStamp=useRef(''),remoteActions=useRef<Record<number,MoveInput>>({});
 const onlineReady=useRef(false);
 const onlineStarted=useRef(false);
 modeRef.current=mode;viewRef.current=view;
 const publish=()=>{
   const w=game.current;
   setUi({...w,score:[...w.score] as [number,number],players:w.players.map(p=>({...p})),ball:{...w.ball}});
 };
 const reset=(kind:MatchKind)=>{if(kind==='online')onlineStarted.current=false;game.current=makeWorld(kind);actions.current=[];remoteActions.current={};lastStamp.current='';publish();};
 const send=(data:object)=>{const socket=ws.current;if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data));};
 const disconnect=useCallback(()=>{
   ws.current?.close();ws.current=null;onlineReady.current=false;onlineStarted.current=false;seatRef.current=-1;setSeat(-1);setRoster([]);setNetStatus('off');
 },[]);
 const chooseMode=(kind:MatchKind)=>{
   if(kind!=='online')disconnect();
   setMode(kind);reset(kind);
   if(kind==='online')setNotice('ルームに入室し、4人集まったらホストが試合を開始します。');
   else setNotice(kind==='boss'?'伝説級AIに挑戦！':'サーブは「トス」→「ショット」の順番です。');
 };
 const changeView=useCallback((v:ViewMode)=>{setView(v);viewRef.current=v;stage.current?.setView(v);
   const elem=stageDiv.current;if(elem)stage.current?.setSize(elem.clientWidth,elem.clientHeight);
 },[]);
 const queue=(key:'hit'|'lob'|'smash'|'serve')=>{if(actions.current.length<5)actions.current.push(key);};
 const connect=()=>{
   disconnect();const roomId=room.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);
   if(!roomId){setNotice('部屋コードを入力してください。');return;}
   setMode('online');reset('online');setNetStatus('connecting');
   const url=`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws?room=${encodeURIComponent(roomId)}`;
   const socket=new WebSocket(url);ws.current=socket;
   let ping:number|undefined;
   socket.onopen=()=>{if(ws.current!==socket)return;
     socket.send(JSON.stringify({type:'join',matchType:'doubles',roomId}));
     ping=window.setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send('{"type":"ping"}');},20000);
   };
   socket.onmessage=evt=>{
     if(ws.current!==socket)return;
     try{
       const m=JSON.parse(evt.data);
       if(m.type==='joined'){
         seatRef.current=Number(m.playerIndex);onlineReady.current=true;setSeat(Number(m.playerIndex));setRoster(m.playerIndices||[]);
         setNetStatus(m.playersCount===4?'ready':'waiting');reset('online');
         setNotice(`${m.playerIndex+1}Pとして入室！ 現在${m.playersCount}/4人です。`);
       }else if(m.type==='player_joined'||m.type==='player_left'){
         setRoster(m.playerIndices||[]);setNetStatus(m.playersCount===4?'ready':'waiting');
         if(m.type==='player_left'){
           reset('online');setNotice(m.leftPlayerIndex===0?'ホストが退出しました。新しい部屋を作ってください。':'プレイヤーが退出しました。再び4人集まるまでお待ちください。');
         }else setNotice(`${m.playerIndex+1}Pが参加！ 現在${m.playersCount}/4人。`);
       }else if(m.type==='d_start'){
         reset('online');onlineStarted.current=true;setNotice('試合開始！');
       }else if(m.type==='d_restart'){
         reset('online');
       }else if(m.type==='d_input'&&seatRef.current===0){
         const i=Number(m.seat);if(i<1||i>3)return;
         const p=game.current.players[i];if(!p)return;
         const x=decodeX(Number(m.x)||0),z=decodeZ(Number(m.y)||0,i);
         const dt=.05;p.vx=clamp((x-p.x)/dt,-12,12);p.vz=clamp((z-p.z)/dt,-12,12);
         p.x+=(x-p.x)*.65;p.z+=(z-p.z)*.65;p.moving=Math.min(1,Math.hypot(p.vx,p.vz)/12);
         if(m.swing||m.serve){remoteActions.current[i]={...NO_INPUT,hit:Boolean(m.swing&&!m.lob&&!m.smash),lob:Boolean(m.lob),smash:Boolean(m.smash),serve:Boolean(m.serve)};}
       }else if(m.type==='d_snapshot'&&seatRef.current>0){
         const snap=m.world as TennisWorld;
         if(!snap||!Array.isArray(snap.players)||snap.players.length!==4||!snap.ball||!Array.isArray(snap.score))return;
         const own=seatRef.current,prev=game.current.players[own];
         game.current={...snap,mode:'online',players:snap.players.map((p,i)=>i===own&&prev?{...p,x:prev.x,z:prev.z,vx:prev.vx,vz:prev.vz}:p)};
       }
     }catch{ /* Ignore malformed/old network snapshots. */ }
   };
   socket.onerror=()=>{if(ws.current===socket)setNotice('オンライン接続に失敗しました。サーバーをご確認ください。');};
   socket.onclose=()=>{if(ping)clearInterval(ping);if(ws.current!==socket)return;
     ws.current=null;onlineReady.current=false;seatRef.current=-1;setSeat(-1);setRoster([]);setNetStatus('off');setNotice('接続が切れました。再入室してください。');reset('online');
   };
 };
 const startOnline=()=>{
   if(modeRef.current==='online'&&seatRef.current===0&&roster.length===4){
      reset('online');onlineStarted.current=true;send({type:'d_start'});setNotice('試合開始！');
   }
 };
 const restart=()=>{if(modeRef.current==='online'){
    if(seatRef.current!==0)return;
    send({type:'d_restart'});
   }
   reset(modeRef.current);
 };
 const copyInvite=async()=>{
   const u=new URL(location.href);u.searchParams.delete('doubles');u.searchParams.delete('classic');u.searchParams.set('arena','3d');u.searchParams.set('room',room.toUpperCase());
   try{await navigator.clipboard.writeText(u.toString());setCopied(true);window.setTimeout(()=>setCopied(false),2000);}
   catch{setNotice(`招待リンク: ${u.toString()}`);}
 };
 const fullscreen=async()=>{
   const elem=workspace.current;
   try{if(document.fullscreenElement)await document.exitFullscreen();else await elem?.requestFullscreen();}
   catch{setNotice('全画面表示はこのブラウザで許可されませんでした。');}
 };
 useEffect(()=>{
   const cv=canvas.current,host=stageDiv.current;if(!cv||!host)return;
   let arena:PerspectiveStage;
   try{arena=new PerspectiveStage(cv);stage.current=arena;arena.setView(viewRef.current);
     arena.setSize(host.clientWidth,host.clientHeight);
   }catch(err){setRendererError(`3D表示を開始できません: ${String(err)}。WebGL対応ブラウザをお試しください。`);return;}
   const resize=new ResizeObserver(()=>arena.setSize(host.clientWidth,host.clientHeight));resize.observe(host);
   let raf=0,last=performance.now(),accumulator=0,elapsed=0;
   const frame=(now:number)=>{
     const dt=clamp((now-last)/1000,0,.06);last=now;elapsed+=dt;accumulator+=dt;
     const seat=modeRef.current==='online'?Math.max(0,seatRef.current):0;
     const raw=pressed.current,t=touch.current,c=motion.current;
     const k:MoveInput={left:!!(raw.KeyA||raw.ArrowLeft||t.left||c.left),right:!!(raw.KeyD||raw.ArrowRight||t.right||c.right),
       up:!!(raw.KeyW||raw.ArrowUp||t.up||c.up),down:!!(raw.KeyS||raw.ArrowDown||t.down||c.down),
       dash:!!(raw.ShiftLeft||raw.ShiftRight||t.dash||c.dash),hit:false,lob:false,smash:false,serve:false};
     // Retain queued taps on high-refresh-rate displays until a physics step is due.
     const guest=modeRef.current==='online'&&seatRef.current>0&&onlineReady.current;
     const action=guest||accumulator>=1/60?actions.current.shift():undefined;
     if(action)k[action]=true;
     // Guest players run their own smooth movement and send position + strike events to the host.
     if(guest&&onlineStarted.current){
       const p=game.current.players[seat];if(p)moveAthlete(p,seat,k,dt);
       if(now-lastInput.current>42||action){
         send({type:'d_input',x:encodeX(p.x),y:encodeZ(p.z),swing:!!(k.hit||k.lob||k.smash),lob:k.lob,smash:k.smash,serve:k.serve,dash:k.dash});
         lastInput.current=now;
       }
     }else if(modeRef.current!=='online'||seatRef.current===0&&onlineReady.current&&onlineStarted.current){
       // Fixed 60-Hz physics, independent of monitor refresh rate.
       let simulated=0;
       while(accumulator>=1/60&&simulated<4){
         const inputs=Array.from({length:4},()=>({...NO_INPUT}));inputs[seat]={...k};
         if(modeRef.current==='online'){
           for(const [num,remote] of Object.entries(remoteActions.current))inputs[Number(num)]={...remote};
         }
         advanceWorld(game.current,inputs,1/60,modeRef.current==='boss'?3:modeRef.current==='online'?0:modeRef.current==='practice'?2:2);
         remoteActions.current={};k.hit=false;k.lob=false;k.smash=false;k.serve=false;
         accumulator-=1/60;simulated++;
       }
       if(accumulator>1/10)accumulator=0;
       if(modeRef.current==='online'&&now-lastSnapshot.current>50){
         send({type:'d_snapshot',world:game.current});lastSnapshot.current=now;
       }
     }else{
       accumulator=0;
     }
     // Camera updates every frame; a dash has both a faster athlete and a faster run cycle.
     arena.frame(game.current,seat,dt,elapsed);
     if(now-lastUi.current>140){
       const signature=stamp(game.current);
       if(signature!==lastStamp.current){lastStamp.current=signature;publish();}
       lastUi.current=now;
     }
     raf=requestAnimationFrame(frame);
   };
   raf=requestAnimationFrame(frame);
   return()=>{cancelAnimationFrame(raf);resize.disconnect();arena.dispose();if(stage.current===arena)stage.current=null;};
 },[]);
 useEffect(()=>{
   const down=(e:KeyboardEvent)=>{
     if((e.target as HTMLElement)?.matches('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;
     if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
     if(e.repeat)return;
     pressed.current[e.code]=true;
     if(e.code==='Space'||e.code==='KeyQ')queue('hit');
     if(e.code==='KeyE')queue('lob');
     if(e.code==='KeyF')queue('smash');
     if(e.code==='KeyT')queue('serve');
     if(e.code==='KeyV')changeView(nextView(viewRef.current));
   };
   const up=(e:KeyboardEvent)=>{pressed.current[e.code]=false;};
   const blur=()=>{pressed.current={};touch.current={};};
   window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
   return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
 },[changeView]);
 useEffect(()=>()=>{ws.current?.close();},[]);
 const updateCamera=(keys:MotionKeys)=>{
   const prev=motion.current;
   if(keys.lob&&!prev.lob)queue(game.current.phase==='ready'?'serve':'lob');
   else if(keys.hit&&!prev.hit)queue(keys.jump?'smash':'hit');
   motion.current=keys;
 };
 const downMove=(code:string)=>(e:PointerEvent<HTMLButtonElement>)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);touch.current[code]=true;};
 const upMove=(code:string)=>(e:PointerEvent<HTMLButtonElement>)=>{e.preventDefault();touch.current[code]=false;};
 const statusLabel=ui.phase==='finished'?`${ui.winner===0?'レッド':'ブルー'} 勝利！`:({ready:'サーブ待ち',toss:'トス中',rally:'ラリー中',point:'ポイント確定',finished:'試合終了'} as const)[ui.phase];
 const atWaiting=mode==='online'&&!onlineStarted.current;
 return (
   <div className="tennis-3d-page">
     <header className="tennis-3d-header">
       <div className="tennis-3d-brand"><span className="tennis-3d-logo">🎾</span><div><h1>REAL TENNIS 3D</h1><p>写真のコートから始まる、走って打つテニス</p></div></div>
       <nav className="tennis-3d-topnav" aria-label="ゲーム選択">
         <button className="tennis-3d-nav-active">✨ 新しい3Dテニス</button>
         <button onClick={onClassic}>従来のゲーム</button>
         <button onClick={onLegacyDoubles}>従来のオンラインダブルス</button>
       </nav>
     </header>
     <section className="tennis-3d-modes" aria-label="対戦モード">
       <button className={mode==='single'?'chosen':''} onClick={()=>chooseMode('single')}><span>🎾</span><b>シングルス</b><small>CPUと1対1</small></button>
       <button className={mode==='practice'?'chosen':''} onClick={()=>chooseMode('practice')}><span>👥</span><b>3Dダブルス練習</b><small>CPUと2対2</small></button>
       <button className={mode==='boss'?'chosen':''} onClick={()=>chooseMode('boss')}><span>👑</span><b>伝説級ボス</b><small>超高速CPU</small></button>
       <button className={mode==='online'?'chosen':''} onClick={()=>chooseMode('online')}><span>🌐</span><b>オンライン4人</b><small>2対2・別端末</small></button>
     </section>
     {mode==='online'&&<section className="tennis-3d-room" aria-label="オンラインロビー">
       <label>共通の部屋コード<input maxLength={24} disabled={netStatus!=='off'} value={room} onChange={e=>setRoom(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,''))}/></label>
       <button onClick={connect} disabled={netStatus==='connecting'||netStatus==='waiting'||netStatus==='ready'}>🔗 ルームに参加</button>
       <button onClick={copyInvite}>🔗 {copied?'コピーしました':'招待リンクをコピー'}</button>
       <button onClick={disconnect} disabled={netStatus==='off'}>退出</button>
       <div className="tennis-3d-roster">接続 {roster.length}/4 — {Array.from({length:4},(_,i)=><span className={roster.includes(i)?'in':''} key={i}>{i+1}P {roster.includes(i)?'●':'○'}</span>)}</div>
       <button className="tennis-3d-start" disabled={seat!==0||netStatus!=='ready'} onClick={startOnline}>▶ ホストが試合開始</button>
       <small>全員が同じ公開URLへアクセスしてください。4人集まると開始できます。</small>
     </section>}
     <main ref={workspace} className={`tennis-3d-workspace ${showCamera?'tennis-3d-with-camera':''} ${focus?'is-focused':''}`}>
       <div className="tennis-3d-play-column">
         <div className="tennis-3d-score">
           <div className="tennis-3d-team"><span className="team-flag red"/> <div><strong>RED {mode==='single'?'1P':'1P + 3P'}</strong><small>{seat===0?'あなた':'レッドチーム'}</small></div><b>{ui.score[0]}</b></div>
           <div className="tennis-3d-center"><span>{statusLabel}</span><strong>VS</strong><small>ラリー {ui.rally} / 最長 {ui.best}</small></div>
           <div className="tennis-3d-team blue"><b>{ui.score[1]}</b><div><strong>BLUE {mode==='single'?'CPU':'2P + 4P'}</strong><small>{seat===1||seat===3?'あなた':'対戦チーム'}</small></div><span className="team-flag blue"/></div>
         </div>
         <div className="tennis-3d-scene" ref={stageDiv} style={view==='photo'?{backgroundImage:'url(/court-reference.png)'}:undefined}>
           <canvas ref={canvas} className="tennis-3d-canvas" aria-label="3Dテニスコート。WASDまたは矢印で移動、Qで打球、Tでサーブトス。"/>
           {rendererError&&<div className="tennis-3d-overlay">{rendererError}</div>}
           <div className="tennis-3d-topline"><span>📍 {VIEW_NAMES[view]}</span><span>{ui.lastShot} ・ {ui.ball.kind==='smash'?'強打':ui.phase==='toss'?'トス中':'リアル球筋'}</span></div>
           {ui.phase==='finished'&&<div className="tennis-3d-result"><b>🏆 {ui.winner===0?'レッド':'ブルー'} チーム勝利！</b><button onClick={restart}>もう一度遊ぶ</button></div>}
           {atWaiting&&<div className="tennis-3d-ready-hint"><b>オンラインの準備中</b><p>4人集まったらホストが「試合開始」を押してください。</p></div>}
         </div>
         <div className="tennis-3d-message" aria-live="polite"><span>💬 {ui.message}</span><span>⚡ スタミナ <b>{Math.round(ui.players[Math.max(0,seat)].energy)}%</b></span></div>
         <div className="tennis-3d-camera-select"><strong>🎥 視点を変更</strong><div>{VIEWS.map(v=><button key={v} className={view===v?'active':''} onClick={()=>changeView(v)}>{v==='photo'?'🖼️ 画像':v==='follow'?'🏃 追従':v==='side'?'↔ サイド':v==='overhead'?'⬆ 俯瞰':'🎾 球追跡'}</button>)}</div></div>
         <div className="tennis-3d-controls">
           <div className="tennis-3d-pad" aria-label="移動ボタン">
             <div><button aria-label="前へ" onPointerDown={downMove('up')} onPointerUp={upMove('up')} onPointerCancel={upMove('up')} onLostPointerCapture={()=>{touch.current.up=false;}}>▲</button></div>
             <div><button aria-label="左へ" onPointerDown={downMove('left')} onPointerUp={upMove('left')} onPointerCancel={upMove('left')} onLostPointerCapture={()=>{touch.current.left=false;}}>◀</button><button aria-label="後ろへ" onPointerDown={downMove('down')} onPointerUp={upMove('down')} onPointerCancel={upMove('down')} onLostPointerCapture={()=>{touch.current.down=false;}}>▼</button><button aria-label="右へ" onPointerDown={downMove('right')} onPointerUp={upMove('right')} onPointerCancel={upMove('right')} onLostPointerCapture={()=>{touch.current.right=false;}}>▶</button></div>
           </div>
           <div className="tennis-3d-strikes">
             <button className="serve" onClick={()=>queue('serve')}>🎾 サーブ（トス）<small>T</small></button>
             <button className="hit" onClick={()=>queue('hit')}>🏸 打つ！<small>Q / Space</small></button>
             <button onClick={()=>queue('lob')}>☁ ロブ<small>E</small></button>
             <button onClick={()=>queue('smash')}>💥 スマッシュ<small>F</small></button>
             <button className="dash" onPointerDown={downMove('dash')} onPointerUp={upMove('dash')} onPointerCancel={upMove('dash')} onLostPointerCapture={()=>{touch.current.dash=false;}}>⚡ ダッシュ<small>Shift長押し</small></button>
           </div>
         </div>
         <div className="tennis-3d-options"><button onClick={()=>{setShowCamera(v=>!v);}}>{showCamera?'📷 カメラパネルを閉じる':'📷 実際の体の動きでプレー（カメラ）'}</button><button onClick={fullscreen}>⛶ 全画面</button><button onClick={()=>setFocus(v=>!v)}>{focus?'設定を表示':'🖥 大画面に収める'}</button><button onClick={restart}>↺ 試合リセット</button></div>
       </div>
       {showCamera&&<aside className="tennis-3d-camera-column"><MotionCamera onKeys={updateCamera}/><div className="tennis-3d-camera-tip"><strong>📹 カメラ操作のコツ</strong><p>左右への移動でコートを走り、前後の動きで奥行きを調整。腕の振りで返球、手を上げてサーブトスやロブ。大きく動くとダッシュになります。</p><p>撮影した映像は端末内で処理され、対戦相手へ送られません。</p></div></aside>}
     </main>
     {!focus&&<footer className="tennis-3d-help"><p>⌨️ <b>WASD / 矢印</b> 移動 ／ <b>Shift</b> 走る ／ <b>T</b> トス → <b>Q / Space</b> サーブ ／ <b>E</b> ロブ ／ <b>F</b> スマッシュ ／ <b>V</b> 視点切替</p><p>🎯 前に走りながら打つと速いトップスピン、下がりながら打つとスライス、横に走りながら打つと横回転がかかります。ボールの近くでタイミングを合わせて打ってください。</p><p>🖼️ 「画像」視点は添付画像を背景に3D選手・ボールを重ねます。別視点では立体コートを自由な方向から描画します。WebGLが必要です。</p></footer>}
     {notice&&<div className="tennis-3d-notice" role="status">{notice}</div>}
   </div>
 );
}
