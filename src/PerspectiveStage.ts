/** True 3D WebGL stage: world-space athletes, racket meshes, airborne ball, follow camera.
 * The supplied picture is shown behind the transparent WebGL scene in 'photo' view.
 * Other views render the full textured 3D court, allowing actual camera rotation. */
import * as THREE from 'three';
import { HALF_WIDTH, HALF_LENGTH, NET_HEIGHT, isSingles, type TennisWorld } from './perspectivePhysics';

export type ViewMode='photo'|'follow'|'side'|'overhead'|'ball';
export const VIEW_NAMES:Record<ViewMode,string>={photo:'添付画像のコート',follow:'選手を追う3D',side:'サイドカメラ',overhead:'俯瞰カメラ',ball:'ボール追跡'};
const colors=['#ff587e','#65caff','#ffb45b','#bca7ff'];
const groundMat=(color:string,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
const cyl=(r1:number,r2:number,h:number,mat:THREE.Material)=>new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,10),mat);
const sphere=(radius:number,mat:THREE.Material)=>new THREE.Mesh(new THREE.SphereGeometry(radius,16,12),mat);
const box=(w:number,h:number,d:number,mat:THREE.Material)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
const segment=(a:THREE.Vector3,b:THREE.Vector3,r:number,mat:THREE.Material)=>{
 const direction=new THREE.Vector3().subVectors(b,a), mesh=cyl(r,r,direction.length(),mat);
 mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return mesh;
};
function lineFromPoints(a:[number,number],b:[number,number],parent:THREE.Group,width=.085){
 const m=box(Math.abs(a[0]-b[0])||width,.008,Math.abs(a[1]-b[1])||width,groundMat('#f6ffff'));
 m.position.set((a[0]+b[0])/2,.027,(a[1]+b[1])/2);parent.add(m);
}
function createCourt(){
 const group=new THREE.Group();
 const surround=box(100,.12,100,groundMat('#be5840'));surround.position.y=-.15;group.add(surround);
 const grass=box(100,.08,80,groundMat('#457d50'));grass.position.set(0,-.10,-15);group.add(grass);
 const carpet=box(12.8,.055,25.6,groundMat('#3d875f'));carpet.position.set(0,-.055,0);group.add(carpet);
 const turf=box(HALF_WIDTH*2,.02,HALF_LENGTH*2,groundMat('#699c73'));turf.position.y=-.01;group.add(turf);
 for(const z of [-HALF_LENGTH,HALF_LENGTH,-6.4,6.4])lineFromPoints([-4.115,z],[4.115,z],group);
 for(const x of [-HALF_WIDTH,HALF_WIDTH,-4.115,4.115])lineFromPoints([x,-HALF_LENGTH],[x,HALF_LENGTH],group);
 for(const z of [-6.4,6.4]){
   lineFromPoints([-4.115,z],[4.115,z],group);
 }
 lineFromPoints([0,-6.4],[0,6.4],group,.066);
 lineFromPoints([-HALF_WIDTH,-HALF_LENGTH],[HALF_WIDTH,-HALF_LENGTH],group);
 lineFromPoints([-HALF_WIDTH,HALF_LENGTH],[HALF_WIDTH,HALF_LENGTH],group);
 const netMat=new THREE.MeshBasicMaterial({color:'#e7f9fc',transparent:true,opacity:.34,side:THREE.DoubleSide,depthWrite:false});
 const net=new THREE.Mesh(new THREE.PlaneGeometry(12,NET_HEIGHT),netMat);net.position.set(0,NET_HEIGHT/2,0);group.add(net);
 const cord=segment(new THREE.Vector3(-6,NET_HEIGHT,0),new THREE.Vector3(6,NET_HEIGHT,0),.035,groundMat('#ffffff'));group.add(cord);
 const meshMat=new THREE.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:.45});
 const gridPts:THREE.Vector3[]=[];
 for(let x=-6;x<=6;x+=.22){gridPts.push(new THREE.Vector3(x,.04,.015),new THREE.Vector3(x,NET_HEIGHT,.015));}
 for(let y=.04;y<=NET_HEIGHT;y+=.14){gridPts.push(new THREE.Vector3(-6,y,.015),new THREE.Vector3(6,y,.015));}
 const g=new THREE.BufferGeometry().setFromPoints(gridPts);group.add(new THREE.LineSegments(g,meshMat));
 for(const x of [-6.1,6.1]){const pole=cyl(.075,.085,1.22,groundMat('#f0f6fd'));pole.position.set(x,.61,0);group.add(pole);}
 // Hedge + tree canopy around the far fence for a playable, recognisable outdoor setting.
 const hedge=box(98,3.0,.5,groundMat('#3c7140'));hedge.position.set(0,1.4,-20);group.add(hedge);
 for(let x=-42;x<=42;x+=5){
   const shrub=sphere(1.55+Math.random()*.3,groundMat(x%2?'#397941':'#447d42'));
   shrub.scale.set(1.7,.72,.8);shrub.position.set(x,2.3,-20);group.add(shrub);
 }
 const fenceMat=new THREE.LineBasicMaterial({color:'#eac0ad',transparent:true,opacity:.53});
 const fencePts:THREE.Vector3[]=[];
 for(let x=-16;x<=16;x+=.85)fencePts.push(new THREE.Vector3(x,.4,-16.2),new THREE.Vector3(x,4.3,-16.2));
 for(let y=.4;y<4.4;y+=.7)fencePts.push(new THREE.Vector3(-16,y,-16.2),new THREE.Vector3(16,y,-16.2));
 group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fencePts),fenceMat));
 return group;
}
type Actor={root:THREE.Group;leftLeg:THREE.Group;rightLeg:THREE.Group;arm:THREE.Group;racket:THREE.Group;shadow:THREE.Mesh;indicator:THREE.Mesh};
function createActor(i:number):Actor{
 const root=new THREE.Group();
 const jersey=groundMat(colors[i],.85),white=groundMat('#f7f9ff'),skin=groundMat('#edba94'),hair=groundMat('#49302c'),shorts=groundMat('#203b5b'),shoe=groundMat('#fbfffd');
 const torso=cyl(.25,.20,.67,jersey);torso.position.set(0,1.17,0);root.add(torso);
 const waist=cyl(.22,.23,.24,shorts);waist.position.set(0,.8,0);root.add(waist);
 const neck=cyl(.09,.09,.14,skin);neck.position.set(0,1.54,0);root.add(neck);
 const head=sphere(.22,skin);head.scale.set(1,.95,.94);head.position.set(0,1.77,0);root.add(head);
 const cap=sphere(.225,hair);cap.scale.set(1,.52,1);cap.position.set(0,1.885,0);root.add(cap);
 const visor=box(.43,.045,.25,jersey);visor.position.set(0,1.92,.15);root.add(visor);
 for(const x of [-.075,.075]){
   const eye=sphere(.025,hair);eye.position.set(x,1.77,.201);root.add(eye);
 }
 const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();
 for(const [leg,x] of [[leftLeg,-.12],[rightLeg,.12]] as const){
   leg.position.set(x,.72,0);
   const thigh=segment(new THREE.Vector3(0,-.04,0),new THREE.Vector3(0,-.36,0),.095,skin);leg.add(thigh);
   const sock=segment(new THREE.Vector3(0,-.36,0),new THREE.Vector3(0,-.63,0),.068,white);leg.add(sock);
   const foot=box(.18,.11,.32,shoe);foot.position.set(0,-.66,.09);leg.add(foot);root.add(leg);
 }
 const shoulder=segment(new THREE.Vector3(-.28,1.43,0),new THREE.Vector3(-.44,.91,.04),.105,skin);root.add(shoulder);
 const arm=new THREE.Group();arm.position.set(.29,1.47,0);
 const upper=segment(new THREE.Vector3(0,0,0),new THREE.Vector3(.20,-.32,.03),.095,skin);
 const lower=segment(new THREE.Vector3(.20,-.32,.03),new THREE.Vector3(.30,-.60,.15),.072,skin);
 arm.add(upper,lower);
 const racket=new THREE.Group();racket.position.set(.31,-.61,.15);
 const grip=segment(new THREE.Vector3(0,0,0),new THREE.Vector3(0,-.02,.42),.03,groundMat('#282f42'));
 racket.add(grip);
 const oval=new THREE.Mesh(new THREE.TorusGeometry(.23,.026,8,32),groundMat('#d9ebef'));
 oval.scale.set(.74,1.18,1);oval.rotation.x=Math.PI/2;
 oval.position.set(0,-.02,.66);racket.add(oval);
 const stringMat=new THREE.LineBasicMaterial({color:'#c7ff9d',transparent:true,opacity:.88});
 const pts:THREE.Vector3[]=[];
 for(let k=-3;k<=3;k++){const d=k*.048;const length=Math.sqrt(Math.max(0,1-(d/.18)**2));pts.push(new THREE.Vector3(d,-.02,.66-.24*length),new THREE.Vector3(d,-.02,.66+.24*length));}
 for(let k=-3;k<=3;k++){const d=k*.062;const length=Math.sqrt(Math.max(0,1-(d/.245)**2));pts.push(new THREE.Vector3(-.17*length,-.02,.66+d),new THREE.Vector3(.17*length,-.02,.66+d));}
 racket.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),stringMat));arm.add(racket);root.add(arm);
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(.53,24),new THREE.MeshBasicMaterial({color:'#061d21',transparent:true,opacity:.22,depthWrite:false}));
 shadow.rotation.x=-Math.PI/2;shadow.position.y=.028;
 const indicator=new THREE.Mesh(new THREE.RingGeometry(.55,.65,36),new THREE.MeshBasicMaterial({color:'#fffa9e',side:THREE.DoubleSide,transparent:true,opacity:.93,depthWrite:false}));
 indicator.rotation.x=-Math.PI/2;indicator.position.y=.034;
 root.add(shadow,indicator);
 return {root,leftLeg,rightLeg,arm,racket,shadow,indicator};
}
export class PerspectiveStage {
 readonly renderer:THREE.WebGLRenderer;
 readonly scene:THREE.Scene;
 readonly camera:THREE.PerspectiveCamera;
 private actors:Actor[]=[];
 private ball:THREE.Group;
 private ballShadow:THREE.Mesh;
 private landing:THREE.Mesh;
 private court:THREE.Group;
 private light:THREE.DirectionalLight;
 private view:ViewMode='photo';
 private running=0;
 private cameraReady=false;
 private target=new THREE.Vector3();
 private previousBall=new THREE.Vector3();
 private ballTrail:THREE.Mesh[]=[];
 constructor(canvas:HTMLCanvasElement){
   this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
   this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
   this.renderer.outputColorSpace=THREE.SRGBColorSpace;
   this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
   this.renderer.toneMappingExposure=1.45;
   this.scene=new THREE.Scene();
   this.camera=new THREE.PerspectiveCamera(25,1,.1,300);
   this.light=new THREE.DirectionalLight('#fff5dc',2.2);this.light.position.set(-10,22,8);this.scene.add(this.light);
   this.scene.add(new THREE.HemisphereLight('#daefff','#8baf85',2.6));
   this.court=createCourt();this.scene.add(this.court);
   for(let i=0;i<4;i++){const actor=createActor(i);this.actors.push(actor);this.scene.add(actor.root);}
   const ballMesh=sphere(.13,new THREE.MeshStandardMaterial({color:'#ebff35',emissive:'#b2cd16',emissiveIntensity:.32,roughness:.65}));
   const stripe=new THREE.Mesh(new THREE.TorusGeometry(.123,.007,6,32),new THREE.MeshBasicMaterial({color:'#ffffff'}));stripe.rotation.x=.7;
   this.ball=new THREE.Group();this.ball.add(ballMesh,stripe);this.scene.add(this.ball);
   this.ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.18,24),new THREE.MeshBasicMaterial({color:'#071f14',transparent:true,opacity:.34,depthWrite:false}));
   this.ballShadow.rotation.x=-Math.PI/2;this.ballShadow.position.y=.048;this.scene.add(this.ballShadow);
   this.landing=new THREE.Mesh(new THREE.RingGeometry(.26,.36,24),new THREE.MeshBasicMaterial({color:'#fff4aa',side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));
   this.landing.rotation.x=-Math.PI/2;this.landing.position.y=.05;this.scene.add(this.landing);
   for(let i=0;i<11;i++){
     const t=sphere(.095,new THREE.MeshBasicMaterial({color:'#ebff64',transparent:true,opacity:0,depthWrite:false}));this.ballTrail.push(t);this.scene.add(t);
   }
 }
 setView(view:ViewMode){this.view=view;this.cameraReady=false;this.court.visible=view!=='photo';this.scene.background=view==='photo'?null:new THREE.Color('#7acafa');}
 setSize(width:number,height:number){
   if(width<1||height<1)return;
   this.renderer.setSize(width,height,false);
   this.camera.aspect=width/height;
   // Photo projection uses a perspective FOV tuned to the supplied square court image.
   this.camera.fov=this.view==='photo'?21:58;
   this.camera.updateProjectionMatrix();
 }
 frame(w:TennisWorld,seat:number,dt:number,elapsed:number){
   const count=isSingles(w.mode)?2:4;
   this.running+=dt;
   for(let i=0;i<4;i++){
     const p=w.players[i],a=this.actors[i];a.root.visible=i<count;
     a.root.position.set(p.x,0,p.z);
     // Everyone faces towards the opposite baseline. Feet cycle much faster while sprinting.
     const dx=p.vx,dz=p.vz;const active=Math.hypot(dx,dz)>.3;
     a.root.rotation.y=active?Math.atan2(dx,dz)+(i%2===0?Math.PI:0)*.0:(i%2===0?Math.PI:0);
     const stride=Math.sin(elapsed*(p.moving>0.7?17:10)+i)*Math.min(.67,p.moving*.85);
     a.leftLeg.rotation.x=stride;a.rightLeg.rotation.x=-stride;
     a.root.position.y=active?.038*Math.abs(Math.sin(elapsed*17)):0;
     a.arm.rotation.x=p.swing>0?-1.8*Math.sin(Math.min(1,p.swing/.38)*Math.PI):p.toss>0?-1.05:.05+Math.sin(elapsed*2+i)*.035;
     a.arm.rotation.z=p.swing>0?.4:0;
     a.racket.rotation.y=p.swing>0?.8:0;
     a.indicator.visible=i===seat;
     (a.indicator.material as THREE.MeshBasicMaterial).opacity=.66+Math.sin(elapsed*5)*.28;
   }
   const b=w.ball;
   const ballPos=new THREE.Vector3(b.x,Math.max(.12,b.y),b.z);
   this.ball.position.copy(ballPos);this.ball.rotation.set(elapsed*4,elapsed*7,elapsed*2);
   this.ballShadow.position.x=b.x;this.ballShadow.position.z=b.z;
   (this.ballShadow.material as THREE.MeshBasicMaterial).opacity=.30/(1+Math.max(0,b.y)*.3);
   this.landing.visible=w.phase==='rally';
   if(w.phase==='rally'){
     // Estimate the remaining flight to its next bounce (drag/spin ignored here for guidance).
     const g=12.3+b.topSpin;
     const landT=Math.max(0,(b.vy+Math.sqrt(b.vy*b.vy+2*g*Math.max(.1,b.y)))/g);
     this.landing.position.x=b.x+b.vx*landT+.5*b.sideSpin*landT*landT;
     this.landing.position.z=b.z+b.vz*landT;
     this.landing.visible=Math.abs(this.landing.position.x)<5.49&&Math.abs(this.landing.position.z)<11.885;
   }
   if(w.phase==='rally' && this.previousBall.distanceTo(ballPos)<5){
     for(let i=this.ballTrail.length-1;i>0;i--){this.ballTrail[i].position.copy(this.ballTrail[i-1].position);}
     this.ballTrail[0].position.copy(this.ball.position);
   }else this.ballTrail.forEach(t=>t.position.copy(ballPos));
   this.ballTrail.forEach((s,i)=>{const mat=s.material as THREE.MeshBasicMaterial;mat.opacity=w.phase==='rally'?.36*(1-i/11):0;s.scale.setScalar(.5+i*.045);});
   this.previousBall.copy(ballPos);
   const me=w.players[Math.max(0,seat)]||w.players[0];
   const side=seat%2===0?1:-1;
   const pos=new THREE.Vector3(),look=new THREE.Vector3();
   if(this.view==='photo'){
      // Image is a fixed background photograph; camera is calibrated to its court geometry.
      pos.set(0,2.8,23.5);look.set(0,0,-3);
   }else if(this.view==='follow'){
      pos.set(me.x*.64,4.6,me.z+side*9.2);look.set(me.x*.55,1.1,me.z-side*7.1);
   }else if(this.view==='side'){
      pos.set(side*20,11,2.6);look.set(0,1.0,0);
   }else if(this.view==='overhead'){
      pos.set(0,30,side*4.0);look.set(0,0,0);
   }else{
      pos.set(ballPos.x*.5,Math.max(4.7,ballPos.y+3.8),ballPos.z+side*8.7);
      look.copy(ballPos);look.y=Math.max(.8,ballPos.y);
   }
   const blend=this.cameraReady?Math.min(1,dt*(this.view==='photo'?20:3.3)):1;
   this.camera.position.lerp(pos,blend);this.target.lerp(look,blend);
   this.camera.lookAt(this.target);
   this.cameraReady=true;
   this.renderer.render(this.scene,this.camera);
 }
 dispose(){
  this.scene.traverse(obj=>{
    if(obj instanceof THREE.Mesh||obj instanceof THREE.LineSegments){obj.geometry.dispose();
     const mats=Array.isArray(obj.material)?obj.material:[obj.material];for(const mat of mats)mat?.dispose();}
  });
  this.renderer.dispose();
 }
}
