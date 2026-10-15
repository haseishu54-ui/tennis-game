import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld,advanceWorld,tossServe,strike,moveAthlete,NO_INPUT,awardPoint,resetPoint} from '../src/perspectivePhysics.ts';

test('3D world starts with valid world-space players and a service-ready ball',()=>{
  const w=makeWorld();assert.equal(w.phase,'ready');assert.equal(w.players.length,4);
  assert.ok(w.players[0].z>0);assert.ok(w.players[1].z<0);
  assert.equal(w.ball.y,1.1);
});
test('toss then serve launches a flying ball into the far half',()=>{
  const w=makeWorld();assert.ok(tossServe(w,0));assert.equal(w.phase,'toss');
  for(let i=0;i<13;i++)advanceWorld(w,[NO_INPUT],1/60,0);
  assert.ok(w.ball.y>1.5);assert.ok(strike(w,0,'serve'));assert.equal(w.phase,'rally');
  assert.ok(w.ball.vz<0);assert.ok(w.ball.vy>0);
});
test('running is faster than walking but costs energy',()=>{
  const normal=makeWorld().players[0],fast=makeWorld().players[0];
  for(let i=0;i<60;i++){
    moveAthlete(normal,0,{...NO_INPUT,right:true},1/60);
    moveAthlete(fast,0,{...NO_INPUT,right:true,dash:true},1/60);
  }
  assert.ok(fast.x-normal.x>0.4,`sprint=${fast.x},walk=${normal.x}`);
  assert.ok(fast.energy<normal.energy);
});
test('running laterally changes curve and forward momentum changes ball speed',()=>{
  const w=makeWorld();tossServe(w,0);
  for(let i=0;i<14;i++)advanceWorld(w,[NO_INPUT],1/60,0);
  w.players[0].vx=7.5;w.players[0].vz=-6;
  assert.ok(strike(w,0));assert.ok(Math.abs(w.ball.sideSpin)>.05);
  assert.ok(w.ball.topSpin>1);
});
test('point is awarded for net fault and finishes only with two-point lead',()=>{
  const w=makeWorld();w.phase='rally';w.ball={...w.ball,live:true,y:.25,z:.1,vz:-16,vy:0,lastTeam:0};
  advanceWorld(w,[NO_INPUT],1/60,0);assert.equal(w.score[1],1);
  w.phase='rally';w.score=[6,6];awardPoint(w,0,'test');assert.equal(w.phase,'point');
  w.phase='rally';awardPoint(w,0,'test');assert.equal(w.phase,'finished');
});
test('a second bounce belongs to the hitting team',()=>{
  const w=makeWorld();w.phase='rally';w.ball={...w.ball,x:0,y:.03,z:-5,vx:0,vy:-3,vz:0,bounces:1,lastTeam:0,live:true};
  advanceWorld(w,[NO_INPUT],1/60,0);assert.equal(w.score[0],1);
});

test('camera serve direction and power change trajectory while keeping a playable landing',()=>{
  const serve=(aim,power)=>{
    const w=makeWorld();tossServe(w,0);
    for(let i=0;i<14;i++)advanceWorld(w,[NO_INPUT],1/60);
    assert.ok(strike(w,0,'serve',{aim,power}));return w;
  };
  const slow=serve(.8,0),fast=serve(.8,1),left=serve(-.8,.5);
  assert.ok(Math.hypot(fast.ball.vx,fast.ball.vz)>Math.hypot(slow.ball.vx,slow.ball.vz)*1.2);
  assert.ok(left.ball.vx<0&&fast.ball.vx>0);
  for(const w of [slow,fast,left]){
    for(let i=0;i<100&&!w.ball.bounces&&w.phase==='rally';i++)advanceWorld(w,[NO_INPUT],1/60);
    assert.equal(w.ball.bounces,1);assert.equal(w.phase,'rally');assert.ok(w.ball.z<0);
  }
});

test('controls use the player perspective on both ends of the court',()=>{
  const w=makeWorld('online-single');const x=w.players[1].x,z=w.players[1].z;
  moveAthlete(w.players[1],1,{...NO_INPUT,right:true,up:true},.1);
  assert.ok(w.players[1].x<x&&w.players[1].z>z);
});

test('online singles excludes doubles teammates from movement and strikes',()=>{
  const w=makeWorld('online-single'),x=w.players[2].x;
  advanceWorld(w,[NO_INPUT,NO_INPUT,{...NO_INPUT,right:true,hit:true}],1/60);
  assert.equal(w.players[2].x,x);assert.equal(w.phase,'ready');
});

test('early camera swing buffers briefly then strikes when ball enters reach',()=>{
  const w=makeWorld();w.phase='rally';
  w.ball={...w.ball,x:w.players[0].x,y:1.5,z:w.players[0].z-2.5,vz:7,vy:0,lastTeam:1,live:true};
  advanceWorld(w,[{...NO_INPUT,hit:true,aim:.4,power:.8}],1/60);
  assert.equal(w.ball.lastTeam,1);
  for(let i=0;i<5;i++)advanceWorld(w,[NO_INPUT],1/60);
  assert.equal(w.ball.lastTeam,0);assert.equal(w.rally,1);
});

test('doubles partners rotate serves and start at their baseline',()=>{
  const w=makeWorld('online');w.score=[1,1];w.serveTeam=1;resetPoint(w);
  assert.equal(w.server,3);assert.ok(w.players[3].z<-9);
  assert.equal(tossServe(w,1),false);assert.equal(tossServe(w,3),true);
});
