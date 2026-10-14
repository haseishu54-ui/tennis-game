import { useCallback, useEffect, useRef, useState } from 'react';
import MotionCamera, { type MotionKeys } from './MotionCamera';

const WIDTH = 1200, HEIGHT = 720, NET_X = 600;
const LEFT = 75, RIGHT = 1125, TOP = 100, BOTTOM = 625;
const COLORS = ['#fb7185','#fbbf24','#fda4af','#fde68a'];
const TEAM = (seat: number) => seat % 2;
const clamp = (x: number, a: number, b: number) => Math.max(a,Math.min(b,x));
type Phase = 'lobby'|'countdown'|'play'|'point'|'ended';
type Player = { x:number;y:number; swing:number; cool:number; dash:number; power:number; flash:number; name:string; };
type Ball = { x:number;y:number;z:number;vx:number;vy:number;vz:number;lastTeam:number;bounces:number;trail:{x:number;y:number;z:number}[];power:boolean };
type World = { phase:Phase; score:[number,number]; serve:number; countdown:number; winner:number;rally:number;best:number; message:string; players:Player[]; ball:Ball; seq:number; };
type Keys = { left:boolean;right:boolean;up:boolean;down:boolean;hit:boolean;lob:boolean;smash:boolean;dash:boolean };
const EMPTY:Keys = {left:false,right:false,up:false,down:false,hit:false,lob:false,smash:false,dash:false};
const SPAWNS = [{x:215,y:350},{x:985,y:350},{x:445,y:240},{x:755,y:480}];
const newBall = (team=0):Ball => ({ x:team===0?245:955,y:360,z:75,vx:0,vy:0,vz:0,lastTeam:team,bounces:0,trail:[],power:false });
const createWorld = ():World => ({ phase:'lobby',score:[0,0],serve:0,countdown:2,winner:-1,rally:0,best:0,message:'',
  players:SPAWNS.map((p,i)=>({...p,swing:0,cool:0,dash:0,power:0,flash:0,name:`${i+1}P`})),ball:newBall(),seq:0 });
const phaseJapanese:Record<Phase,string> = {lobby:'ルーム待機',countdown:'サーブ準備',play:'ラリー中',point:'ポイント',ended:'試合終了'};

