import React, { useEffect, useMemo, useRef, useState } from 'react';
import MotionCamera, { type MotionKeys } from './MotionCamera';
import courtBg from './assets/tennis-court-bg.png';

type Side = 'player' | 'cpu';
type Phase = 'serve' | 'rally' | 'point' | 'game';
type ShotKind = 'serve' | 'power-serve' | 'flat' | 'drive' | 'lob' | 'smash' | 'slice' | 'topspin';

type Fighter = {
  x: number; // -1..1
  y: number; // 0..1 depth (0 = near baseline)
  swing: number;
  run: boolean;
  lastDx: number;
  lastDy: number;
  cool: number;
  name: string;
};

type Ball = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lastHit: Side | null;
  bounces: number;
  kind: ShotKind;
  glow: number;
};

type World = {
  phase: Phase;
  server: Side;
  message: string;
  player: Fighter;
  cpu: Fighter;
  ball: Ball;
  score: [number, number];
  rally: number;
  bestRally: number;
  pointTimer: number;
};

const WIDTH = 1280;
const HEIGHT = 720;
const GRAVITY = 2.15;
const NONE: MotionKeys = { left: false, right: false, up: false, down: false, jump: false, hit: false, lob: false, dash: false };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function makeWorld(): World {
  return {
    phase: 'serve',
    server: 'player',
    message: 'R またはショット操作でサーブ',
    player: { x: 0, y: 0.18, swing: 0, run: false, lastDx: 0, lastDy: 0, cool: 0, name: 'YOU' },
    cpu: { x: 0, y: 0.83, swing: 0, run: false, lastDx: 0, lastDy: 0, cool: 0, name: 'CPU' },
    ball: { x: 0, y: 0.18, z: 0.08, vx: 0, vy: 0, vz: 0, lastHit: null, bounces: 0, kind: 'serve', glow: 0 },
    score: [0, 0],
    rally: 0,
    bestRally: 0,
    pointTimer: 0,
  };
}

function project(x: number, y: number, z: number, cameraShift: number, zoom = 1) {
  const t = clamp(y, 0, 1);
  const nearY = 640;
  const farY = 208;
  const center = WIDTH / 2 + cameraShift;
  const halfWidth = lerp(470, 140, t) * zoom;
  const screenX = center + x * halfWidth;
  const screenY = lerp(nearY, farY, t) - z * lerp(240, 110, t) * zoom;
  const scale = lerp(1.18, 0.48, t) * zoom;
  return { x: screenX, y: screenY, scale, halfWidth };
}

