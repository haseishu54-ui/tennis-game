import { useCallback, useEffect, useRef, useState } from 'react';

export type MotionKeys = { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean; hit: boolean; lob: boolean; dash: boolean };
const NONE: MotionKeys = { left: false, right: false, up: false, down: false, jump: false, hit: false, lob: false, dash: false };
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm';

type Landmark = { x: number; y: number; visibility?: number };

type Props = { onKeys: (keys: MotionKeys) => void; compact?: boolean };

/** Camera stays entirely on this device. Only input keys travel over the game socket. */
export default function MotionCamera({ onKeys, compact = false }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pose = useRef<any>(null);
  const raf = useRef(0);
  const running = useRef(false);
  const center = useRef<number | null>(null);
  const baseShoulder = useRef<number | null>(null);
  const runToken = useRef(0);
  const prevWrists = useRef<[Landmark, Landmark] | null>(null);
  const lastSwing = useRef(0);
  const lastFrame = useRef(0);
  const motionFrames = useRef<ImageData | null>(null);
  const onKeysRef = useRef(onKeys);
  const [detected, setDetected] = useState<MotionKeys>(NONE);
  const lastDisplay = useRef(0);
  const [status, setStatus] = useState<'off' | 'loading' | 'pose' | 'basic' | 'error'>('off');
  const [info, setInfo] = useState('カメラを開始すると体の動きで操作できます');
  onKeysRef.current = onKeys;

  // Video frames never appear in the UI: only a short, non-identifying action label does.
  const emit = (k: MotionKeys) => {
    onKeysRef.current(k);
    const now = performance.now();
    if (now - lastDisplay.current >= 120) {
      lastDisplay.current = now;
      setDetected(previous =>
        (Object.keys(NONE) as (keyof MotionKeys)[]).every(key => previous[key] === k[key]) ? previous : { ...k }
      );
    }
  };

  const analyzePose = (points: Landmark[], now: number) => {
    const leftShoulder = points[11], rightShoulder = points[12];
    const leftWrist = points[15], rightWrist = points[16];
    const leftHip = points[23], rightHip = points[24];
    if (![leftShoulder,rightShoulder,leftWrist,rightWrist,leftHip,rightHip].every(Boolean)) return emit(NONE);
    if (Math.min(leftShoulder.visibility ?? 1, rightShoulder.visibility ?? 1) < .35) return emit(NONE);
    const x = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4;
    if (center.current === null) center.current = x;
    const delta = x - center.current;
    const shoulderWidth = Math.abs(leftShoulder.x-rightShoulder.x);
    if (baseShoulder.current === null) baseShoulder.current = shoulderWidth || .2;
    const depthRatio = shoulderWidth / Math.max(.05,baseShoulder.current);
    const upHands = leftWrist.y < leftShoulder.y - .13 && rightWrist.y < rightShoulder.y - .13;
    const jumping = (leftWrist.y < leftShoulder.y - .17 || rightWrist.y < rightShoulder.y - .17);
    // Estimate wrist velocity to recognize a real swing, not a held arm position.
    const prev = prevWrists.current;
    const velocity = prev ? Math.max(Math.hypot(leftWrist.x-prev[0].x, leftWrist.y-prev[0].y),
      Math.hypot(rightWrist.x-prev[1].x, rightWrist.y-prev[1].y)) : 0;
    const swing = velocity > .047 && now - lastSwing.current > 370;
    if (swing) lastSwing.current = now;
    prevWrists.current = [leftWrist, rightWrist];
    emit({left:delta > .085,right:delta < -.085,up:depthRatio>1.26,down:depthRatio<.78,jump:jumping && !upHands,
      hit:swing && !upHands,lob:swing && upHands,dash:Math.abs(delta)>.23});
  };

  // Simplified movement detection used if pose model assets are blocked. No data leaves the browser.
  const analyzeBasic = (now: number) => {
    const v = video.current;
    if (!v || v.readyState < 2) return;
    let c = document.createElement('canvas'); c.width = 40; c.height = 30;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) return;
    cx.drawImage(v,0,0,40,30);
    const frame = cx.getImageData(0,0,40,30);
    const previous = motionFrames.current;
    motionFrames.current = frame;
    if (!previous) return;
    let l = 0, r = 0;
    for (let y=3; y<26; y++) for (let x=0; x<40; x++) {
      const a=(y*40+x)*4;
      const change=(Math.abs(frame.data[a]-previous.data[a])+Math.abs(frame.data[a+1]-previous.data[a+1])+Math.abs(frame.data[a+2]-previous.data[a+2]))/3;
      if (change>35) { if(x<20) l++; else r++; }
    }
    const total=l+r;
    const hit=total>125 && now-lastSwing.current>450;
    if(hit)lastSwing.current=now;
    emit({ ...NONE,left:l>r*1.45 && l>27,right:r>l*1.45 && r>27,hit });
  };

  const stop = useCallback(() => {
    running.current = false;
    runToken.current++;
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    const v = video.current;
    if (v) v.srcObject = null;
    try { pose.current?.close?.(); } catch { /* ignore */ }
    pose.current = null;
    center.current = null;
    baseShoulder.current = null;
    prevWrists.current = null;
    motionFrames.current = null;
    emit(NONE);
    setDetected(NONE);
    setStatus('off');
    setInfo('カメラ停止中');
  }, []);

  useEffect(() => () => {
    running.current = false;
    runToken.current++;
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach(t => t.stop());
    pose.current?.close?.();
    onKeysRef.current(NONE);
  }, []);

  async function start() {
    if (running.current) return;
    const token = ++runToken.current;
    setStatus('loading'); setInfo('カメラ・姿勢認識を準備しています…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('HTTPSかlocalhostでカメラを開いてください');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      if (token !== runToken.current) { media.getTracks().forEach(t=>t.stop()); return; }
      stream.current = media;
      if (!video.current) { media.getTracks().forEach(t=>t.stop()); return; }
      video.current.srcObject = media;
      await video.current.play();
      if (token !== runToken.current) { media.getTracks().forEach(t=>t.stop()); return; }
      running.current = true;
      let detectPose: any = null;
      try {
        const mod: any = await import(/* @vite-ignore */ MODULE);
        const vision = await mod.FilesetResolver.forVisionTasks(WASM);
        try {
          detectPose = await mod.PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
        } catch {
          detectPose = await mod.PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
        }
        if (!running.current || token !== runToken.current) { detectPose.close?.(); return; }
        pose.current = detectPose;
        setStatus('pose'); setInfo('姿勢認識ON：左右移動・手振りショット・両手を上げてロブ');
      } catch (err) {
        console.warn('Pose landmark assets not available, fallback to motion detection',err);
        if (token !== runToken.current) return;
        setStatus('basic');setInfo('簡易動作認識：左右に動く・大きく動いてショット（高精度モデルの取得に失敗）');
      }
      const loop = (now: number) => {
        if (!running.current) return;
        if (now-lastFrame.current>=50) {
          lastFrame.current=now;
          const v=video.current;
          if (v && v.readyState>=2) {
            if (pose.current) {
              try {
                const result=pose.current.detectForVideo(v,now);
                if(result.landmarks?.[0]) analyzePose(result.landmarks[0],now);
                else emit(NONE);
              } catch (err) { console.warn('Pose recognition failed',err); }
            } else analyzeBasic(now);
          }
        }
        raf.current=requestAnimationFrame(loop);
      };
      raf.current=requestAnimationFrame(loop);
    } catch(err) {
      running.current=false;
      stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
      setStatus('error');setInfo(err instanceof Error ? err.message : 'カメラを開始できませんでした');
    }
  }

  const active = status === 'pose' || status === 'basic';
  const actionLabels = [
    detected.left && '⬅️ 左へ', detected.right && '➡️ 右へ',
    detected.up && '⬆️ 前へ', detected.down && '⬇️ 後ろへ',
    detected.dash && '⚡ ダッシュ', detected.jump && '💥 ジャンプ',
    detected.hit && '🎾 ショット', detected.lob && '🎈 ロブ',
  ].filter(Boolean) as string[];

  return <div className={`camera-panel camera-panel-private ${compact ? 'camera-panel-compact' : ''}`}>
    <div className="camera-panel-heading">
      <div>
        <strong className="camera-panel-title">📷 カメラ操作（映像非表示）</strong>
        <span className={`camera-state ${status==='pose'?'is-pose':status==='basic'?'is-basic':status==='error'?'is-error':''}`}>
          {status==='pose'?'● 姿勢認識中':status==='basic'?'● 簡易認識中':status==='loading'?'● 準備中':status==='error'?'● 接続エラー':'○ 停止中'}
        </span>
      </div>
      <div className="camera-actions">
        <button type="button" className="camera-button camera-start-button" disabled={status==='loading'} onClick={running.current ? stop : start}>
          {running.current ? '■ カメラ停止' : '▶ カメラ開始'}
        </button>
      </div>
    </div>

    {/* Keep the HTMLVideoElement alive for local pose inference, but never paint
        the footage or a body outline anywhere in the visible document. */}
    <video ref={video} autoPlay playsInline muted aria-hidden="true" tabIndex={-1} className="camera-private-capture" />

    <div className="camera-private-status" aria-label="カメラ映像を非表示にした操作パネル">
      <div className="camera-private-emblem" aria-hidden="true">🛡️</div>
      <div className="camera-private-message">
        <strong>自分の姿は表示しません</strong>
        <span>{active ? '映像を見せずに、体の動きだけでゲームを操作中' : status==='loading' ? '姿を表示せずに認識を準備しています' : status==='error' ? 'カメラを確認してください' : 'カメラ開始後も人物映像は表示されません'}</span>
      </div>
      <div className="camera-private-action-row" aria-live="polite" aria-atomic="true">
        <span className="camera-private-action-label">認識している動作</span>
        <strong>{active ? actionLabels.join(' · ') || '中央・待機中' : 'カメラ停止中'}</strong>
      </div>
    </div>

    <div className="camera-help">
      <p role="status" className="camera-status-info">{info}</p>
      {(status==='pose'||status==='basic') && <div className="camera-quick-actions">
        <button type="button" className="camera-button camera-secondary-button" onClick={() => { center.current=null; baseShoulder.current=null; prevWrists.current=null; }}>🎯 中心位置を再設定</button>
      </div>}
      <p className="camera-instructions">
        体を左右・前後に動かして移動し、腕を振るとショット。姿勢認識は端末内で行い、映像や人物の骨格を画面に出さず、録画・送信もしません。カメラ許可は開始時のみ求めます。
      </p>
    </div>
  </div>;
}
