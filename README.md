# ふたりでテニス（オンライン対戦対応）

2人対戦・CPU対戦・**オンライン対戦**ができるテニスゲームです。
オンライン対戦は WebSocket で2人をつなぐ方式です（ローカルは `server.ts`、Cloudflare では `worker/index.ts` が担当）。

## 起動方法

Node.js 20 以上が必要です。

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

## オンライン対戦のあそび方

1. 画面上の「5: オンライン対戦 🌐」を選ぶと、自動で部屋に入室します（先に入った人が **1P・左コート**）。
2. 📋 ボタンで **招待リンク** をコピーして、相手に送ります。
   （部屋コードを相手に伝えて、手入力で入ってもOKです）
3. 相手が入ると「対戦準備完了」になります。それぞれ自分のスタイル・努力値を決めます。
4. **1P が「オンライン試合開始！」** を押すと試合スタート。
5. 後から入った人は **2P・右コート** です。操作は WASD / 矢印キーのどちらでも可能です。

- 1P（ホスト）のブラウザでボールの物理計算を行い、2P へ約40回/秒で状況を送ります。
- 2P は自分のキャラ移動を手元で即時反映します（そのため操作は軽快ですが、1P側の回線が不安定だとボールがカクつくことがあります）。
- 相手が退出すると、自動で設定画面に戻ります。

## 同じネットワーク（LAN）で遊ぶ

`npm run dev` を動かしているPCのIPアドレスを調べ、相手が `http://<そのIP>:3000` を開けば対戦できます。

## Cloudflare で公開する（おすすめ）

Cloudflare には Node.js のサーバーを置けないため、このプロジェクトは
**Cloudflare Workers + Durable Objects** でオンライン対戦を動かします
（`worker/index.ts` と `wrangler.jsonc`）。部屋コードごとに Durable Object が1つ作られ、2人をつなぎます。

> ⚠️ **Cloudflare Pages ではなく「Workers」として** デプロイしてください。
> Pages に静的ファイルだけ置いても、WebSocket サーバーがないため「接続エラー」になります。

### 方法A: コマンドでデプロイ

```bash
npm install
npx wrangler login      # 初回のみ。ブラウザでCloudflareにログイン
npm run cf:deploy       # ビルド → デプロイ
```

完了すると `https://futari-de-tennis.<あなたのサブドメイン>.workers.dev` が発行されます。

### 方法B: GitHub連携 (Workers Builds)

1. このフォルダを GitHub にアップロード
2. Cloudflare ダッシュボード → **Workers & Pages** → **Create** → **Import a repository**（Workers側）
3. ビルドコマンド: `npm run build` / デプロイコマンド: `npx wrangler deploy`

### 手元でCloudflare環境をテストする

```bash
npm run cf:dev          # http://localhost:8787
```

### 無料プランについて

Durable Objects は無料プランでも使えます（`wrangler.jsonc` は SQLite 版で設定済み）。
ただしリクエスト数に日次上限があり、対戦中は WebSocket メッセージが大量に流れるため、
遊びすぎると上限に達する場合があります。たくさん遊ぶ場合は有料プラン（月$5〜）が安心です。

## Node サーバーで公開する（Render / Railway / VPS など）

```bash
npm install
npm run start:prod     # ビルドして本番モードで起動
```

ポートは環境変数 `PORT`（未指定は 3000）。HTTPS で公開すると自動的に `wss://` で接続します。

## 操作

| | 移動 | ジャンプ | 通常/シュート | ロブ |
|---|---|---|---|---|
| 1P | A / D | W | Q | E |
| 2P | ← / → | ↑ | / | \ |

スタート: Space / 7点先取で勝利
