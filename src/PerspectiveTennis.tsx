import React, { useEffect, useRef, useState } from 'react';
import MotionCamera, { type MotionKeys } from './MotionCamera';
import { drawHighDefinitionCourt, drawHighDefinitionNet } from './HighDefinitionCourt';

type Side = 'player' | 'cpu';
type Phase = 'serve' | 'rally' | 'point' | 'game';
type ShotKind = 'serve' | 'power-serve' | 'flat' | 'drive' | 'lob' | 'smash' | 'slice' | 'topspin';

type Fighter = {
  x: number; // -1..1
  y: number; // 0..1 depth (0 = near baseline)
  swing: number;
  run: boolean;
  gait: number;
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
  trail: {x:number;y:number;z:number}[];
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
    player: { x: 0, y: 0.18, swing: 0, run: false, gait: 0, lastDx: 0, lastDy: 0, cool: 0, name: 'YOU' },
    cpu: { x: 0, y: 0.83, swing: 0, run: false, gait: 0, lastDx: 0, lastDy: 0, cool: 0, name: 'CPU' },
    ball: { x: 0, y: 0.18, z: 0.08, vx: 0, vy: 0, vz: 0, lastHit: null, bounces: 0, kind: 'serve', glow: 0, trail: [] },
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
  // Swing changes only during a hit; no perpetual idle wobble.
  const swingTime = fighter.swing > 0 ? Math.sin((1 - fighter.swing / .26) * Math.PI) : 0;
  const swing = 0.12 * facing - 1.45 * facing * Math.max(0, swingTime);
  const step = fighter.run ? Math.sin(fighter.gait) * 6.5 : 0;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(0, 34, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (fighter.run) {
    const dir = fighter.lastDx > 0 ? -1 : 1;
    ctx.fillStyle = 'rgba(238,253,237,.24)';
    ctx.beginPath();ctx.ellipse(dir*19,29,6,3,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(dir*29,31,3.5,1.8,0,0,Math.PI*2);ctx.fill();
  }

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
  if (ball.trail.length > 1) {
    ctx.save();
    ball.trail.forEach((v,i) => {
      const pt=project(v.x,v.y,v.z,cameraShift);
      const frac=(i+1)/ball.trail.length;
      ctx.fillStyle=ball.kind==='smash'||ball.kind==='power-serve'
        ? `rgba(255,162,74,${frac*.3})` : `rgba(239,255,149,${frac*.38})`;
      ctx.beginPath();ctx.arc(pt.x,pt.y,Math.max(1.7,pt.scale*5*frac),0,Math.PI*2);ctx.fill();
    });
    ctx.restore();
  }
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
  const keysRef = useRef<Record<string, boolean>>({});
  const cameraKeysRef = useRef<MotionKeys>(NONE);
  const worldRef = useRef<World>(makeWorld());
  const actionLatch = useRef({ hit: false, lob: false, jump: false, serve: false });
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [message, setMessage] = useState('R またはショット操作でサーブ');
  const [showHelp, setShowHelp] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [showCameraControls, setShowCameraControls] = useState(true);
  const [rally, setRally] = useState(0);
  const [bestRally, setBestRally] = useState(0);
  const [phase, setPhase] = useState<Phase>('serve');

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
    let cameraShiftSmooth = 0;

    // Browser-sized canvas with device pixel ratio for sharp outlines on high-DPI monitors.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Preserve high-DPI detail while capping the render surface at roughly 4K.
      const dpr = Math.max(0.75, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(8500000 / Math.max(1, rect.width * rect.height))));
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    resize();

    const commitUi = () => {
      const w = worldRef.current;
      setScore(prev => prev[0] === w.score[0] && prev[1] === w.score[1] ? prev : [...w.score] as [number,number]);
      setMessage(prev => prev === w.message ? prev : w.message);
      setRally(prev => prev === w.rally ? prev : w.rally);
      setBestRally(prev => prev === w.bestRally ? prev : w.bestRally);
      setPhase(prev => prev === w.phase ? prev : w.phase);
    };

    const resetBallForServe = () => {
      const w = worldRef.current;
      if (w.server === 'player') {
        w.ball = { x: clamp(w.player.x + 0.08, -0.65, 0.65), y: 0.19, z: 0.08, vx: 0, vy: 0, vz: 0, lastHit: null, bounces: 0, kind: 'serve', glow: 0, trail: [] };
      } else {
        w.ball = { x: clamp(w.cpu.x - 0.08, -0.65, 0.65), y: 0.81, z: 0.08, vx: 0, vy: 0, vz: 0, lastHit: null, bounces: 0, kind: 'serve', glow: 0, trail: [] };
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
      w.ball.trail = [];
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
      const sp = dash ? 1.95 : 1.05;
      const previousX = w.player.x, previousY = w.player.y;
      w.player.x = clamp(w.player.x + (dx / len) * dt * 1.12 * sp, -0.88, 0.88);
      w.player.y = clamp(w.player.y + (dy / len) * dt * 0.55 * sp, 0.08, 0.45);
      const distanceMoved = Math.hypot(w.player.x - previousX, w.player.y - previousY);
      w.player.run = distanceMoved > 0.0001;
      if (w.player.run) w.player.gait += distanceMoved * (dash ? 30 : 23);
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
      // Critically: no micro-steps at the destination. This removes opponent jitter.
      // Movement is distance-limited, so the CPU never overshoots then moves back.
      const sx = targetX - w.cpu.x;
      const sy = targetY - w.cpu.y;
      const dist = Math.hypot(sx, sy);
      const deadzone = 0.018;
      if (dist > deadzone) {
        const speed = run ? 1.17 : 0.80;
        const step = Math.min(Math.max(0, dist - deadzone), speed * dt);
        const oldX = w.cpu.x, oldY = w.cpu.y;
        w.cpu.x = clamp(w.cpu.x + (sx / dist) * step, -0.88, 0.88);
        w.cpu.y = clamp(w.cpu.y + (sy / dist) * step, 0.55, 0.94);
        const moved = Math.hypot(w.cpu.x - oldX, w.cpu.y - oldY);
        w.cpu.run = moved > 0.0002;
        if (w.cpu.run) w.cpu.gait += moved * 23;
        w.cpu.lastDx = sx / dist;
        w.cpu.lastDy = sy / dist;
      } else {
        w.cpu.run = false;
        w.cpu.lastDx = 0;
        w.cpu.lastDy = 0;
      }

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
      b.trail.push({x:b.x,y:b.y,z:b.z});
      if(b.trail.length>13)b.trail.shift();
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
      const cameraShift = cameraShiftSmooth;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      // Clean vector perspective instead of enlarging the tiny low-resolution photo.
      drawHighDefinitionCourt(ctx, cameraShift);

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

      // Correct depth order: distant opponent -> net -> near player -> ball.
      drawPlayer(ctx, w.cpu, 'cpu', cameraShift, now);
      drawHighDefinitionNet(ctx, cameraShift);
      drawPlayer(ctx, w.player, 'player', cameraShift, now);
      drawBall(ctx, w.ball, cameraShift);

      // HUD
      ctx.fillStyle = 'rgba(5,10,20,0.58)';
      ctx.beginPath();
      ctx.roundRect(24, 20, 360, 88, 18);
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
      // Smooth camera only, never shake the player or CPU world positions.
      const followTarget = clamp(w.player.x * 42, -42, 42);
      cameraShiftSmooth += (followTarget - cameraShiftSmooth) * (1 - Math.exp(-dt * 3.4));
      draw(now);
      raf = requestAnimationFrame(tick);
    };

    resetBallForServe();
    commitUi();
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener('resize', resize); };
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
    <div className="perspective-page" ref={shellRef}>
      <style>{`
        html:has(.perspective-page),body:has(.perspective-page),body:has(.perspective-page) #root{width:100%;height:100%;overflow:hidden;}
        .perspective-page{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;overflow:hidden;background:#0a3156;color:#f8fafc;font-family:system-ui,sans-serif;}
        .perspective-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;}
        .perspective-controls{position:absolute;z-index:4;top:116px;right:16px;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;max-width:min(51vw,760px);}
        .perspective-btn{background:rgba(9,24,43,.88);border:1px solid rgba(213,243,255,.24);border-radius:12px;padding:10px 13px;color:#f8fafc;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 5px 19px #06121e38;backdrop-filter:blur(10px);}
        .perspective-btn:hover{background:#1d527a;}
        .perspective-btn.emphasis{background:#147f9b;}
        .perspective-btn.active{background:#047857;}
        .perspective-tip{position:absolute;z-index:2;bottom:12px;left:16px;background:rgba(5,16,29,.68);border:1px solid rgba(223,246,255,.2);border-radius:12px;padding:10px 13px;color:#edf8ff;font-size:clamp(11px,1vw,14px);line-height:1.5;pointer-events:none;max-width:min(360px,calc(100vw - 32px));backdrop-filter:blur(7px);}
        .perspective-info{position:absolute;z-index:5;top:172px;right:16px;max-width:min(380px,calc(100vw - 32px));max-height:calc(100dvh - 100px);overflow:auto;background:rgba(5,17,32,.93);border:1px solid rgba(255,255,255,.25);border-radius:18px;padding:18px;box-shadow:0 16px 45px #0005;backdrop-filter:blur(12px);}
        .perspective-info h2{font-size:20px;font-weight:900;margin:0 0 10px;}
        .perspective-info p{font-size:14px;line-height:1.7;margin:5px 0 12px;}
        .perspective-info ul{margin:8px 0;padding-left:21px;font-size:14px;line-height:1.75;}
        .perspective-camera{position:absolute;right:16px;bottom:16px;z-index:4;width:min(370px,45vw);max-height:65dvh;overflow:auto;background:rgba(4,16,31,.94);border:1px solid rgba(224,246,255,.24);border-radius:18px;padding:12px;box-shadow:0 15px 45px #0006;}
        .perspective-camera .camera-panel{margin:0;}
        .perspective-camera-small{width:min(290px,45vw);}
        .perspective-camera-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;gap:7px;}
        .perspective-camera-top strong{font-size:13px;}
        .perspective-camera-top button{padding:6px 10px;border-radius:8px;background:#243c54;color:white;}
        @media(max-width:850px){.perspective-controls{top:106px;right:8px;max-width:75vw;gap:5px;}.perspective-btn{font-size:12px;padding:8px;}.perspective-tip{font-size:11px;left:8px;bottom:8px;padding:8px;}.perspective-camera{right:8px;bottom:52px;width:min(340px,65vw);}.perspective-info{top:156px;right:8px;}}
        @media(max-width:560px){.perspective-tip{max-width:67vw;}.perspective-camera{width:84vw;max-height:53dvh;}}
      `}</style>
      <canvas ref={canvasRef} className="perspective-canvas" aria-label="3D視点テニスコート" />

      <div className="perspective-controls">
        <button className="perspective-btn" onClick={() => setShowHelp(v => !v)} aria-expanded={showHelp}>？ 操作</button>
        <button className={`perspective-btn ${cameraEnabled ? 'active' : ''}`} onClick={() => { setCameraEnabled(v => !v); setShowCameraControls(true); }}>📷 {cameraEnabled ? 'カメラON' : 'カメラ操作'}</button>
        <button className="perspective-btn" onClick={resetMatch}>↺ やり直す</button>
        <button className="perspective-btn" onClick={onDoubles}>👥 ダブルス</button>
        <button className="perspective-btn emphasis" onClick={fullScreen}>⛶ 全画面</button>
      </div>

      <div className="perspective-tip">WASD/矢印：移動　 Shift：走る　 Space：打つ　 R：サーブ　 E：ロブ　 F：スマッシュ</div>

      {showHelp && <div className="perspective-info" role="dialog" aria-label="操作ガイド">
        <h2>🎾 操作方法</h2>
        <p>コートはページを開いた時から画面いっぱいに表示されます。「⛶ 全画面」でブラウザのタブやバーも隠せます（Escで戻れます）。</p>
        <ul>
          <li><strong>WASD・矢印：</strong>走る方向に移動</li>
          <li><strong>Shift：</strong>高速ダッシュ</li>
          <li><strong>Space / Q：</strong>通常ショット</li>
          <li><strong>R：</strong>サーブ</li>
          <li><strong>E：</strong>高いロブ</li>
          <li><strong>F：</strong>スマッシュ</li>
        </ul>
        <p>前に出ながら打つとトップスピン、下がりながら打つとスライス、走りながら打つとドライブ。人物が止まっているときは足を動かさず、CPUも無駄に揺れません。</p>
        <p>カメラ操作では映像を画面に表示せず、姿勢認識結果だけを使用します。カメラはHTTPSまたはlocalhostで許可してください。</p>
        <button className="perspective-btn emphasis" onClick={() => setShowHelp(false)}>閉じる</button>
      </div>}

      {cameraEnabled && <div className={`perspective-camera ${showCameraControls ? '' : 'perspective-camera-small'}`}>
        <div className="perspective-camera-top">
          <strong>📷 姿は表示せずに体感操作</strong>
          <button onClick={() => setShowCameraControls(v => !v)}>{showCameraControls ? '縮小' : '開く'}</button>
        </div>
        <div style={{ display: showCameraControls ? 'block' : 'none' }}>
          <MotionCamera onKeys={keys => { cameraKeysRef.current = keys; }} compact />
        </div>
        {!showCameraControls && <p style={{ fontSize: 12, margin: 0 }}>カメラ処理を継続中。開くと操作状態を確認できます。</p>}
      </div>}
    </div>
  );
}