function drawCourt(ctx:CanvasRenderingContext2D,w:World,now:number,seat:number,practice:boolean,legend:boolean) {
  const sky=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);
  sky.addColorStop(0,'#092b3f');sky.addColorStop(1,'#101b38');
  ctx.fillStyle=sky;ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#0c4362';ctx.fillRect(38,62,1124,608);
  ctx.fillStyle='#0c727b';ctx.fillRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP);
  ctx.fillStyle='#117f88';ctx.fillRect(LEFT,TOP,NET_X-LEFT,BOTTOM-TOP);
  ctx.fillStyle='#087482';ctx.fillRect(NET_X,TOP,RIGHT-NET_X,BOTTOM-TOP);
  // alternate service lanes
  ctx.fillStyle='rgba(255,255,255,.045)';ctx.fillRect(LEFT,TOP,NET_X-LEFT,(BOTTOM-TOP)/2);
  ctx.fillRect(NET_X,(BOTTOM+TOP)/2,RIGHT-NET_X,(BOTTOM-TOP)/2);
  ctx.strokeStyle='rgba(240,255,255,.83)';ctx.lineWidth=4;
  ctx.strokeRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP);
  ctx.beginPath();ctx.moveTo(LEFT,360);ctx.lineTo(RIGHT,360);ctx.moveTo(LEFT+95,TOP);ctx.lineTo(LEFT+95,BOTTOM);
  ctx.moveTo(RIGHT-95,TOP);ctx.lineTo(RIGHT-95,BOTTOM);ctx.moveTo(362,TOP);ctx.lineTo(362,BOTTOM);ctx.moveTo(838,TOP);ctx.lineTo(838,BOTTOM);ctx.stroke();
  // net
  ctx.fillStyle='rgba(242,246,255,.95)';ctx.fillRect(NET_X-5,TOP-10,10,BOTTOM-TOP+20);
  ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1;
  for(let y=TOP+6;y<BOTTOM;y+=12){ctx.beginPath();ctx.moveTo(NET_X-13,y);ctx.lineTo(NET_X+13,y);ctx.stroke();}
  ctx.fillStyle='#e0f2fe';ctx.fillRect(NET_X-8,TOP-15,16,16);ctx.fillRect(NET_X-8,BOTTOM-1,16,16);
  // player shadows and characters
  for(let i=0;i<w.players.length;i++){
    const p=w.players[i],r=26;
    const isMe=(practice?i===0:i===seat);
    ctx.fillStyle='rgba(0,0,0,.24)';ctx.beginPath();ctx.ellipse(p.x+5,p.y+12,29,13,0,0,7);ctx.fill();
    if(isMe){ctx.beginPath();ctx.arc(p.x,p.y,r+10+Math.sin(now/280)*2,0,7);ctx.strokeStyle='#f8fafc';ctx.lineWidth=3;ctx.stroke();}
    ctx.fillStyle=COLORS[i];ctx.beginPath();ctx.arc(p.x,p.y,r,0,7);ctx.fill();
    ctx.strokeStyle='#102338';ctx.lineWidth=5;ctx.stroke();
    ctx.fillStyle='#1e293b';ctx.beginPath();ctx.arc(p.x-4,p.y-8,11,0,7);ctx.fill();
    const angle=TEAM(i)===0?0:Math.PI;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle + (p.swing>0?-.95:0));
    ctx.strokeStyle='#f8fafc';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(45,0);ctx.stroke();
    ctx.strokeStyle='#fcd34d';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(57,0,19,13,0,0,7);ctx.stroke();
    ctx.restore();
    if(p.flash>0){ctx.beginPath();ctx.arc(p.x,p.y,45+p.flash*16,0,7);ctx.strokeStyle=`rgba(251,191,36,${p.flash})`;ctx.lineWidth=5;ctx.stroke();}
    ctx.fillStyle='#fff';ctx.font='bold 20px system-ui';ctx.textAlign='center';ctx.fillText(practice&&i!==0?(legend&&TEAM(i)===1?'BOSS AI':'CPU'):`${i+1}P`,p.x,p.y-40);
    // charging super
    ctx.fillStyle='#082f49';ctx.fillRect(p.x-30,p.y+33,60,7);ctx.fillStyle=p.power>=99?'#fde047':'#67e8f9';ctx.fillRect(p.x-30,p.y+33,60*p.power/100,7);
  }
  const b=w.ball;
  if(w.phase!=='lobby'){
    b.trail.forEach((pt,i)=>{ctx.globalAlpha=(i/b.trail.length)*.5;ctx.fillStyle=b.power?'#fde047':'#c7f9a0';ctx.beginPath();ctx.arc(pt.x,pt.y-pt.z*.22,4+(i/b.trail.length)*7,0,7);ctx.fill();});ctx.globalAlpha=1;
    ctx.fillStyle='rgba(0,0,0,.26)';ctx.beginPath();ctx.ellipse(b.x+3,b.y+6,13,7,0,0,7);ctx.fill();
    ctx.fillStyle=b.power?'#fff8a0':'#efff70';ctx.shadowColor=b.power?'#f59e0b':'#bef264';ctx.shadowBlur=b.power?28:14;
    ctx.beginPath();ctx.arc(b.x,b.y-b.z*.36,11,0,7);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y-b.z*.36,11,-1.1,1.1);ctx.stroke();
  }
  if(w.phase==='lobby'||w.phase==='countdown'||w.phase==='point'||w.phase==='ended'){
    ctx.fillStyle='rgba(4,18,38,.72)';ctx.fillRect(315,268,570,160);
    ctx.textAlign='center';ctx.fillStyle='#f8fafc';ctx.font='900 44px system-ui';
    const main = w.phase==='lobby'?'4人でオンラインダブルス':w.phase==='countdown'?'READY!':w.phase==='point'?w.message:`${w.winner===0?'レッド':'イエロー'}チーム勝利！`;
    ctx.fillText(main,600,338);
    ctx.font='700 25px system-ui';ctx.fillStyle='#bcecff';
    ctx.fillText(w.phase==='countdown'?`サーブまで ${Math.max(1,Math.ceil(w.countdown))}`:w.phase==='lobby'?'2 vs 2 ・ 必殺スマッシュ ・ カメラ操作':w.phase==='point'?'NEXT POINT':'7点先取！',600,382);
  }
  ctx.fillStyle='#f8fafc';ctx.font='bold 17px system-ui';ctx.textAlign='left';
  ctx.fillText(`🎾 ${phaseJapanese[w.phase]}  /  連続ラリー ${w.rally}  /  最長 ${w.best}`,68,42);
  ctx.textAlign='right';ctx.fillText(practice?(legend?'👑 伝説級CPU':'🤖 CPU練習'):`操作中：${seat+1}P`,1135,42);
}

