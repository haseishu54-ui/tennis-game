// Shared room manager (Node WebSocket / Cloudflare Durable Object)
// Singles preserve the original protocol; doubles use four independent seats.
import { cleanInput } from './tennisProtocol.ts';
type RoomKind='singles'|'doubles'|'3d-singles'|'3d-doubles';
const capacity=(kind:RoomKind)=>kind==='doubles'||kind==='3d-doubles'?4:2;
export type Seat = 0 | 1 | 2 | 3;
export interface Conn {
  send(data: string): void;
  isOpen(): boolean;
  roomId: string | null;
  playerIndex: Seat | null;
  cleaned: boolean;
}
export function createConn(send: (data: string) => void, isOpen: () => boolean): Conn {
  return { send, isOpen, roomId: null, playerIndex: null, cleaned: false };
}
interface PlayerConfig { style: unknown; ev: unknown; }
interface RoomClient { conn: Conn; playerIndex: Seat; }
interface RoomState {
  id: string;
  matchType: RoomKind;
  started:boolean;
  epoch:number;
  clients: RoomClient[];
  configs: (PlayerConfig | undefined)[];
}
const SINGLES_RELAY = new Set(['p2_input', 'p2_swing', 'sync_game', 'restart']);
const DOUBLES_RELAY = new Set(['d_input','d_snapshot','d_restart','d_emote']);
export function sanitizeRoomId(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
}
export class RoomHub {
  private rooms = new Map<string, RoomState>();
  get roomCount(): number { return this.rooms.size; }
  private sendTo(conn: Conn, payload: unknown) {
    if (!conn.isOpen()) return;
    try { conn.send(typeof payload === 'string' ? payload : JSON.stringify(payload)); }
    catch { /* socket shutdown handled via onClose */ }
  }
  private sendOthers(room: RoomState, from: Conn, payload: unknown) {
    for (const c of room.clients) if (c.conn !== from) this.sendTo(c.conn,payload);
  }
  private roster(room: RoomState) {
    return { playersCount:room.clients.length, capacity: capacity(room.matchType),
      playerIndices:room.clients.map(c=>c.playerIndex), matchType:room.matchType };
  }
  onMessage(conn: Conn, raw: string, forcedRoomId?: string) {
    try {
      if (raw.length > 100000) return;
      const msg = JSON.parse(raw);
      if (!msg || typeof msg.type !== 'string') return;
      if(msg.type==='ping'){this.sendTo(conn,{type:'pong',at:msg.at});return;}
      if (msg.type === 'join') {
        if (conn.roomId) return;
        const id = forcedRoomId || sanitizeRoomId(msg.roomId);
        if (!id) return this.sendTo(conn,{type:'error',message:'部屋コードが正しくありません'});
        const desired:RoomKind = ['doubles','3d-singles','3d-doubles'].includes(msg.matchType)?msg.matchType:'singles';
        let room=this.rooms.get(id);
        if (!room) { room={id,matchType:desired,clients:[],configs:[],started:false,epoch:0};this.rooms.set(id,room); }
        if (room.matchType !== desired) return this.sendTo(conn,{type:'error',message:'部屋の対戦モードが異なります。同じモードを選んでください'});
        const cap=capacity(desired);
        if (room.clients.length>=cap) return this.sendTo(conn,{type:'error',message:`部屋が満員です（定員${cap}名）`});
        const used=new Set(room.clients.map(c=>c.playerIndex));
        const idx=[0,1,2,3].find(i=>i<cap && !used.has(i as Seat)) as Seat;
        room.clients.push({conn,playerIndex:idx});
        conn.roomId=id;conn.playerIndex=idx;
        this.sendTo(conn,{type:'joined',roomId:id,playerIndex:idx,...this.roster(room),p1Config:room.configs[0],p2Config:room.configs[1]});
        this.sendOthers(room,conn,{type:'player_joined',playerIndex:idx,...this.roster(room)});
        return;
      }
      if (!conn.roomId || conn.playerIndex===null) return;
      const room=this.rooms.get(conn.roomId);
      if (!room) return;
      const seat=conn.playerIndex;
      if(room.matchType.startsWith('3d-')){
        if(msg.type==='t_start'&&seat===0&&room.clients.length===capacity(room.matchType)){
          room.started=true;room.epoch++;
          for(const c of room.clients)this.sendTo(c.conn,{type:'t_start',epoch:room.epoch});
        }else if(msg.type==='t_reset'&&seat===0){
          room.started=false;
          for(const c of room.clients)this.sendTo(c.conn,{type:'t_reset'});
        }else if(room.started&&msg.epoch===room.epoch){
          if(msg.type==='t_input'&&seat!==0){
            const host=room.clients.find(c=>c.playerIndex===0);
            if(host)this.sendTo(host.conn,{type:'t_input',seat,input:cleanInput(msg.input),epoch:room.epoch});
          }else if(msg.type==='t_snapshot'&&seat===0){
            this.sendOthers(room,conn,{type:'t_snapshot',world:msg.world,epoch:room.epoch});
          }
        }
        return;
      }
      if (msg.type==='config' && room.matchType==='singles') {
        room.configs[seat]={style:msg.style,ev:msg.ev};
        this.sendOthers(room,conn,{type:'config',playerIndex:seat,style:msg.style,ev:msg.ev});
      } else if (msg.type==='start' && room.matchType==='singles') {
        if (seat===0 && room.clients.length===2) this.sendOthers(room,conn,{type:'start'});
      } else if (room.matchType==='singles' && SINGLES_RELAY.has(msg.type)) {
        if (msg.type==='sync_game' && seat!==0) return;
        if ((msg.type==='p2_input'||msg.type==='p2_swing') && seat!==1) return;
        this.sendOthers(room,conn,raw);
      } else if (room.matchType==='doubles' && msg.type==='d_start') {
        if (seat!==0 || room.clients.length!==4) return;
        this.sendOthers(room,conn,{type:'d_start'});
      } else if (room.matchType==='doubles' && DOUBLES_RELAY.has(msg.type)) {
        if ((msg.type==='d_snapshot'||msg.type==='d_restart') && seat!==0) return;
        if (msg.type==='d_input' && seat===0) return;
        // Index is overwritten server-side: guests cannot forge a teammate's input.
        const payload = { ...msg, seat };
        if (msg.type==='d_input') {
          payload.x = Math.max(0, Math.min(1200, Number(msg.x)||0));
          payload.y = Math.max(0, Math.min(750, Number(msg.y)||0));
          payload.swing=Boolean(msg.swing);payload.lob=Boolean(msg.lob);payload.dash=Boolean(msg.dash);
        }
        this.sendOthers(room,conn,payload);
      }
    } catch { /* ignore malformed message */ }
  }
  onClose(conn: Conn) {
    if(conn.cleaned)return;
    conn.cleaned=true;
    if (!conn.roomId)return;
    const room=this.rooms.get(conn.roomId);
    if(!room)return;
    room.clients=room.clients.filter(c=>c.conn!==conn);
    room.started=false;
    room.configs[conn.playerIndex ?? 0]=undefined;
    if (!room.clients.length) { this.rooms.delete(conn.roomId);return; }
    this.sendOthers(room,conn,{type:'player_left',leftPlayerIndex:conn.playerIndex,...this.roster(room)});
  }
}