function drawPlayer(ctx: CanvasRenderingContext2D, fighter: Fighter, side: Side, cameraShift: number, now: number) {
  const p = project(fighter.x, fighter.y, 0, cameraShift);
  const scale = p.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const shirt = side === 'player' ? '#ff6482' : '#f0b51e';
  const outline = side === 'player' ? '#7b1232' : '#7a5600';
  const skin = '#ffd7b3';
  const facing = side === 'player' ? 1 : -1;
  const swing = fighter.swing > 0 ? -1.15 * facing : 0.12 * facing + Math.sin(now / 230) * 0.05;
  const step = fighter.run ? Math.sin(now / 110) * 5 : Math.sin(now / 240) * 1.5;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(0, 34, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  ctx.strokeStyle = skin;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-4, 0); ctx.lineTo(-6, 22 - Math.max(0, step));
  ctx.moveTo(4, 0); ctx.lineTo(6, 22 - Math.max(0, -step));
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, 18 - Math.max(0, step)); ctx.lineTo(-6, 27 - Math.max(0, step));
  ctx.moveTo(6, 18 - Math.max(0, -step)); ctx.lineTo(6, 27 - Math.max(0, -step));
  ctx.stroke();
  ctx.fillStyle = '#f9fafb';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(-2, 30 - Math.max(0, step), 6, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(10, 30 - Math.max(0, -step), 6, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // body
  ctx.fillStyle = shirt;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-13, -31, 26, 28, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(-12, -9, 24, 11, 4);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(-4, -36, 8, 6, 3);
  ctx.fill();

  // back arm
  ctx.strokeStyle = skin;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-11, -20);
  ctx.lineTo(-20, -11);
  ctx.stroke();

  // head + cap
  ctx.fillStyle = skin;
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, -48, 15.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, -51, 15.5, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(12 * facing, -47, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-3 * facing, -56, 6, 2.4, facing * -0.2, 0, Math.PI * 2);
  ctx.fill();

  // face
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(4 * facing, -47, 1.8, 0, Math.PI * 2);
  ctx.arc(10 * facing, -47, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9f1239';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(7 * facing, -42, 2.8, side === 'player' ? 0.22 : Math.PI + 0.22, side === 'player' ? Math.PI - 0.22 : Math.PI * 2 - 0.22);
  ctx.stroke();

  // front arm + racket
  const sx = 7 * facing;
  const sy = -22;
  const hx = sx + 15 * Math.cos(swing);
  const hy = sy + 15 * Math.sin(swing);
  ctx.strokeStyle = skin;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(swing);
  ctx.strokeStyle = '#7c5731';
  ctx.lineWidth = 3.3;
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.lineTo(15, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.strokeStyle = '#e6eef7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(27, 0, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.62)';
  ctx.lineWidth = 0.8;
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(27 + k * 4.6, -8); ctx.lineTo(27 + k * 4.6, 8); ctx.stroke(); }
  for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(17, k * 4.4); ctx.lineTo(37, k * 4.4); ctx.stroke(); }
  ctx.restore();

  // name
  ctx.fillStyle = 'rgba(11,18,32,0.75)';
  ctx.beginPath();
  ctx.roundRect(-30, -81, 60, 18, 9);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(side === 'player' ? 'YOU' : 'CPU', 0, -72);
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, ball: Ball, cameraShift: number) {
  const shadow = project(ball.x, ball.y, 0, cameraShift);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(shadow.x, shadow.y + 12, 11 * shadow.scale, 4 * shadow.scale, 0, 0, Math.PI * 2);
  ctx.fill();
  const p = project(ball.x, ball.y, ball.z, cameraShift);
  ctx.save();
  if (ball.glow > 0) {
    ctx.shadowColor = ball.kind === 'smash' || ball.kind === 'power-serve' ? '#fb923c' : ball.kind === 'lob' ? '#60a5fa' : '#bef264';
    ctx.shadowBlur = 20 + ball.glow * 12;
  }
  ctx.fillStyle = ball.kind === 'smash' || ball.kind === 'power-serve' ? '#fff1a0' : '#efff6f';
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(4, 8 * p.scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 1.2 * p.scale);
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(4, 8 * p.scale), -1.0, 1.0);
  ctx.stroke();
  ctx.restore();
}

function choosePlayerShot(input: MotionKeys, phase: Phase): ShotKind {
  if (phase === 'serve') return input.jump || input.dash ? 'power-serve' : 'serve';
  if (input.lob) return 'lob';
  if (input.jump) return 'smash';
  if (input.dash) return 'drive';
  if (input.up) return 'topspin';
  if (input.down) return 'slice';
  return 'flat';
}

