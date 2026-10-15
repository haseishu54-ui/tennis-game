/** Camera-only motion classifier. No pixels or landmarks leave the browser. */
export type MotionKeys = {
  left: boolean; right: boolean; up: boolean; down: boolean;
  jump: boolean; hit: boolean; lob: boolean; dash: boolean;
  aim?: number; power?: number; swingId?: number; capturedAt?: number;
};
export type MotionSensitivity = 'normal' | 'high' | 'maximum';
export type Landmark = { x: number; y: number; visibility?: number };
export const NO_MOTION: MotionKeys = {left:false,right:false,up:false,down:false,jump:false,hit:false,lob:false,dash:false};

export type MotionState = {
  samples: number;
  centerX: number | null;
  shoulderWidth: number | null;
  hipY: number | null;
  filteredX: number | null;
  filteredDepth: number;
  lastAt: number;
  wristLeft: {x:number;y:number} | null;
  wristRight: {x:number;y:number} | null;
  lastSwing: number;
  lastJump: number;
  heldJumpUntil: number;
  heldGestureUntil: number;
  heldGesture: 'hit' | 'lob' | null;
  lateral: -1 | 0 | 1;
  depth: -1 | 0 | 1;
  // Alternating leg motion can indicate running in place.
  priorLegDelta: number | null;
  lastLegChange: number;
  aim: number; power: number; swingId: number;
};

export function createMotionState(): MotionState {
  return {
    samples:0,centerX:null,shoulderWidth:null,hipY:null,filteredX:null,
    filteredDepth:1,lastAt:0,wristLeft:null,wristRight:null,lastSwing:-1000,lastJump:-1000,heldJumpUntil:0,
    heldGestureUntil:0,heldGesture:null,lateral:0,depth:0,priorLegDelta:null,lastLegChange:-1000,aim:0,power:.5,swingId:0,
  };
}

function visible(p: Landmark | undefined, cutoff = 0.42): p is Landmark {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= cutoff;
}
function magnitude(a: {x:number;y:number}, b: {x:number;y:number}) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function smooth(previous:number|null, value:number, alpha:number) {
  return previous===null ? value : previous+(value-previous)*alpha;
}
function updateAxis(value:number, previous:-1|0|1, threshold:number): -1|0|1 {
  const exit=threshold*0.65;  // hysteresis: don't rapidly switch off near the boundary
  if(previous===1 && value>exit)return 1;
  if(previous===-1 && value< -exit)return -1;
  return value>threshold?1:value< -threshold?-1:0;
}

