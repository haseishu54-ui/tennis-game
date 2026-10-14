import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ---------- Room management ----------
interface RoomClient {
  ws: WebSocket;
  playerIndex: 0 | 1;
}

interface PlayerConfig {
  style: string;
  ev: unknown;
}

interface Room {
  id: string;
  clients: RoomClient[];
  configs: [PlayerConfig | undefined, PlayerConfig | undefined];
}

const rooms = new Map<string, Room>();

// 試合中に中継してよいメッセージ種別 (ホワイトリスト)
const RELAY_TYPES = new Set(['p2_input', 'p2_swing', 'sync_game', 'restart']);

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
}

function sendToOthers(room: Room, from: WebSocket, payload: unknown) {
  room.clients.forEach((c) => {
    if (c.ws !== from) send(c.ws, payload);
  });
}

function sanitizeRoomId(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
}

// 接続が生きているか定期的に確認 (ホスティング環境のアイドル切断対策)
const aliveMap = new WeakMap<WebSocket, boolean>();
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (aliveMap.get(ws) === false) {
      ws.terminate();
      return;
    }
    aliveMap.set(ws, false);
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  });
}, 25000);
wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (ws: WebSocket) => {
  let currentRoomId: string | null = null;
  let currentPlayerIndex: 0 | 1 | null = null;
  let cleaned = false;

  aliveMap.set(ws, true);
  ws.on('pong', () => aliveMap.set(ws, true));

  ws.on('message', (data: RawData) => {
    try {
      const raw = data.toString();
      const msg = JSON.parse(raw);
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'join') {
        if (currentRoomId) return; // すでに入室済み
        const roomId = sanitizeRoomId(msg.roomId);
        if (!roomId) {
          send(ws, { type: 'error', message: '部屋コードが正しくありません' });
          return;
        }

        let room = rooms.get(roomId);
        if (!room) {
          room = { id: roomId, clients: [], configs: [undefined, undefined] };
          rooms.set(roomId, room);
        }

        if (room.clients.length >= 2) {
          send(ws, { type: 'error', message: '部屋が満員です（定員2名）' });
          return;
        }

        // 空いている方の席 (1P優先) を割り当てる
        const used = new Set(room.clients.map((c) => c.playerIndex));
        const playerIndex: 0 | 1 = used.has(0) ? 1 : 0;

        room.clients.push({ ws, playerIndex });
        currentRoomId = roomId;
        currentPlayerIndex = playerIndex;

        send(ws, {
          type: 'joined',
          roomId,
          playerIndex,
          playersCount: room.clients.length,
          p1Config: room.configs[0],
          p2Config: room.configs[1],
        });

        sendToOthers(room, ws, {
          type: 'player_joined',
          playersCount: room.clients.length,
          playerIndex,
        });
        return;
      }

      // ここから先は入室済みでないと処理しない
      if (!currentRoomId || currentPlayerIndex === null) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;

      if (msg.type === 'config') {
        // 自分の席の設定しか書き換えられない
        room.configs[currentPlayerIndex] = { style: msg.style, ev: msg.ev };
        sendToOthers(room, ws, {
          type: 'config',
          playerIndex: currentPlayerIndex,
          style: msg.style,
          ev: msg.ev,
        });
      } else if (msg.type === 'start') {
        // 開始できるのは2人揃っているときの1Pだけ
        if (currentPlayerIndex !== 0 || room.clients.length < 2) return;
        sendToOthers(room, ws, { type: 'start' });
      } else if (RELAY_TYPES.has(msg.type)) {
        // p2_* は2P、sync_game は1Pからのみ受け付ける
        if (msg.type === 'sync_game' && currentPlayerIndex !== 0) return;
        if ((msg.type === 'p2_input' || msg.type === 'p2_swing') && currentPlayerIndex !== 1) return;
        sendToOthers(room, ws, raw);
      }
    } catch (err) {
      console.error('WS message error:', err);
    }
  });

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.clients = room.clients.filter((c) => c.ws !== ws);

    if (room.clients.length === 0) {
      rooms.delete(currentRoomId);
    } else {
      room.clients.forEach((c) => {
        send(c.ws, {
          type: 'player_left',
          leftPlayerIndex: currentPlayerIndex,
          playersCount: room.clients.length,
        });
      });
    }
    // 抜けた席の設定は破棄 (次に入る人の古い設定が残らないように)
    if (currentPlayerIndex !== null) room.configs[currentPlayerIndex] = undefined;
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

async function start() {
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(__dirname, 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
