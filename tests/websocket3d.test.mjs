import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {RoomHub,createConn} from '../shared/room.ts';
import {makeWorld,advanceWorld,NO_INPUT} from '../src/perspectivePhysics.ts';

for(const [kind,count] of [['3d-singles',2],['3d-doubles',4]]){
  test('real WebSocket '+kind+' relays movement, swing, score and disconnect',async t=>{
    const server=createServer(),wss=new WebSocketServer({server}),hub=new RoomHub(),clients=[];
    wss.on('connection',ws=>{
      const conn=createConn(data=>ws.send(data),()=>ws.readyState===WebSocket.OPEN);
      ws.on('message',data=>hub.onMessage(conn,data.toString()));ws.on('close',()=>hub.onClose(conn));
    });
    t.after(async()=>{for(const c of clients)c.ws.terminate();for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const url='ws://127.0.0.1:'+server.address().port;
    for(let i=0;i<count;i++){
      const ws=new WebSocket(url),messages=[];
      ws.on('message',data=>messages.push(JSON.parse(data)));
      const client={ws,messages,send:data=>ws.send(JSON.stringify(data)),wait:async type=>{
        const until=Date.now()+2000;
        while(Date.now()<until){const idx=messages.findIndex(m=>m.type===type);if(idx>=0)return messages.splice(idx,1)[0];await new Promise(r=>setTimeout(r,5));}
        throw new Error('Timed out: '+type);
      }};
      clients.push(client);await once(ws,'open');client.send({type:'join',roomId:'INTEGRATION',matchType:kind});
      assert.equal((await client.wait('joined')).playerIndex,i);
    }
    const host=clients[0],guest=clients[1];host.send({type:'t_start'});
    const {epoch}=await host.wait('t_start');for(const c of clients.slice(1))await c.wait('t_start');
    guest.send({type:'ping',at:123});assert.equal((await guest.wait('pong')).at,123);
    guest.send({type:'t_input',epoch,input:{right:true,aim:.8,power:.9,hit:true,actionId:1},seat:0});
    const event=await host.wait('t_input');assert.equal(event.seat,1);assert.ok(event.input.hit);
    const world=makeWorld(kind==='3d-singles'?'online-single':'online');
    const previousX=world.players[1].x;
    advanceWorld(world,[NO_INPUT,event.input],1/60);
    assert.ok(world.players[1].x<previousX);
    world.score=[2,3];host.send({type:'t_snapshot',epoch,world});
    for(const c of clients.slice(1)){
      const received=await c.wait('t_snapshot');assert.deepEqual(received.world.score,[2,3]);assert.equal(received.world.players[1].x,world.players[1].x);
    }
    guest.ws.close();assert.equal((await host.wait('player_left')).leftPlayerIndex,1);
  });
}