/** The calculations use body-relative positions to avoid triggering swings just by walking. */
export function detectMotion(points:Landmark[], now:number, state:MotionState, sensitivity:MotionSensitivity='high', reversed=false):MotionKeys {
  const shoulderL=points[11], shoulderR=points[12], hipL=points[23], hipR=points[24];
  const wristL=points[15], wristR=points[16];
  if(!visible(shoulderL)||!visible(shoulderR)||!visible(hipL)||!visible(hipR)){
    state.wristLeft=null;state.wristRight=null;state.lastAt=0;state.heldGesture=null;
    state.heldGestureUntil=0;state.heldJumpUntil=0;state.lateral=0;state.depth=0;
    return NO_MOTION;
  }
  // A stalled camera must not turn an old wrist position into a new swing.
  if(state.lastAt && now-state.lastAt>250){state.wristLeft=null;state.wristRight=null;state.heldGesture=null;state.heldGestureUntil=0;}

  const centerX=(shoulderL.x+shoulderR.x+hipL.x+hipR.x)/4;
  const hipY=(hipL.y+hipR.y)/2;
  const width=Math.abs(shoulderL.x-shoulderR.x);
  const dt=state.lastAt>0?Math.max(.02,Math.min(.22,(now-state.lastAt)/1000)):.04;
  const oldFilteredX=state.filteredX;
  state.filteredX=smooth(state.filteredX,centerX,0.63);
  const lateralSpeed=oldFilteredX!==null ? (state.filteredX-oldFilteredX)/dt:0;
  const wasCalibrating=state.samples<10;
  state.samples=Math.min(10,state.samples+1);
  if(wasCalibrating){
    // First ~0.3s establishes the neutral position. Restartable from the UI.
    state.centerX=smooth(state.centerX,centerX,0.3);
    state.shoulderWidth=smooth(state.shoulderWidth,Math.max(.065,width),0.3);
    state.hipY=smooth(state.hipY,hipY,0.3);
  }
  const delta=(state.filteredX??centerX)-(state.centerX??centerX);
  const depthRatio=width / Math.max(0.065,state.shoulderWidth??width);
  state.filteredDepth+= (depthRatio-state.filteredDepth)*0.46;
  const posThreshold = sensitivity==='maximum'?.025:sensitivity==='high'?.038:.06;
  const depthThreshold = sensitivity==='maximum'?.09:sensitivity==='high'?.12:.18;
  const lateral=updateAxis(delta,state.lateral,posThreshold);
  const depth=updateAxis(state.filteredDepth-1,state.depth,depthThreshold);
  state.lateral=lateral;state.depth=depth;

  // Relative wrist motion rejects most movement of the entire torso/camera.
  const relativeLeft=visible(wristL)?{x:wristL.x-shoulderL.x,y:wristL.y-shoulderL.y}:null;
  const relativeRight=visible(wristR)?{x:wristR.x-shoulderR.x,y:wristR.y-shoulderR.y}:null;
  const vL=relativeLeft&&state.wristLeft?magnitude(relativeLeft,state.wristLeft)/dt:0;
  const vR=relativeRight&&state.wristRight?magnitude(relativeRight,state.wristRight)/dt:0;
  const speed=Math.max(vL,vR);
  const swingThreshold=sensitivity==='maximum'?.35:sensitivity==='high'?.52:.84;
  const raisedBoth=!!relativeLeft&&!!relativeRight&&relativeLeft.y<-.065&&relativeRight.y<-.065;
  const enoughMotion=speed>swingThreshold;
  const canSwing=!wasCalibrating&&now-state.lastSwing>260;
  if(canSwing && enoughMotion){
    const hand=vL>=vR?relativeLeft:relativeRight;
    const prior=vL>=vR?state.wristLeft:state.wristRight;
    const velocityX=hand&&prior?(hand.x-prior.x)/dt:0;
    state.aim=Math.max(-1,Math.min(1,velocityX/Math.max(.25,speed)*(reversed?-1:1)));
    state.power=Math.max(.1,Math.min(1,(speed/Math.max(.065,width)-1)/11));
    state.swingId++;
    state.lastSwing=now;
    state.heldGesture=raisedBoth?'lob':'hit';
    state.heldGestureUntil=now+170; // game frame cannot miss short sensor impulses
  }

  // Real body lift (hips) instead of mistaking a raised forearm for a jump.
  const lifted=(state.hipY!==null && hipY<state.hipY-(sensitivity==='maximum'?.026:.038));
  const jump=state.samples>=10&&lifted&&now-state.lastJump>420;
  if(jump){state.lastJump=now;state.heldJumpUntil=now+160;}

  // Detect fast side steps and optional alternating legs for running in place.
  let legMotion=false;
  const leftKnee=points[25],rightKnee=points[26];
  if(visible(leftKnee,.5)&&visible(rightKnee,.5)){
    const legs=leftKnee.y-rightKnee.y;
    if(state.priorLegDelta!==null && Math.abs(legs-state.priorLegDelta)>0.025){
      state.lastLegChange=now;
    }
    state.priorLegDelta=legs;
    legMotion=Math.abs(legs)>0.035 && now-state.lastLegChange<270;
  }
  const dash=Math.abs(delta)>(sensitivity==='maximum'?.105:.14)
    || (Math.abs(lateralSpeed)>.25 && lateral!==0)
    || (legMotion && lateral!==0);

  state.wristLeft=relativeLeft;
  state.wristRight=relativeRight;
  state.lastAt=now;
  if(wasCalibrating)return NO_MOTION;
  if(now>=state.heldGestureUntil)state.heldGesture=null;
  return {
    left:reversed?lateral>0:lateral<0,
    right:reversed?lateral<0:lateral>0,
    up:depth>0,down:depth<0,
    jump:now<state.heldJumpUntil,
    hit:state.heldGesture==='hit',
    lob:state.heldGesture==='lob',
    dash,
    aim:state.aim,power:state.power,swingId:state.swingId,capturedAt:now,
  };
}
