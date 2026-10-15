import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomHub,createConn } from '../shared/room.ts';
import { cleanInput } from '../shared/tennisProtocol.ts';
import { makeWorld } from '../src/perspectivePhysics.ts';
import { validWorld,smoothWorld } from '../src/perspectiveNetwork.ts';

function peers(count,kind){
  const hub=new RoomHub();
  const clients=Array.from({length:count},()=>{
    const inbox=[];const conn=createConn(text=>inbox.push(JSON.parse(text)),()=>true);
    return {conn,inbox,send:msg=>hub.onMessage(conn,JSON.stringify(msg))};
  });
  for(const p of clients)p.send({type:'join',roomId:'TEST3D',matchType:kind});
  return {hub,clients};
}
for(const [kind,count] of [['3d-singles',2],['3d-doubles',4]]){
  test(kind+' starts at correct capacity, authenticates inputs and isolates match epochs',()=>{
    const {hub,clients:c}=peers(count,kind);
    for(let i=0;i<count;i++){assert.equal(c[i].inbox[0].capacity,count);c[i].inbox.length=0;}
    c[1].send({type:'t_start'});assert.equal(c[0].inbox.length,0);
    c[0].send({type:'t_start'});const epoch=c[1].inbox.at(-1).epoch;
    assert.equal(c[0].inbox.at(-1).type,'t_start');
    c[1].send({type:'t_input',seat:0,epoch,input:{right:true,hit:true,aim:999,power:-1,actionId:1}});
    const message=c[0].inbox.at(-1);assert.equal(message.seat,1);assert.equal(message.input.aim,1);assert.equal(message.input.power,0);
    const before=c[0].inbox.length;
    c[1].send({type:'t_snapshot',epoch,world:makeWorld()});assert.equal(c[0].inbox.length,before);
    c[0].send({type:'t_snapshot',epoch,world:makeWorld()});assert.equal(c[1].inbox.at(-1).type,'t_snapshot');
    c[0].send({type:'t_reset'});assert.equal(c[1].inbox.at(-1).type,'t_reset');
    c[0].send({type:'t_start'});assert.ok(c[1].inbox.at(-1).epoch>epoch);
    const previous=c[0].inbox.length;c[1].send({type:'t_input',epoch,input:{hit:true}});assert.equal(c[0].inbox.length,previous);
    hub.onClose(c[1].conn);const stopped=c[0].inbox.length;
    c[0].send({type:'t_start'});assert.equal(c[0].inbox.length,stopped);
  });
}
test('3D and legacy clients cannot join the same room',()=>{
  const {hub,clients}=peers(1,'3d-singles');const inbox=[];
  const other=createConn(text=>inbox.push(JSON.parse(text)),()=>true);
  hub.onMessage(other,JSON.stringify({type:'join',roomId:'TEST3D',matchType:'singles'}));
  assert.equal(inbox.at(-1).type,'error');assert.equal(clients[0].inbox.length,1);
});
test('wire sanitization rejects nonfinite values and forged key values',()=>{
  const k=cleanInput({aim:NaN,power:Infinity,actionId:-10,left:'true',right:true});
  assert.equal(k.aim,0);assert.equal(k.power,.5);assert.equal(k.actionId,0);assert.equal(k.left,false);assert.equal(k.right,true);
});
test('invalid snapshots are rejected; smoothing does not change authoritative world',()=>{
  const w=makeWorld('online-single');assert.ok(validWorld(w));assert.equal(validWorld({players:[]}),false);
  const invalid=structuredClone(w);invalid.ball.x=NaN;assert.equal(validWorld(invalid),false);
  const previous=structuredClone(w);w.players[0].x+=1;const original=structuredClone(w);
  const draw=smoothWorld(previous,w,1/60,1,30);
  assert.ok(draw.players[0].x>previous.players[0].x&&draw.players[0].x<w.players[0].x);
  assert.deepEqual(w,original);
});
