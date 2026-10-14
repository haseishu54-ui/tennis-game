// Cloudflare Worker + Durable Objects 版のオンライン対戦サーバー
//  - 静的ファイル (dist) の配信
//  - /ws?room=XXXX への WebSocket 接続を、部屋ごとの Durable Object に振り分け
import { RoomHub, createConn, sanitizeRoomId } from '../shared/room.ts';

interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('WebSocket 接続が必要です', { status: 426 });
      }
      const roomId = sanitizeRoomId(url.searchParams.get('room'));
      if (!roomId) {
        return new Response('room パラメータが必要です', { status: 400 });
      }
      // 同じ部屋コード → 同じ Durable Object (=同じ場所で2人をつなぐ)
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      return stub.fetch(request);
    }

    if (url.pathname === '/healthz') {
      return Response.json({ ok: true });
    }

    return env.ASSETS.fetch(request);
  },
};

// 1つの部屋 = 1つの Durable Object
export class Room {
  private hub = new RoomHub();

  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket 接続が必要です', { status: 426 });
    }
    const roomId = sanitizeRoomId(new URL(request.url).searchParams.get('room'));

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const conn = createConn(
      (data) => server.send(data),
      () => server.readyState === WebSocket.OPEN,
    );

    server.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        // 部屋は Durable Object ごとに決まっているので、URL の部屋コードを正とする
        this.hub.onMessage(conn, event.data, roomId);
      }
    });
    server.addEventListener('close', () => {
      this.hub.onClose(conn);
      try {
        server.close();
      } catch {
        /* ignore */
      }
    });
    server.addEventListener('error', () => this.hub.onClose(conn));

    return new Response(null, { status: 101, webSocket: client });
  }
}
