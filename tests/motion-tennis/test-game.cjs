const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('public/motion-tennis/index.html','utf8');let js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
js=js.slice(js.indexOf("'use strict';"),js.indexOf('class Ring'));
const c={document:{getElementById:()=>({})},Math,console};vm.createContext(c);
vm.runInContext(js+';globalThis.test={G,pl,placeHomes,resetMatch,tryHit,onNetRule,onBounceRule,activeSeats,hostStep};',c);
const t=c.test;
function serve(dx,p){t.placeHomes();t.resetMatch();t.G.hitCd=0;t.G.ball={x:t.pl[0].x,y:2.3,z:t.pl[0].z,vx:0,vy:0,vz:0};assert(t.tryHit(0,{dx,dy:.2,p}));return {...t.G.ball};}
let a=serve(-1,.4),b=serve(1,.4);assert(a.vx<0&&b.vx>0);a=serve(0,.2);b=serve(0,.9);assert(Math.hypot(b.vy,b.vz)>Math.hypot(a.vy,a.vz));
t.G.doubles=true;assert.equal(t.activeSeats().length,4);t.resetMatch();t.G.phase='serveflight';t.onNetRule();assert.equal(t.G.serveNo,2);t.G.phase='serveflight';t.onNetRule();assert.equal(t.G.score[1],1);
console.log('PASS: serve direction, speed response, doubles, first and second faults');
