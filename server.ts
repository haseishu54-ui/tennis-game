// ローカル開発 / 自前サーバー用の Node サーバー
// (Cloudflare で動かす場合は worker/index.ts が使われます)
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomHub, createConn } from './shared/room.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const hub = new RoomHub();

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

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
  const conn = createConn(
    (data) => ws.send(data),
    () => ws.readyState === WebSocket.OPEN,
  );

  aliveMap.set(ws, true);
  ws.on('pong', () => aliveMap.set(ws, true));
  ws.on('message', (data: RawData) => hub.onMessage(conn, data.toString()));
  ws.on('close', () => hub.onClose(conn));
  ws.on('error', () => hub.onClose(conn));
});

async function start() {
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, rooms: hub.roomCount });
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
