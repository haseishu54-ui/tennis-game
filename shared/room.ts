// 部屋管理ロジック (Node サーバーと Cloudflare Durable Object の両方で共通利用)
// ※ DOM / Node 固有の API には依存しないこと

export interface Conn {
  send(data: string): void;
  isOpen(): boolean;
  roomId: string | null;
  playerIndex: 0 | 1 | null;
  cleaned: boolean;
}

export function createConn(send: (data: string) => void, isOpen: () => boolean): Conn {
  return { send, isOpen, roomId: null, playerIndex: null, cleaned: false };
}

interface PlayerConfig {
  style: unknown;
  ev: unknown;
}

interface RoomClient {
  conn: Conn;
  playerIndex: 0 | 1;
}

interface RoomState {
  id: string;
  clients: RoomClient[];
  configs: [PlayerConfig | undefined, PlayerConfig | undefined];
}

// 試合中に中継してよいメッセージ種別 (ホワイトリスト)
const RELAY_TYPES = new Set(['p2_input', 'p2_swing', 'sync_game', 'restart']);

export function sanitizeRoomId(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
}

export class RoomHub {
  private rooms = new Map<string, RoomState>();

  get roomCount(): number {
    return this.rooms.size;
  }

  private sendTo(conn: Conn, payload: unknown) {
    if (!conn.isOpen()) return;
    try {
      conn.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    } catch {
      /* 送信失敗は無視 (close イベントで後始末される) */
    }
  }

  private sendToOthers(room: RoomState, from: Conn, payload: unknown) {
    room.clients.forEach((c) => {
      if (c.conn !== from) this.sendTo(c.conn, payload);
    });
  }

  /** forcedRoomId: Durable Object のように接続先の部屋が決まっている場合に指定 */
  onMessage(conn: Conn, raw: string, forcedRoomId?: string) {
    try {
      const msg = JSON.parse(raw);
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'join') {
        if (conn.roomId) return; // すでに入室済み
        const roomId = forcedRoomId || sanitizeRoomId(msg.roomId);
        if (!roomId) {
          this.sendTo(conn, { type: 'error', message: '部屋コードが正しくありません' });
          return;
        }

        let room = this.rooms.get(roomId);
        if (!room) {
          room = { id: roomId, clients: [], configs: [undefined, undefined] };
          this.rooms.set(roomId, room);
        }

        if (room.clients.length >= 2) {
          this.sendTo(conn, { type: 'error', message: '部屋が満員です（定員2名）' });
          return;
        }

        // 空いている方の席 (1P優先) を割り当てる
        const used = new Set(room.clients.map((c) => c.playerIndex));
        const playerIndex: 0 | 1 = used.has(0) ? 1 : 0;

        room.clients.push({ conn, playerIndex });
        conn.roomId = roomId;
        conn.playerIndex = playerIndex;

        this.sendTo(conn, {
          type: 'joined',
          roomId,
          playerIndex,
          playersCount: room.clients.length,
          p1Config: room.configs[0],
          p2Config: room.configs[1],
        });

        this.sendToOthers(room, conn, {
          type: 'player_joined',
          playersCount: room.clients.length,
          playerIndex,
        });
        return;
      }

      // ここから先は入室済みでないと処理しない
      if (!conn.roomId || conn.playerIndex === null) return;
      const room = this.rooms.get(conn.roomId);
      if (!room) return;
      const myIndex = conn.playerIndex;

      if (msg.type === 'config') {
        // 自分の席の設定しか書き換えられない
        room.configs[myIndex] = { style: msg.style, ev: msg.ev };
        this.sendToOthers(room, conn, {
          type: 'config',
          playerIndex: myIndex,
          style: msg.style,
          ev: msg.ev,
        });
      } else if (msg.type === 'start') {
        // 開始できるのは2人揃っているときの1Pだけ
        if (myIndex !== 0 || room.clients.length < 2) return;
        this.sendToOthers(room, conn, { type: 'start' });
      } else if (RELAY_TYPES.has(msg.type)) {
        // p2_* は2P、sync_game は1Pからのみ受け付ける
        if (msg.type === 'sync_game' && myIndex !== 0) return;
        if ((msg.type === 'p2_input' || msg.type === 'p2_swing') && myIndex !== 1) return;
        this.sendToOthers(room, conn, raw);
      }
      // 'ping' など、その他の種別は無視 (接続維持用)
    } catch {
      /* 不正なメッセージは無視 */
    }
  }

  onClose(conn: Conn) {
    if (conn.cleaned) return;
    conn.cleaned = true;
    if (!conn.roomId) return;
    const room = this.rooms.get(conn.roomId);
    if (!room) return;

    room.clients = room.clients.filter((c) => c.conn !== conn);

    if (room.clients.length === 0) {
      this.rooms.delete(conn.roomId);
    } else {
      room.clients.forEach((c) => {
        this.sendTo(c.conn, {
          type: 'player_left',
          leftPlayerIndex: conn.playerIndex,
          playersCount: room.clients.length,
        });
      });
    }
    // 抜けた席の設定は破棄 (次に入る人に古い設定が残らないように)
    if (conn.playerIndex !== null) room.configs[conn.playerIndex] = undefined;
  }
}
