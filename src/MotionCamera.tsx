import { useCallback, useEffect, useRef, useState } from 'react';
import { createMotionState, detectMotion, NO_MOTION, type MotionKeys, type MotionSensitivity } from './motionDetection';
export type { MotionKeys } from './motionDetection';
const NONE = NO_MOTION;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm';

type Props = { onKeys: (keys: MotionKeys) => void; compact?: boolean; onStartRequest?:()=>void; onActiveChange?:(active:boolean)=>void };

/** Camera stays entirely on this device. Only input keys travel over the game socket. */
export default function MotionCamera({ onKeys, compact = false, onStartRequest, onActiveChange }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pose = useRef<any>(null);
  const worker=useRef<Worker|null>(null);
  const busy=useRef(false);
  const lastResult=useRef(0);
  const activityCallback=useRef(onActiveChange);activityCallback.current=onActiveChange;
  const [latency,setLatency]=useState(0);
  const [tracking,setTracking]=useState(false);
  const lastMetrics=useRef(0);
  const raf = useRef(0);
  const running = useRef(false);
  const motionState = useRef(createMotionState());
  const runToken = useRef(0);
  const lastFrame = useRef(0);
  const lastVideoTime = useRef(-1);
  const motionFrames = useRef<ImageData | null>(null);
  const basicCanvas = useRef<HTMLCanvasElement | null>(null);
  const basicDebounce = useRef(0);
  const lastSwing = useRef(0);
  const [sensitivity,setSensitivity] = useState<MotionSensitivity>('high');
  const sensitivityRef = useRef<MotionSensitivity>('high');
  const [reverse,setReverse] = useState(false);
  const reverseRef = useRef(false);
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
        (Object.keys(NONE) as (keyof MotionKeys)[]).every(key => previous[key] === k[key]) && previous.swingId===k.swingId && previous.power===k.power ? previous : { ...k }
      );
    }
  };

  const analyzePose = (points: Parameters<typeof detectMotion>[0], now: number) => {
    emit(detectMotion(points, now, motionState.current, sensitivityRef.current, reverseRef.current));
  };

  // Simplified movement detection used if pose model assets are blocked. No data leaves the browser.
  const analyzeBasic = (now: number) => {
    const v = video.current;
    if (!v || v.readyState < 2) return;
    // Keep a single small canvas instead of allocating one on every camera frame.
    if(!basicCanvas.current) {basicCanvas.current=document.createElement('canvas');basicCanvas.current.width=56;basicCanvas.current.height=42;}
    const cx=basicCanvas.current.getContext('2d',{willReadFrequently:true});
    if(!cx)return;
    cx.drawImage(v,0,0,56,42);
    const frame=cx.getImageData(0,0,56,42);
    const previous=motionFrames.current;
    motionFrames.current=frame;
    if(!previous)return;
    let l=0,r=0,up=0,down=0;
    for(let y=4;y<39;y++)for(let x=4;x<52;x++){
      const a=(y*56+x)*4;
      const change=(Math.abs(frame.data[a]-previous.data[a])+Math.abs(frame.data[a+1]-previous.data[a+1])+Math.abs(frame.data[a+2]-previous.data[a+2]))/3;
      if(change>30){if(x<28)l++;else r++;if(y<21)up++;else down++;}
    }
    const total=l+r;
    const activeThreshold=sensitivityRef.current==='maximum'?30:sensitivityRef.current==='high'?43:64;
    const sideThreshold=sensitivityRef.current==='maximum'?13:sensitivityRef.current==='high'?20:30;
    const cooldown=sensitivityRef.current==='maximum'?310:410;
    const hit=total>activeThreshold*3 && now-lastSwing.current>cooldown;
    if(hit){lastSwing.current=now;basicDebounce.current=now+190;}
    // Fallback is deliberately limited: differential pixels cannot reliably infer full-body pose.
    const movement=total>activeThreshold;
    const left=movement&&l>r*1.17&&l>sideThreshold;
    const right=movement&&r>l*1.17&&r>sideThreshold;
    emit({...NONE,left:reverseRef.current?right:left,right:reverseRef.current?left:right,
      hit:now<basicDebounce.current,dash:total>activeThreshold*5});
  };

  const stop = useCallback(() => {
    running.current = false;
    runToken.current++;
    worker.current?.terminate();worker.current=null;busy.current=false;
    activityCallback.current?.(false);
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    const v = video.current;
    if (v) v.srcObject = null;
    try { pose.current?.close?.(); } catch { /* ignore */ }
    pose.current = null;
    motionState.current=createMotionState();
    lastVideoTime.current=-1;
    basicDebounce.current=0;
    motionFrames.current = null;
    basicCanvas.current=null;
    emit(NONE);
    setDetected(NONE);
    setStatus('off');
    setInfo('カメラ停止中');
  }, []);

  useEffect(() => () => {
    running.current = false;
    runToken.current++;
    worker.current?.terminate();worker.current=null;
    activityCallback.current?.(false);
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach(t => t.stop());
    pose.current?.close?.();
    onKeysRef.current(NONE);
  }, []);

  async function start() {
    if (running.current) return;
    // Fullscreen must be requested in the click handler, before awaiting camera permission.
    onStartRequest?.();
    const token = ++runToken.current;
    motionState.current=createMotionState();lastVideoTime.current=-1;lastFrame.current=0;
    setStatus('loading'); setInfo('カメラ・姿勢認識を準備しています…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('HTTPSかlocalhostでカメラを開いてください');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate:{ideal:30,max:30} }, audio: false });
      if (token !== runToken.current) { media.getTracks().forEach(t=>t.stop()); return; }
      stream.current = media;
      if (!video.current) { media.getTracks().forEach(t=>t.stop()); return; }
      video.current.srcObject = media;
      await video.current.play();
      if (token !== runToken.current) { media.getTracks().forEach(t=>t.stop()); return; }
      running.current = true;
      activityCallback.current?.(true);
      media.getVideoTracks()[0]?.addEventListener('ended',stop,{once:true});
      const consume=(points:Parameters<typeof detectMotion>[0],at:number)=>{
        const now=performance.now();lastResult.current=now;
        if(now-at>240){emit(NONE);setLatency(Math.round(now-at));setTracking(false);return;}
        if(points.length)analyzePose(points,at);
        else {motionState.current=createMotionState();emit(NONE);}
        if(now-lastMetrics.current>300){
          lastMetrics.current=now;setLatency(Math.round(now-at));
          setTracking([11,12,23,24].every(i=>points[i]&&(points[i].visibility??1)>=.42)&&motionState.current.samples>=10);
        }
      };
      let detectPose: any = null;
      try {
        let useWorker=false;
        try{
          const w=new Worker('/pose-worker.js');worker.current=w;
          await new Promise<void>((resolve,reject)=>{
            const timeout=setTimeout(()=>reject(new Error('認識モデルの読み込みがタイムアウトしました')),20000);
            w.onerror=()=>{clearTimeout(timeout);reject(new Error('Worker unavailable'));};
            w.onmessage=({data})=>{
              if(data.type==='ready'){clearTimeout(timeout);resolve();}
              if(data.type==='error'){clearTimeout(timeout);reject(new Error(data.message));}
            };
            w.postMessage({type:'init'});
          });
          if(token!==runToken.current){w.terminate();return;}
          w.onmessage=({data})=>{
            if(token!==runToken.current)return;
            busy.current=false;
            if(data.type==='pose')consume(data.points,data.at);
            else {emit(NONE);setTracking(false);}
          };
          w.onerror=()=>{busy.current=false;emit(NONE);setTracking(false);setInfo('姿勢認識が停止しました。カメラを停止して再開してください。');};
          useWorker=true;
        }catch{
          worker.current?.terminate();worker.current=null;
          if(token!==runToken.current)return;
        }
        if(!useWorker){
        const mod: any = await import(/* @vite-ignore */ MODULE);
        const vision = await mod.FilesetResolver.forVisionTasks(WASM);
        try {
          detectPose = await mod.PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
        } catch {
          detectPose = await mod.PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
        }
        if (!running.current || token !== runToken.current) { detectPose.close?.(); return; }
        pose.current = detectPose;
        }
        setStatus('pose'); setInfo(`${useWorker?'低遅延認識':'互換モード'}：肩と腰がカメラに入る位置で約1秒静止してください`);
      } catch (err) {
        console.warn('Pose landmark assets not available, fallback to motion detection',err);
        if (token !== runToken.current) return;
        setStatus('basic');setInfo('簡易認識：モデルが読み込めないため左右移動とショットのみ検出します');
      }
      const loop = (now: number) => {
        if (!running.current) return;
        // Aim for 30 Hz; only analyze new video frames to reduce latency and CPU use.
        if(now-lastResult.current>250)emit(NONE);
        if (now-lastFrame.current>=(pose.current?65:33) && !busy.current && !document.hidden) {
          const v=video.current;
          if (v && v.readyState>=2 && v.currentTime!==lastVideoTime.current) {
            lastVideoTime.current=v.currentTime;
            lastFrame.current=now;
            if(worker.current){
              busy.current=true;
              const targetWorker=worker.current;
              // Only one image is in flight; never build a stale inference queue.
              createImageBitmap(v,{resizeWidth:480,resizeHeight:360}).then(bitmap=>{
                if(!running.current||token!==runToken.current||worker.current!==targetWorker){bitmap.close();return;}
                targetWorker.postMessage({type:'frame',bitmap,at:now},[bitmap]);
              }).catch(()=>{busy.current=false;emit(NONE);});
            }else if (pose.current) {
              try {
                const result=pose.current.detectForVideo(v,now);
                consume(result.landmarks?.[0]||[],now);
              } catch (err) { emit(NONE);console.warn('Pose recognition failed',err); }
            } else {analyzeBasic(now);lastResult.current=now;}
          }
        }
        raf.current=requestAnimationFrame(loop);
      };
      raf.current=requestAnimationFrame(loop);
    } catch(err) {
      if(token!==runToken.current)return;
      running.current=false;
      worker.current?.terminate();worker.current=null;
      activityCallback.current?.(false);
      stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
      setStatus('error');setInfo(err instanceof Error ? err.message : 'カメラを開始できませんでした');
    }
  }

  const recalibrate=()=>{
    motionState.current=createMotionState();
    motionFrames.current=null;
    emit(NONE);setTracking(false);
    setInfo('中心位置の再設定中：カメラの前にまっすぐ立ち、約1秒待ってください');
  };
  const changeSensitivity=(value:MotionSensitivity)=>{
    sensitivityRef.current=value;
    setSensitivity(value);
  };
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
      {status==='pose'&&<p className="camera-status-info">{tracking?'● 体を認識中':'肩と腰をカメラに入れて位置合わせ'} · 認識 {latency} ms · 振りの強さ {Math.round((detected.power??0)*100)}%</p>}
      {(status==='pose'||status==='basic') && <div className="camera-quick-actions">
        <button type="button" className="camera-button camera-secondary-button" onClick={recalibrate}>🎯 中心位置を再設定</button>
      </div>}
      <div className="camera-sensitivity-settings">
        <div className="camera-sensitivity-label"><strong>動きの感度</strong><span>反応しにくい場合は「最大」を選択</span></div>
        <div className="camera-sensitivity-options" role="group" aria-label="体の動きの感度">
          {([['normal','標準'],['high','高感度'],['maximum','最大']] as const).map(([value,label])=><button key={value} type="button" onClick={()=>changeSensitivity(value)} className={`camera-button camera-secondary-button ${sensitivity===value?'camera-sensitivity-active':''}`} aria-pressed={sensitivity===value}>{label}</button>)}
        </div>
        <button type="button" className="camera-button camera-secondary-button camera-direction-toggle" onClick={()=>{reverseRef.current=!reverseRef.current;setReverse(reverseRef.current);recalibrate();}} aria-pressed={reverse}>⇄ 左右の向きを反転 {reverse?'ON':'OFF'}</button>
      </div>
      <p className="camera-instructions">
        腕を素早く振るとショット、両手を上げて動かすとロブ、体を左右・前後に動かすと移動、素早く大きく移動するとダッシュ。姿が画面に映ることはありません。周囲の物や人との距離を確保してください。
      </p>
    </div>
  </div>;
}