export default function PerspectiveTennis({ onDoubles }: { onDoubles: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const cameraKeysRef = useRef<MotionKeys>(NONE);
  const worldRef = useRef<World>(makeWorld());
  const actionLatch = useRef({ hit: false, lob: false, jump: false, serve: false });
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [message, setMessage] = useState('R またはショット操作でサーブ');
  const [showCamera, setShowCamera] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [rally, setRally] = useState(0);
  const [bestRally, setBestRally] = useState(0);
  const [phase, setPhase] = useState<Phase>('serve');

  const bgImage = useMemo(() => {
    const img = new Image();
    img.src = courtBg;
    return img;
  }, []);

  useEffect(() => {
    bgRef.current = bgImage;
  }, [bgImage]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      keysRef.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    const blur = () => { keysRef.current = {}; cameraKeysRef.current = NONE; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const commitUi = () => {
      const w = worldRef.current;
      setScore([...w.score] as [number, number]);
      setMessage(w.message);
      setRally(w.rally);
      setBestRally(w.bestRally);
      setPhase(w.phase);
    };

    const resetBallForServe = () => {
      const w = worldRef.current;
      if (w.server === 'player') {
        w.ball = { x: clamp(w.player.x + 0.08, -0.65, 0.65), y: 0.19, z: 0.08, vx: 0, vy: 0, vz: 0, lastHit: null, bounces: 0, kind: 'serve', glow: 0 };
      } else {
        w.ball = { x: clamp(w.cpu.x - 0.08, -0.65, 0.65), y: 0.81, z: 0.08, vx: 0, vy: 0, vz: 0, lastHit: null, bounces: 0, kind: 'serve', glow: 0 };
      }
    };

    const awardPoint = (winner: Side, text: string) => {
      const w = worldRef.current;
      if (winner === 'player') w.score[0] += 1; else w.score[1] += 1;
      w.bestRally = Math.max(w.bestRally, w.rally);
      w.rally = 0;
      if (w.score[0] >= 7 || w.score[1] >= 7) {
        w.phase = 'game';
        w.message = winner === 'player' ? `YOU WIN! ${text}` : `CPU WIN! ${text}`;
        w.pointTimer = 999;
      } else {
        w.phase = 'point';
        w.message = text;
        w.server = winner;
        w.pointTimer = 1.35;
      }
      commitUi();
    };

    const hitBall = (by: Side, kind: ShotKind, moveX = 0, moveY = 0) => {
      const w = worldRef.current;
      const from = by === 'player' ? w.player : w.cpu;
      const targetDepth = by === 'player' ? clamp(0.74 + Math.random() * 0.12, 0.68, 0.92) : clamp(0.26 - Math.random() * 0.12, 0.08, 0.34);
      let targetX = clamp((by === 'player' ? moveX * 0.85 : -moveX * 0.85) + (Math.random() - 0.5) * 0.2, -0.82, 0.82);
      if (kind === 'lob') targetX = clamp(targetX * 0.85, -0.78, 0.78);
      if (kind === 'slice') targetX = clamp(targetX + (by === 'player' ? 0.18 : -0.18), -0.84, 0.84);
      if (kind === 'smash') targetX = clamp(targetX * 1.15, -0.88, 0.88);

      let duration = 0.9;
      let peak = 0.3;
      let glow = 0.35;
      if (kind === 'power-serve') { duration = 0.58; peak = 0.18; glow = 0.95; }
      else if (kind === 'serve') { duration = 0.74; peak = 0.2; glow = 0.5; }
      else if (kind === 'drive') { duration = 0.68; peak = 0.14; glow = 0.75; }
      else if (kind === 'smash') { duration = 0.54; peak = 0.12; glow = 1; }
      else if (kind === 'lob') { duration = 1.2; peak = 0.5; glow = 0.52; }
      else if (kind === 'slice') { duration = 0.92; peak = 0.18; glow = 0.55; }
      else if (kind === 'topspin') { duration = 0.78; peak = 0.24; glow = 0.6; }

      const startX = w.ball.x;
      const startY = w.ball.y;
      const startZ = Math.max(w.ball.z, by === 'player' ? 0.1 : 0.08);
      w.ball.vx = (targetX - startX) / duration;
      w.ball.vy = (targetDepth - startY) / duration;
      w.ball.vz = (4 * peak) / duration + 0.45;
      w.ball.x = startX;
      w.ball.y = startY;
      w.ball.z = startZ;
      w.ball.lastHit = by;
      w.ball.bounces = 0;
      w.ball.kind = kind;
      w.ball.glow = glow;
      from.swing = 0.26;
      from.cool = 0.22;
      w.phase = 'rally';
      if (by === 'player' && kind !== 'serve' && kind !== 'power-serve') w.rally += 1;
      w.message = by === 'player'
        ? kind === 'smash' ? 'スマッシュ！' : kind === 'drive' ? '走り込みショット！' : kind === 'lob' ? 'ロブ！' : kind === 'slice' ? 'スライス！' : kind === 'topspin' ? 'トップスピン！' : 'ラリー中'
        : kind === 'smash' ? 'CPUスマッシュ！' : 'CPUリターン';
      commitUi();
    };

    const serveIfPossible = (by: Side, power: boolean) => {
      const w = worldRef.current;
      if (w.phase !== 'serve' || w.server !== by) return;
      hitBall(by, power ? 'power-serve' : 'serve', by === 'player' ? w.player.lastDx : w.cpu.lastDx, 0);
    };

    const updatePlayer = (dt: number, now: number) => {
      const w = worldRef.current;
      const k = keysRef.current;
      const c = cameraKeysRef.current;
      const left = !!(k.KeyA || k.ArrowLeft || c.left);
      const right = !!(k.KeyD || k.ArrowRight || c.right);
      const up = !!(k.KeyW || k.ArrowUp || c.up);
      const down = !!(k.KeyS || k.ArrowDown || c.down);
      const dash = !!(k.ShiftLeft || k.ShiftRight || c.dash);
      const jump = !!(k.KeyF || c.jump);
      const hit = !!(k.Space || k.KeyQ || c.hit);
      const lob = !!(k.KeyE || c.lob);
      const serveBtn = !!k.KeyR;

      const dx = (right ? 1 : 0) - (left ? 1 : 0);
      const dy = (up ? 1 : 0) - (down ? 1 : 0);
      const len = Math.hypot(dx, dy) || 1;
      const sp = dash ? 1.75 : 1.05;
      w.player.x = clamp(w.player.x + (dx / len) * dt * 1.12 * sp, -0.88, 0.88);
      w.player.y = clamp(w.player.y + (dy / len) * dt * 0.55 * sp, 0.08, 0.45);
      w.player.run = dash || Math.abs(dx) + Math.abs(dy) > 1;
      w.player.lastDx = dx / len || 0;
      w.player.lastDy = dy / len || 0;
      w.player.cool = Math.max(0, w.player.cool - dt);
      w.player.swing = Math.max(0, w.player.swing - dt * 1.9);

      const hitPressed = hit && !actionLatch.current.hit;
      const lobPressed = lob && !actionLatch.current.lob;
      const jumpPressed = jump && !actionLatch.current.jump;
      const servePressed = serveBtn && !actionLatch.current.serve;
      actionLatch.current.hit = hit;
      actionLatch.current.lob = lob;
      actionLatch.current.jump = jump;
      actionLatch.current.serve = serveBtn;

      const wantAction = hitPressed || lobPressed || jumpPressed;
      if ((servePressed || wantAction) && w.phase === 'serve' && w.server === 'player') {
        serveIfPossible('player', jump || dash);
        return;
      }

      if (wantAction && w.phase === 'rally' && w.player.cool <= 0) {
        const ball = w.ball;
        const close = Math.hypot(ball.x - w.player.x, (ball.y - w.player.y) * 1.55);
        const canHit = ball.y < 0.53 && close < 0.22 && ball.z < (jumpPressed ? 0.42 : 0.28);
        if (canHit) {
          const input: MotionKeys = { left, right, up, down, hit, lob, jump, dash };
          hitBall('player', choosePlayerShot(input, w.phase), w.player.lastDx, w.player.lastDy);
        }
      }

      if (w.phase === 'serve' && w.server === 'player') {
        w.ball.x = clamp(w.player.x + 0.09, -0.78, 0.78);
        w.ball.y = w.player.y + 0.01;
        w.ball.z = 0.08 + Math.sin(now / 170) * 0.01;
      }
    };

    const updateCpu = (dt: number) => {
      const w = worldRef.current;
      w.cpu.cool = Math.max(0, w.cpu.cool - dt);
      w.cpu.swing = Math.max(0, w.cpu.swing - dt * 1.8);
      const b = w.ball;
      let targetX = 0;
      let targetY = 0.8;
      let run = false;
      if (w.phase === 'serve' && w.server === 'cpu') {
        targetX = 0.05;
        targetY = 0.82;
      } else if (w.phase === 'rally' && b.lastHit === 'player') {
        targetX = clamp(b.x + b.vx * 0.18, -0.84, 0.84);
        targetY = clamp(b.y + b.vy * 0.3, 0.56, 0.92);
        run = Math.hypot(targetX - w.cpu.x, targetY - w.cpu.y) > 0.18;
      } else {
        targetX = 0;
        targetY = 0.79;
      }
      const sx = targetX - w.cpu.x;
      const sy = targetY - w.cpu.y;
      const dist = Math.hypot(sx, sy) || 1;
      const speed = run ? 1.22 : 0.82;
      w.cpu.x = clamp(w.cpu.x + (sx / dist) * dt * speed, -0.88, 0.88);
      w.cpu.y = clamp(w.cpu.y + (sy / dist) * dt * speed * 0.8, 0.55, 0.94);
      w.cpu.run = run;
      w.cpu.lastDx = sx / dist;
      w.cpu.lastDy = sy / dist;

      if (w.phase === 'serve' && w.server === 'cpu' && w.cpu.cool <= 0) {
        w.cpu.cool = 0.8;
        serveIfPossible('cpu', Math.random() < 0.35);
      }

      if (w.phase === 'rally' && b.lastHit === 'player' && w.cpu.cool <= 0) {
        const close = Math.hypot(b.x - w.cpu.x, (b.y - w.cpu.y) * 1.55);
        if (b.y > 0.5 && close < 0.2 && b.z < 0.34) {
          const options: ShotKind[] = ['flat', 'slice', 'topspin', 'lob'];
          const shot = b.z > 0.22 ? 'smash' : options[Math.floor(Math.random() * options.length)];
          hitBall('cpu', shot, w.cpu.lastDx, w.cpu.lastDy);
        }
      }

      if (w.phase === 'serve' && w.server === 'cpu') {
        w.ball.x = clamp(w.cpu.x - 0.08, -0.78, 0.78);
        w.ball.y = w.cpu.y - 0.02;
        w.ball.z = 0.08 + Math.sin(performance.now() / 160) * 0.012;
      }
    };

    const updateBall = (dt: number) => {
      const w = worldRef.current;
      if (w.phase !== 'rally') return;
      const b = w.ball;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.vz -= GRAVITY * dt;
      b.glow = Math.max(0, b.glow - dt * 0.65);

      if (b.x < -0.96 || b.x > 0.96 || b.y < 0.02 || b.y > 0.98) {
        awardPoint(b.lastHit === 'player' ? 'cpu' : 'player', 'アウト！');
        return;
      }

      if (b.z <= 0) {
        b.z = 0;
        b.bounces += 1;
        if (b.bounces >= 2) {
          awardPoint(b.y < 0.5 ? 'cpu' : 'player', b.y < 0.5 ? '取り切れず失点' : 'ナイスショット！');
          return;
        }
        b.vz = Math.abs(b.vz) * (b.kind === 'slice' ? 0.38 : b.kind === 'lob' ? 0.7 : 0.52);
        if (b.kind === 'topspin') b.vy *= 1.15;
        if (b.kind === 'slice') b.vx *= 1.18;
      }
    };

    const draw = (now: number) => {
      const w = worldRef.current;
      const cameraShift = clamp(w.player.x * 82 + (w.ball.x - w.player.x) * 30, -90, 90);
      const zoom = 1 + clamp((0.34 - w.player.y) * 0.12, -0.03, 0.06);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // sky fallback
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, '#1aa2ff');
      g.addColorStop(0.65, '#7dd6ff');
      g.addColorStop(1, '#ff8d59');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const bg = bgRef.current;
      if (bg?.complete) {
        ctx.save();
        const bgScale = 1.08 * zoom;
        const dw = WIDTH * bgScale;
        const dh = HEIGHT * bgScale;
        ctx.drawImage(bg, (WIDTH - dw) / 2 - cameraShift * 0.35, (HEIGHT - dh) / 2 + 14, dw, dh);
        ctx.restore();
      }

      // slight focus tint to unify scene
      ctx.fillStyle = 'rgba(0, 18, 36, 0.05)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // aim marker
      if (w.phase === 'rally' && w.ball.lastHit === 'cpu') {
        const t = clamp((w.ball.y - 0.04) / Math.max(0.001, (0.5 - 0.04)), 0, 1);
        const landX = w.ball.x + w.ball.vx * (1 - t) * 0.26;
        const p = project(landX, clamp(0.22, 0.08, 0.45), 0, cameraShift);
        ctx.strokeStyle = 'rgba(250,204,21,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 10, 22 * p.scale, 8 * p.scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // draw far object first
      const farFirst: Array<[Fighter, Side]> = w.cpu.y > w.player.y ? [[w.cpu, 'cpu'], [w.player, 'player']] : [[w.player, 'player'], [w.cpu, 'cpu']];
      farFirst.forEach(([f, side]) => drawPlayer(ctx, f, side, cameraShift, now));
      drawBall(ctx, w.ball, cameraShift);

      // center net emphasis
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const leftNet = project(-0.46, 0.5, 0, cameraShift, zoom);
      const rightNet = project(0.46, 0.5, 0, cameraShift, zoom);
      ctx.moveTo(leftNet.x, leftNet.y + 8);
      ctx.lineTo(rightNet.x, rightNet.y + 8);
      ctx.stroke();

      // HUD
      ctx.fillStyle = 'rgba(5,10,20,0.58)';
      ctx.beginPath();
      ctx.roundRect(24, 20, 360, 88, 18);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(WIDTH - 354, 20, 330, 88, 18);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(WIDTH / 2 - 155, 20, 310, 84, 18);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 17px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('PERSPECTIVE TENNIS', 44, 48);
      ctx.font = '500 15px system-ui';
      ctx.fillStyle = '#bfe4ff';
      ctx.fillText(`状態: ${w.phase === 'serve' ? 'サーブ' : w.phase === 'rally' ? 'ラリー' : w.phase === 'point' ? 'ポイント間' : '試合終了'}`, 44, 76);
      ctx.fillText(`ラリー ${w.rally} / 最長 ${w.bestRally}`, 44, 98);

      ctx.textAlign = 'center';
      ctx.font = '900 46px system-ui';
      ctx.fillStyle = '#fb7185';
      ctx.fillText(String(w.score[0]), WIDTH / 2 - 68, 65);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 30px system-ui';
      ctx.fillText('—', WIDTH / 2, 63);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 46px system-ui';
      ctx.fillText(String(w.score[1]), WIDTH / 2 + 68, 65);
      ctx.font = '600 15px system-ui';
      ctx.fillStyle = '#d6efff';
      ctx.fillText('7点先取', WIDTH / 2, 94);

      ctx.textAlign = 'right';
      ctx.font = '700 16px system-ui';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText('球種変化', WIDTH - 44, 46);
      ctx.font = '500 14px system-ui';
      ctx.fillStyle = '#cde8ff';
      ctx.fillText('走りながら打つ: ドライブ', WIDTH - 44, 68);
      ctx.fillText('前に入る: トップスピン / 下がる: スライス', WIDTH - 44, 88);

      ctx.fillStyle = 'rgba(5,10,20,0.58)';
      ctx.beginPath();
      ctx.roundRect(WIDTH / 2 - 260, HEIGHT - 74, 520, 44, 16);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px system-ui';
      ctx.fillText(w.message, WIDTH / 2, HEIGHT - 46);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.035, (now - last) / 1000);
      last = now;
      const w = worldRef.current;
      if (w.phase === 'point') {
        w.pointTimer -= dt;
        if (w.pointTimer <= 0) {
          w.phase = 'serve';
          w.message = w.server === 'player' ? 'R またはショット操作でサーブ' : 'CPUサーブ';
          resetBallForServe();
          commitUi();
        }
      } else if (w.phase !== 'game') {
        updatePlayer(dt, now);
        updateCpu(dt);
        updateBall(dt);
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    };

    resetBallForServe();
    commitUi();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const resetMatch = () => {
    worldRef.current = makeWorld();
    setScore([0, 0]);
    setMessage('R またはショット操作でサーブ');
    setRally(0);
    setBestRally(0);
    setPhase('serve');
  };

  const fullScreen = async () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) await document.exitFullscreen().catch(() => {});
    else await el.requestFullscreen().catch(() => {});
  };

  return (
    <div className="perspective-page">
      <style>{`
        .perspective-page{min-height:100vh;background:radial-gradient(circle at top,#123c69 0%,#081224 48%,#040a16 100%);padding:20px;color:#f8fafc;font-family:system-ui, sans-serif;}
        .perspective-shell{max-width:1580px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.9fr) minmax(340px,0.95fr);gap:18px;align-items:start;}
        .perspective-card{background:rgba(8,14,28,.78);backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.16);border-radius:24px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden;}
        .perspective-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid rgba(148,163,184,.14);}
        .perspective-title{font-size:clamp(24px,2vw,34px);font-weight:900;margin:0 0 6px;display:flex;align-items:center;gap:10px;}
        .perspective-sub{margin:0;color:#c5defa;font-size:14px;line-height:1.6;}
        .perspective-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;}
        .perspective-btn{border:none;border-radius:14px;padding:11px 14px;font-weight:800;color:white;background:#2563eb;cursor:pointer;box-shadow:0 8px 20px rgba(37,99,235,.25);}
        .perspective-btn.secondary{background:#1e293b;box-shadow:none;border:1px solid rgba(148,163,184,.18);}
        .perspective-btn.accent{background:#ec4899;box-shadow:0 8px 20px rgba(236,72,153,.25);}
        .perspective-btn.success{background:#059669;box-shadow:0 8px 20px rgba(5,150,105,.25);}
        .perspective-canvas-wrap{padding:14px;}
        .perspective-canvas{width:100%;aspect-ratio:16/9;border-radius:22px;background:#08111f;display:block;border:1px solid rgba(148,163,184,.12);}
        .perspective-side{display:flex;flex-direction:column;gap:18px;}
        .perspective-section{padding:16px 18px;}
        .perspective-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
        .perspective-badge{padding:12px 14px;border-radius:18px;background:rgba(30,41,59,.9);border:1px solid rgba(148,163,184,.16);}
        .perspective-badge h4{margin:0 0 6px;font-size:13px;color:#bfe4ff;}
        .perspective-badge strong{font-size:22px;}
        .perspective-list{margin:0;padding-left:18px;color:#dbeafe;line-height:1.7;font-size:14px;}
        .perspective-note{margin-top:12px;padding:12px 14px;border-radius:16px;background:rgba(15,23,42,.84);border:1px solid rgba(148,163,184,.12);font-size:14px;color:#d9ecff;line-height:1.65;}
        @media (max-width: 1180px){.perspective-shell{grid-template-columns:1fr;}.perspective-actions{justify-content:flex-start;}}
      `}</style>

      <div ref={shellRef} className="perspective-shell">
        <div className="perspective-card">
          <div className="perspective-head">
            <div>
              <h1 className="perspective-title">🎾 3D視点テニス</h1>
              <p className="perspective-sub">
                添付いただいたコート画像を背景に、奥行きのある視点でプレイできます。<br />
                走りながら打つと速い球、前に入るとトップスピン、下がるとスライス、Fでスマッシュ、Eでロブ、Rでサーブです。
              </p>
            </div>
            <div className="perspective-actions">
              <button className="perspective-btn success" onClick={fullScreen}>⛶ 全画面</button>
              <button className="perspective-btn" onClick={resetMatch}>↺ リセット</button>
              <button className="perspective-btn secondary" onClick={() => setShowCamera(v => !v)}>{showCamera ? '📷 カメラを隠す' : '📷 カメラを表示'}</button>
              <button className="perspective-btn accent" onClick={onDoubles}>4人ダブルスへ</button>
            </div>
          </div>
          <div className="perspective-canvas-wrap">
            <canvas ref={canvasRef} className="perspective-canvas" width={WIDTH} height={HEIGHT} />
          </div>
        </div>

        <div className="perspective-side">
          <div className="perspective-card perspective-section">
            <div className="perspective-grid">
              <div className="perspective-badge"><h4>スコア</h4><strong>{score[0]} - {score[1]}</strong></div>
              <div className="perspective-badge"><h4>状態</h4><strong>{phase === 'serve' ? 'サーブ' : phase === 'rally' ? 'ラリー' : phase === 'point' ? 'ポイント間' : '試合終了'}</strong></div>
              <div className="perspective-badge"><h4>現在のラリー</h4><strong>{rally}</strong></div>
              <div className="perspective-badge"><h4>最長ラリー</h4><strong>{bestRally}</strong></div>
            </div>
            <div className="perspective-note">{message}</div>
          </div>

          <div className="perspective-card perspective-section">
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>🎮 操作</h3>
            <ul className="perspective-list">
              <li><strong>移動</strong>: W/A/S/D または 矢印キー</li>
              <li><strong>走る</strong>: Shift（走ると速く移動し、球も速くなります）</li>
              <li><strong>通常ショット</strong>: Space / Q</li>
              <li><strong>ロブ</strong>: E</li>
              <li><strong>スマッシュ</strong>: F</li>
              <li><strong>サーブ</strong>: R（またはサーブ時にショット）</li>
              <li><strong>視点</strong>: プレイヤー位置とボールにあわせて自動で少し動きます</li>
            </ul>
            <div className="perspective-note">
              <strong>球種の変化</strong><br />
              ・走りながら打つ → ドライブ気味の速球<br />
              ・前に入って打つ → トップスピン<br />
              ・下がって打つ → スライス<br />
              ・高い打点 / F → スマッシュ<br />
              ・E → ロブ
            </div>
          </div>

          {showCamera && (
            <div className="perspective-card perspective-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>📷 カメラ体感操作</h3>
                <button className="perspective-btn secondary" onClick={() => setCameraEnabled(v => !v)}>{cameraEnabled ? 'カメラを閉じる' : 'カメラを開く'}</button>
              </div>
              {cameraEnabled ? (
                <MotionCamera onKeys={(keys) => { cameraKeysRef.current = keys; }} compact={false} />
              ) : (
                <div className="perspective-note">
                  カメラを開くと、<strong>左右の体移動</strong>で左右移動、<strong>前後の体移動</strong>で前後移動、<strong>腕を振る</strong>とショット、<strong>両手を上げる</strong>とロブ、<strong>大きく動く</strong>とダッシュになります。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