export default function DoublesArena({onBack}:{onBack:()=>void}) {
  const [room,setRoom]=useState(()=>new URLSearchParams(location.search).get('room') || `DB${Math.floor(1000+Math.random()*9000)}`);
  const [status,setStatus]=useState<'off'|'connecting'|'waiting'|'ready'>('off');
  const [seat,setSeat]=useState(-1);
  const [roster,setRoster]=useState<number[]>([]);
  const [notice,setNotice]=useState('4人が集まったら1Pが試合を開始できます。');
  const [practice,setPractice]=useState(false);
  const [legend,setLegend]=useState(false);
  const [cameraEnabled,setCameraEnabled]=useState(false);
  const [copied,setCopied]=useState(false);
  const [score,setScore]=useState<[number,number]>([0,0]);
  const [phase,setPhase]=useState<Phase>('lobby');
  const [rally,setRally]=useState(0);
  const canvas=useRef<HTMLCanvasElement>(null);
  const ws=useRef<WebSocket|null>(null);
  const playerSeat=useRef(-1);
  const online=useRef(false);
  const isPractice=useRef(false);
  const god=useRef(false);
  const world=useRef<World>(createWorld());
  const buttons=useRef<Record<string,boolean>>({});
  const camera=useRef<MotionKeys>({left:false,right:false,up:false,down:false,jump:false,hit:false,lob:false,dash:false});
  const swingHold=useRef(false);
  const remoteSwing=useRef<Record<number,{lob:boolean;smash:boolean}>>({});
  const lastSnapshot=useRef(0);
  const lastInput=useRef(0);
  const lastUi=useRef(0);
  const lastSeq=useRef(-1);
  isPractice.current=practice;god.current=legend;
  const send=(o:unknown)=>{const s=ws.current;if(s?.readyState===WebSocket.OPEN)s.send(JSON.stringify(o));};
  const publish=()=>{const w=world.current;setPhase(w.phase);setScore([...w.score] as [number,number]);setRally(w.rally);};
  const stopSocket=()=>{online.current=false;playerSeat.current=-1;ws.current?.close();ws.current=null;setStatus('off');setSeat(-1);setRoster([]);};
  const disconnect=()=>{stopSocket();world.current=createWorld();publish();setNotice('切断しました。');};
  const handleNet=useRef<(data:any)=>void>(()=>{});
  const connect=useCallback(()=>{
    if(ws.current)ws.current.close();
    setPractice(false);isPractice.current=false;
    setStatus('connecting');setNotice('オンライン部屋に接続中…');
    const roomId=room.toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);
    if(!roomId){setNotice('部屋コードを入力してください');setStatus('off');return;}
    const url=`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws?room=${encodeURIComponent(roomId)}`;
    const sock=new WebSocket(url);ws.current=sock;
    let ping:number|undefined;
    sock.onopen=()=>{if(ws.current!==sock)return;sock.send(JSON.stringify({type:'join',matchType:'doubles',roomId}));ping=window.setInterval(()=>{if(sock.readyState===WebSocket.OPEN)sock.send('{"type":"ping"}');},20000);};
    sock.onmessage=e=>{if(ws.current!==sock)return;try{handleNet.current(JSON.parse(e.data));}catch{/* ignore */}};
    sock.onerror=()=>{if(ws.current===sock)setNotice('接続に失敗しました。サーバー起動状況を確認してください。');};
    sock.onclose=()=>{if(ping)clearInterval(ping);if(ws.current!==sock)return;ws.current=null;online.current=false;playerSeat.current=-1;setStatus('off');setSeat(-1);setRoster([]);setNotice('通信が切れました。再入室してください。');world.current=createWorld();publish();};
  },[room]);

  const startGame=()=>{
    if(!isPractice.current && (playerSeat.current!==0||!online.current))return;
    world.current=createWorld();world.current.phase='countdown';world.current.countdown=2;world.current.seq++;
    if(!isPractice.current)send({type:'d_start'});
    publish();
  };
  const startPractice=(hard:boolean)=>{
    stopSocket();setPractice(true);setLegend(hard);isPractice.current=true;god.current=hard;
    setNotice(hard?'👑 伝説級AIが参戦！勝てるかな？':'🤖 3人のCPUとダブルスを練習！');
    world.current=createWorld();world.current.phase='countdown';world.current.countdown=2;world.current.seq++;publish();
  };
  const resetGame=()=>{if(!isPractice.current && playerSeat.current!==0)return;
    world.current=createWorld();if(!isPractice.current)send({type:'d_restart'});publish();};

  handleNet.current=(m:any)=>{
    if(m.type==='joined'){
      playerSeat.current=m.playerIndex;online.current=true;
      setSeat(m.playerIndex);setRoster(m.playerIndices||[]);setStatus(m.playersCount===4?'ready':'waiting');
      setNotice(`入室成功！あなたは${m.playerIndex+1}P（${m.playerIndex%2===0?'レッド':'イエロー'}チーム）。${m.playersCount}/4人接続中。`);
      world.current=createWorld();publish();
    } else if(m.type==='player_joined'||m.type==='player_left'){
      setRoster(m.playerIndices||[]);setStatus(m.playersCount===4?'ready':'waiting');
      if(m.type==='player_left'){
        world.current=createWorld();publish();
        setNotice(m.leftPlayerIndex===0?'ホストが退出しました。ルームを作り直してください。':`${m.leftPlayerIndex+1}Pが退出しました。${m.playersCount}/4人接続中。`);
      }else setNotice(`${m.playerIndex+1}Pが参加しました！ ${m.playersCount}/4人`);
    } else if(m.type==='d_start'){
      world.current=createWorld();world.current.phase='countdown';world.current.countdown=2;publish();
    } else if(m.type==='d_restart'){
      world.current=createWorld();publish();
    } else if(m.type==='d_input'&&playerSeat.current===0){
      const i=Number(m.seat);if(i<1||i>3)return;
      const p=world.current.players[i];
      const x=clamp(Number(m.x)||p.x,TEAM(i)===0?LEFT+35:NET_X+35,TEAM(i)===0?NET_X-35:RIGHT-35);
      const y=clamp(Number(m.y)||p.y,TOP+35,BOTTOM-35);
      // Sanity bound each update, preventing instantaneous teleports.
      p.x+=(x-p.x)*.45;p.y+=(y-p.y)*.45;
      if(m.swing)remoteSwing.current[i]={lob:Boolean(m.lob),smash:Boolean(m.smash)};
    } else if(m.type==='d_snapshot'&&playerSeat.current!==0 && online.current){
      const w=world.current;const local=playerSeat.current;
      const snapshot=m.world as World;if(!snapshot||!Array.isArray(snapshot.players)||snapshot.players.length!==4||!snapshot.ball)return;
      const prev=w.players[local];const diffSeq=snapshot.seq!==lastSeq.current;
      if(diffSeq)lastSeq.current=snapshot.seq;
      world.current={...snapshot,players:snapshot.players.map((p,i)=>i===local && !diffSeq?{...p,x:prev.x,y:prev.y}:p)};
      publish();
    }
  };

  useEffect(()=>{
    const press=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement)?.tagName==='INPUT'||e.metaKey||e.ctrlKey||e.altKey)return;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
      buttons.current[e.code]=true;
    };
    const release=(e:KeyboardEvent)=>{buttons.current[e.code]=false;};
    const blur=()=>{buttons.current={};};
    addEventListener('keydown',press);addEventListener('keyup',release);addEventListener('blur',blur);
    return()=>{removeEventListener('keydown',press);removeEventListener('keyup',release);removeEventListener('blur',blur);};
  },[]);
  useEffect(()=>()=>{ws.current?.close();},[]);
  const controlKeys=():Keys=>{
    const k=buttons.current,c=camera.current;
    return {left:!!(k.KeyA||k.ArrowLeft||c.left),right:!!(k.KeyD||k.ArrowRight||c.right),
      up:!!(k.KeyW||k.ArrowUp||c.up),down:!!(k.KeyS||k.ArrowDown||c.down),
      hit:!!(k.KeyQ||k.Space||k.Slash||c.hit),lob:!!(k.KeyE||k.Backslash||c.lob),
      smash:!!(k.KeyF||(c.jump&&c.hit)),dash:!!(k.ShiftLeft||k.ShiftRight||c.dash)};
  };

  useEffect(()=>{
    const cv=canvas.current;if(!cv)return;
    const ctx=cv.getContext('2d');if(!ctx)return;
    let previous=performance.now(),raf=0;
    const move=(p:Player,i:number,k:Keys,dt:number)=>{
      const dx=Number(k.right)-Number(k.left),dy=Number(k.down)-Number(k.up);
      const norm=Math.hypot(dx,dy)||1;
      p.dash=Math.max(0,p.dash-dt);p.flash=Math.max(0,p.flash-dt*2.6);
      p.cool=Math.max(0,p.cool-dt);p.swing=Math.max(0,p.swing-dt);
      const speed= k.dash && p.dash===0 ? 550:310;
      if(k.dash&&p.dash===0)p.dash=1.5;
      p.x=clamp(p.x+dx/norm*speed*dt,TEAM(i)===0?LEFT+33:NET_X+33,TEAM(i)===0?NET_X-33:RIGHT-33);
      p.y=clamp(p.y+dy/norm*speed*dt,TOP+33,BOTTOM-33);
    };
    const point=(team:number,message:string)=>{
      const w=world.current;
      if(w.phase!=='play')return;
      w.score[team]++;w.best=Math.max(w.best,w.rally);w.message=message;
      w.serve=team;w.phase=w.score[team]>=7?'ended':'point';w.winner=w.phase==='ended'?team:-1;
      w.countdown=1.5;w.seq++;publish();
    };
    const strike=(i:number,lob:boolean,smash:boolean)=>{
      const w=world.current,b=w.ball,p=w.players[i],side=TEAM(i),dir=side===0?1:-1;
      if(w.phase!=='play'||b.lastTeam===side||p.cool>0)return;
      if(Math.hypot((b.x-p.x)*1,(b.y-p.y)*1.1)>75||b.z>155)return;
      const superShot=smash&&p.power>=90;
      const aimY=clamp((w.players.filter((_,k)=>TEAM(k)!==side).reduce((s,enemy)=>s+enemy.y,0)/2-360)*-.45,-115,115);
      b.vx=dir*(superShot?1020:lob?510:670+Math.min(w.rally,12)*15);
      b.vy=aimY+(p.y-360)*-.30+(Math.random()-.5)*35;
      b.vz=superShot?285:lob?460:315;
      b.z=Math.max(superShot?45:28,b.z);
      b.lastTeam=side;b.bounces=0;b.power=superShot;b.trail=[];
      p.cool=superShot?.45:.28;p.swing=.20;p.flash=superShot?1:.38;
      p.power=superShot?0:clamp(p.power+22,0,100);
      w.rally++;w.best=Math.max(w.best,w.rally);
    };
    const bots=(dt:number,hard:boolean)=>{
      const w=world.current,b=w.ball;
      for(let i=1;i<4;i++){
        const p=w.players[i],team=TEAM(i);
        const left=team===0;
        let tx=SPAWNS[i].x,ty=SPAWNS[i].y;
        if(w.phase==='play' && b.lastTeam!==team){
          const landingTime=(b.vz+Math.sqrt(Math.max(0,b.vz*b.vz+2*950*Math.max(0,b.z))))/950;
          const flight=clamp(landingTime*(hard?.77:.91),.12,.9);
          tx=clamp(b.x+b.vx*flight,left?LEFT+33:NET_X+33,left?NET_X-33:RIGHT-33);
          ty=clamp(b.y+b.vy*flight,TOP+35,BOTTOM-35);
          // Partner AI tries not to collide with the human.
          if(i===2&&Math.abs(w.players[0].y-ty)<90)ty=clamp(ty+120,TOP+40,BOTTOM-40);
        }
        const dx=tx-p.x,dy=ty-p.y,mag=Math.hypot(dx,dy)||1;
        const speed=hard&&team===1?560:hard?350:team===1?310:325;
        p.x=clamp(p.x+dx/mag*Math.min(speed*dt,mag),left?LEFT+33:NET_X+33,left?NET_X-33:RIGHT-33);
        p.y=clamp(p.y+dy/mag*Math.min(speed*dt,mag),TOP+33,BOTTOM-33);
        p.cool=Math.max(0,p.cool-dt);p.swing=Math.max(0,p.swing-dt);p.flash=Math.max(0,p.flash-dt*3);
        p.power=Math.min(100,p.power+dt*(hard?17:6));
        if(b.lastTeam!==team&&Math.hypot(b.x-p.x,b.y-p.y)<(hard?78:58) && b.z<130){
          // Legendary AI reacts quickly, nearly never missing a playable ball.
          if(hard||Math.random()<.29)strike(i,Math.random()<.12,hard&&p.power>=90);
        }
      }
    };
    const step=(dt:number)=>{
      const w=world.current,k=controlKeys();
      const mySeat=isPractice.current?0:playerSeat.current;
      if(mySeat>=0 && mySeat<=3 && w.phase!=='lobby'&&w.phase!=='ended'){
        move(w.players[mySeat],mySeat,k,dt);
        const hit=k.hit||k.lob||k.smash;
        if(hit&&!swingHold.current){
          if(mySeat===0){strike(0,k.lob,k.smash);}else{
            strike(mySeat,k.lob,k.smash);send({type:'d_input',x:w.players[mySeat].x,y:w.players[mySeat].y,swing:true,lob:k.lob,smash:k.smash});
          }
        }
        swingHold.current=hit;
      } else swingHold.current=false;
      const authoritative=isPractice.current || (online.current && playerSeat.current===0);
      if(!authoritative)return;
      if(isPractice.current)bots(dt,god.current);
      else {
        // The host updates cooldowns of remote players (their browsers move independently).
        for(let i=1;i<4;i++){const p=w.players[i];p.cool=Math.max(0,p.cool-dt);p.swing=Math.max(0,p.swing-dt);p.flash=Math.max(0,p.flash-dt*2.6);}
        for(const [key,value]of Object.entries(remoteSwing.current))strike(Number(key),value.lob,value.smash);
        remoteSwing.current={};
      }
      if(w.phase==='countdown'||w.phase==='point'){
        w.countdown-=dt;
        if(w.countdown<=0){
          if(w.phase==='point'){
            w.players.forEach((p,i)=>{p.x=SPAWNS[i].x;p.y=SPAWNS[i].y;p.cool=0;p.swing=0;});
          }
          w.phase='play';w.rally=0;w.seq++;
          const b=w.ball=newBall(w.serve);
          b.vx=w.serve===0?550:-550;b.vy=(Math.random()-.5)*75;b.vz=320;
          publish();
        }
        return;
      }
      if(w.phase!=='play')return;
      const b=w.ball,oldx=b.x;
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.vz-=950*dt;
      b.trail.push({x:b.x,y:b.y,z:b.z});if(b.trail.length>13)b.trail.shift();
      if((oldx-NET_X)*(b.x-NET_X)<=0 && b.z<38)return point(1-b.lastTeam,'ネットにかかった！');
      if(b.y<TOP||b.y>BOTTOM||b.x<LEFT||b.x>RIGHT)return point(1-b.lastTeam,'アウト！');
      if(b.z<=0){
        if(b.bounces>=1)return point(b.lastTeam,'ツーバウンド！');
        if((b.x<NET_X?0:1)===b.lastTeam)return point(1-b.lastTeam,'自分のコートにバウンド！');
        b.bounces=1;b.z=0;b.vz=Math.abs(b.vz)*.56;b.vx*=.77;b.vy*=.65;
      }
    };
    const frame=(now:number)=>{
      const dt=Math.min(.035,(now-previous)/1000);previous=now;
      step(dt);
      if(online.current&&!isPractice.current){
        if(playerSeat.current===0 && now-lastSnapshot.current>45){
          send({type:'d_snapshot',world:world.current});lastSnapshot.current=now;
        }else if(playerSeat.current>0 && now-lastInput.current>45){
          const p=world.current.players[playerSeat.current];if(p)send({type:'d_input',x:p.x,y:p.y,swing:false});
          lastInput.current=now;
        }
      }
      drawCourt(ctx,world.current,now,isPractice.current?0:playerSeat.current,isPractice.current,god.current);
      if(now-lastUi.current>170){
        const w=world.current;setScore(current=>current[0]!==w.score[0]||current[1]!==w.score[1]?[...w.score]as [number,number]:current);
        setPhase(current=>current!==w.phase?w.phase:current);
        setRally(current=>current!==w.rally?w.rally:current);
        lastUi.current=now;
      }
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);
    return()=>cancelAnimationFrame(raf);
  },[]);
  const copyInvite=async()=>{
    const url=new URL(location.href);url.searchParams.set('doubles','1');url.searchParams.set('room',room.toUpperCase());
    try{await navigator.clipboard.writeText(url.toString());setCopied(true);setTimeout(()=>setCopied(false),2000);}
    catch{setNotice(`招待リンク：${url}`);}
  };
  const myTeam=seat<0?'':TEAM(seat)===0?'レッド':'イエロー';
  const pad = (label:string, code:string, accent=false) => <button key={code} className={`rounded-lg select-none touch-none px-4 py-3 text-sm font-black active:scale-95 ${accent?'bg-amber-400 text-slate-950':'bg-slate-700 text-white'}`}
    onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);buttons.current[code]=true;}}
    onPointerUp={()=>{buttons.current[code]=false;}}
    onPointerCancel={()=>{buttons.current[code]=false;}}
    onLostPointerCapture={()=>{buttons.current[code]=false;}}>{label}</button>;
  return <div className="min-h-screen bg-[#081426] text-slate-100 px-3 py-5 md:p-7">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div><div className="flex items-center gap-3"><button className="rounded-xl bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700" onClick={onBack}>← 通常のゲームに戻る</button><h1 className="text-2xl font-black">🎾 テニス・ダブルス ARENA</h1></div>
        <p className="mt-1 text-sm text-cyan-200">オンライン4人対戦 / カメラ体感操作 / 伝説級CPU / 必殺スマッシュ</p></div>
        <span className="rounded-full border border-sky-500/40 bg-sky-950 px-4 py-2 text-sm font-bold">{practice?'CPU練習':status==='ready'?'4人揃いました！':status==='waiting'?`参加中 ${roster.length}/4人`:status==='connecting'?'接続中':'オンライン待機'}</span>
      </header>
      <section className="mb-4 rounded-2xl border border-cyan-700/50 bg-slate-900 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs font-bold text-slate-300">4人共通の部屋コード<input className="block mt-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white" value={room} onChange={e=>setRoom(e.target.value.toUpperCase())} disabled={status!=='off'} maxLength={24} /></label>
          <button className="rounded-lg bg-cyan-400 px-4 py-2 font-black text-slate-950 disabled:opacity-40" disabled={status==='connecting'} onClick={status==='off'?connect:disconnect}>{status==='off'?'🌐 ルームに参加':'🔌 切断'}</button>
          <button className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold hover:bg-slate-800" onClick={copyInvite}>{copied?'✅ コピーしました':'🔗 招待リンクをコピー'}</button>
          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold hover:bg-emerald-500" onClick={()=>startPractice(false)}>🤖 CPUと練習</button>
          <button className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-black hover:bg-rose-500" onClick={()=>startPractice(true)}>👑 伝説級AIに挑戦</button>
        </div>
        <p role="status" className="mt-3 text-sm text-amber-200">{notice}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0,1,2,3].map(i=><div key={i} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${roster.includes(i)||practice?'border-cyan-500 bg-sky-950':'border-slate-700 bg-slate-800/60 text-slate-400'}`}>
            {i+1}P・{TEAM(i)===0?'🔴 レッド':'🟡 イエロー'} {practice?(i===0?'あなた':'CPU'):roster.includes(i)?i===seat?'あなた':'参加済み':'空席'}</div>)}
        </div>
      </section>
      <section className="relative overflow-hidden rounded-2xl border-2 border-sky-800 shadow-2xl">
        <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="ダブルスのテニスコート" className="block w-full" />
        <div className="absolute left-3 top-3 rounded-xl bg-slate-950/70 px-4 py-2 text-sm font-black sm:text-xl"><span className="text-rose-300">🔴 {score[0]}</span> <span className="text-white">―</span> <span className="text-yellow-300">{score[1]} 🟡</span></div>
        <div className="absolute bottom-3 right-3 rounded bg-slate-950/70 px-3 py-2 text-xs">{myTeam?`あなた：${seat+1}P ${myTeam}`:'4人でダブルス'} ・ {phaseJapanese[phase]} ・ラリー{rally}</div>
      </section>
      <div className="my-4 flex flex-wrap items-center gap-3">
        <button className="rounded-xl bg-amber-400 px-7 py-3 font-black text-slate-950 disabled:opacity-40" disabled={!(practice || status==='ready'&&seat===0)} onClick={startGame}>🏁 {phase==='ended'?'もう一度プレイ':'試合開始！'}</button>
        <button className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm hover:bg-slate-800 disabled:opacity-40" disabled={!practice&&seat!==0} onClick={resetGame}>↩ 試合リセット</button>
        <button className="rounded-xl border border-sky-600 bg-sky-950 px-4 py-3 font-bold text-sm" onClick={()=>setCameraEnabled(v=>!v)}>{cameraEnabled?'📷 カメラパネルを閉じる':'📷 カメラ操作を使う'}</button>
      </div>
      {cameraEnabled && <div className="mb-4"><MotionCamera compact onKeys={k=>{camera.current=k;}} /></div>}
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
        <span className="w-full text-xs font-semibold text-cyan-200">📱 スマホ・タブレット用タッチ操作</span>
        {pad('←','ArrowLeft')}{pad('↑','ArrowUp')}{pad('↓','ArrowDown')}{pad('→','ArrowRight')}
        {pad('🎾 打つ','KeyQ',true)}{pad('🎈 ロブ','KeyE')}{pad('💥 必殺','KeyF')}{pad('⚡ ダッシュ','ShiftLeft')}
      </div>
      <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm md:grid-cols-2">
        <div><strong className="text-cyan-300">ゲーム操作</strong><p className="mt-2 text-slate-300">WASD / 矢印：移動、Q / Space：ショット、E：ロブ、F：パワー100で必殺スマッシュ、Shift：ダッシュ。カメラ操作との併用も可能です。</p></div>
        <div><strong className="text-cyan-300">オンラインで遊ぶ方法</strong><p className="mt-2 text-slate-300">1人目が部屋を作成→招待リンクを3人に送る→4人が参加→1Pが試合開始。1Pと3P対2Pと4Pのチーム戦です。7点先取で勝利！</p></div>
      </div>
      <p className="mt-3 text-xs text-slate-400">オンライン対戦には稼働中のWebSocketサーバーが必要です。カメラにはブラウザのアクセス許可が必要です。体を振り回さず、安全な範囲で操作してください。</p>
    </div>
  </div>;
}
