import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomHub, createConn, sanitizeRoomId } from '../shared/room.ts';
const setup = () => {
  const hub=new RoomHub();
  const peers=[];
  for(let i=0;i<5;i++){
    const received=[];
    const conn=createConn(str=>received.push(JSON.parse(str)),()=>true);
    peers.push({received,conn,send:data=>hub.onMessage(conn,JSON.stringify(data))});
  }
  return {hub,peers};
};
test('room id sanitization',()=>{assert.equal(sanitizeRoomId(' a b*room! '),'ABROOM');});
test('four doubles clients are assigned separate slots; fifth rejected',()=>{
  const {hub,peers}=setup();
  peers.forEach(p=>p.send({type:'join',roomId:'DBTEST',matchType:'doubles'}));
  for(let i=0;i<4;i++)assert.equal(peers[i].received[0].playerIndex,i);
  assert.equal(peers[3].received[0].playersCount,4);
  assert.equal(peers[4].received[0].type,'error');
  assert.equal(hub.roomCount,1);
});
test('only host can start or send authoritative snapshot; inputs have authenticated seat',()=>{
  const {peers}=setup();
  for(let i=0;i<4;i++)peers[i].send({type:'join',roomId:'DBTEST',matchType:'doubles'});
  for(const p of peers)p.received.length=0;
  peers[2].send({type:'d_start'});
  assert.equal(peers[0].received.length,0);
  peers[0].send({type:'d_start'});
  assert.equal(peers[1].received.at(-1).type,'d_start');
  peers[2].send({type:'d_snapshot',world:{invalid:true}});
  assert.equal(peers[0].received.length,0);
  peers[3].send({type:'d_input',seat:0,x:999999,y:-10,swing:true});
  const input=peers[0].received.at(-1);
  assert.equal(input.seat,3);assert.equal(input.x,1200);assert.equal(input.y,0);
  peers[0].send({type:'d_snapshot',world:{score:[1,0]}});
  assert.equal(peers[1].received.at(-1).type,'d_snapshot');
});
test('singles legacy online protocol still works',()=>{
  const {peers}=setup();
  peers[0].send({type:'join',roomId:'SINGLES'});peers[1].send({type:'join',roomId:'SINGLES'});
  assert.equal(peers[1].received[0].capacity,2);
  peers[0].send({type:'start'});assert.equal(peers[1].received.at(-1).type,'start');
  peers[1].send({type:'sync_game',state:'over'});assert.notEqual(peers[0].received.at(-1).type,'sync_game');
  peers[0].send({type:'sync_game',state:'play'});assert.equal(peers[1].received.at(-1).state,'play');
});
test('joining mismatched room and seat reuse after leave',()=>{
  const {hub,peers}=setup();
  peers[0].send({type:'join',roomId:'SAME',matchType:'singles'});
  peers[1].send({type:'join',roomId:'SAME',matchType:'doubles'});
  assert.equal(peers[1].received.at(-1).type,'error');
  peers[1].send({type:'join',roomId:'SAME',matchType:'singles'});
  hub.onClose(peers[0].conn);
  peers[2].send({type:'join',roomId:'SAME',matchType:'singles'});
  assert.equal(peers[2].received[0].playerIndex,0);
});
