import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionState,detectMotion} from '../src/motionDetection.ts';
function pose({shift=0,shoulderWidth=.20,wristX=0,wristY=.5,hipY=.56}={}){
  const pts=Array.from({length:33},()=>({x:.5,y:.5,visibility:.99}));
  pts[11]={x:.5-shoulderWidth/2+shift,y:.35,visibility:.99};
  pts[12]={x:.5+shoulderWidth/2+shift,y:.35,visibility:.99};
  pts[23]={x:.43+shift,y:hipY,visibility:.99};
  pts[24]={x:.57+shift,y:hipY,visibility:.99};
  pts[15]={x:.36+shift+wristX,y:wristY,visibility:.99};
  pts[16]={x:.64+shift-wristX,y:wristY,visibility:.99};
  pts[25]={x:.44+shift,y:.72,visibility:.99};
  pts[26]={x:.56+shift,y:.72,visibility:.99};
  return pts;
}
function calibrate(s){for(let i=0;i<13;i++)detectMotion(pose(),1000+i*34,s,'high');}
test('small lateral body movements register as movement after calibration',()=>{
  const s=createMotionState();calibrate(s);
  detectMotion(pose({shift:.07}),1500,s,'high');
  const k=detectMotion(pose({shift:.07}),1534,s,'high');
  assert.equal(k.right,true);assert.equal(k.left,false);
});
test('reverse control switches screen direction',()=>{
  const s=createMotionState();calibrate(s);
  detectMotion(pose({shift:.09}),1500,s,'high',true);
  const k=detectMotion(pose({shift:.09}),1534,s,'high',true);
  assert.equal(k.left,true);assert.equal(k.right,false);
});
test('arm sweep triggers shot but translating whole body alone does not',()=>{
  const s=createMotionState();calibrate(s);
  let k=detectMotion(pose({shift:.05}),1510,s,'high');
  assert.equal(k.hit,false);
  k=detectMotion(pose({shift:.05,wristX:.065}),1544,s,'high');
  assert.equal(k.hit,true);
  k=detectMotion(pose({shift:.05,wristX:.065}),1630,s,'high');
  assert.equal(k.hit,true);
  k=detectMotion(pose({shift:.05,wristX:.065}),1800,s,'high');
  assert.equal(k.hit,false);
});
test('raised hands with motion register a lob',()=>{
  const s=createMotionState();calibrate(s);
  detectMotion(pose({wristY:.18}),1510,s,'high');
  const k=detectMotion(pose({wristY:.13,wristX:.06}),1544,s,'high');
  assert.equal(k.lob,true);assert.equal(k.hit,false);
});
test('stepping nearer the camera registers forward movement at lower threshold',()=>{
  const s=createMotionState();calibrate(s);
  let k=detectMotion(pose({shoulderWidth:.24}),1510,s,'high');
  k=detectMotion(pose({shoulderWidth:.24}),1544,s,'high');
  assert.equal(k.up,true);
});
test('losing key landmarks does not produce movement',()=>{
  const s=createMotionState();calibrate(s);
  const p=pose();p[11].visibility=.1;
  assert.equal(detectMotion(p,1500,s).hit,false);
  assert.equal(detectMotion(p,1500,s).right,false);
});

test('swing direction and speed are measured, and reversing flips aim',()=>{
  const sample=(offset,reverse=false)=>{
    const state=createMotionState();calibrate(state);
    detectMotion(pose(),1500,state,'high',reverse);
    return detectMotion(pose({wristX:offset}),1534,state,'high',reverse);
  };
  const gentle=sample(.035),fast=sample(.12),backhand=sample(-.12),reverse=sample(.12,true);
  assert.ok(gentle.hit&&fast.hit);assert.ok(fast.power>gentle.power);
  assert.ok(fast.aim>0&&backhand.aim<0);assert.equal(reverse.aim,-fast.aim);
  assert.ok(fast.power<=1&&fast.power>=0);
});

test('tracking loss and delayed frames cannot replay a swing',()=>{
  const state=createMotionState();calibrate(state);
  detectMotion(pose(),1500,state);
  assert.ok(detectMotion(pose({wristX:.12}),1534,state).hit);
  const lost=pose();lost[11].visibility=0;
  assert.equal(detectMotion(lost,1568,state).hit,false);
  assert.equal(detectMotion(pose({wristX:-.12}),1602,state).hit,false);
  assert.equal(detectMotion(pose({wristX:.2}),2100,state).hit,false);
});
