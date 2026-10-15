/* Room transport: authoritative host, only game state crosses WebRTC. */
window.TennisRoom={async join(id,create){
  if(!window.Peer)throw Error('通信ライブラリがありません');
  const peer=new Peer(create?id:undefined), links=new Map(), states=new Map();
  let self,listener=()=>{},failure=()=>{},closed=false,host;
  const notify=()=>listener({peers:[...states].map(([key,presence])=>({peer:key,kind:'viewer',presence,isMe:key===self,sameTab:key===self}))});
  const send=(c,v)=>{if(c.open&&c.bufferSize<2)c.send(v);};
  const broadcast=()=>{const v={type:'state',states:[...states]};for(const c of links.values())send(c,v);notify();};
  const clean=()=>{closed=true;peer.destroy();states.clear();};
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('接続時間切れ')),12000);peer.on('open',()=>{clearTimeout(timer);resolve();});peer.on('error',e=>{clearTimeout(timer);reject(e);});});
    self=create?'0-host':peer.id;
    if(create){
      states.set(self,{s:-1});
      peer.on('connection',c=>{
        c.on('open',()=>{if(links.size>=3){send(c,{type:'full'});setTimeout(()=>c.close(),200);return;}links.set(c.peer,c);states.set(c.peer,{s:-1});broadcast();});
        c.on('data',v=>{if(!links.has(c.peer)||!v||v.type!=='patch')return;const p=v.patch||{};const old=states.get(c.peer)||{};const safe={};
          for(const k of ['s','x','z','w'])if(Number.isFinite(p[k]))safe[k]=p[k];
          if('s'in safe)safe.s=Math.max(-1,Math.min(3,Math.floor(safe.s)));
          if(Array.isArray(p.sv)&&p.sv.length===3&&p.sv.every(Number.isFinite))safe.sv=[Math.max(-1,Math.min(1,p.sv[0])),Math.max(-1,Math.min(1,p.sv[1])),Math.max(0,Math.min(1,p.sv[2]))];
          states.set(c.peer,{...old,...safe});broadcast();});
        const remove=()=>{links.delete(c.peer);states.delete(c.peer);broadcast();};c.on('close',remove);c.on('error',remove);
      });
    }else{
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('部屋が見つからないか接続できません')),15000);host=peer.connect(id,{reliable:false,serialization:'json'});
        host.on('data',v=>{if(v?.type==='full'){clearTimeout(timer);reject(Error('満席'));}if(v?.type==='state'&&Array.isArray(v.states)){states.clear();for(const [k,p]of v.states)states.set(k,p);clearTimeout(timer);notify();resolve();}});
        host.on('close',()=>{clearTimeout(timer);if(!closed){states.clear();notify();failure();}reject(Error('ホストが退出しました'));});host.on('error',e=>{clearTimeout(timer);reject(e);});
      });
    }
    peer.on('disconnected',()=>{if(!closed)failure();});
    return {onPeers(fn,err){listener=fn;failure=()=>{err();if(!create){document.getElementById('hint').textContent='ホストとの接続が終了しました。メニューから入り直してください。';}};notify();},async presence(patch){if(closed)return;states.set(self,{...states.get(self),...patch});if(create)broadcast();else{send(host,{type:'patch',patch});notify();}},async leave(){clean();}};
  }catch(e){clean();throw e;}
}};
