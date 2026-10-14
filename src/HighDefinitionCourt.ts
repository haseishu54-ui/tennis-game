/**
 * Resolution-independent perspective court. This replaces enlarging the 340px reference
 * screenshot, which looked blurred on full-HD and 4K displays.
 * Geometry is aligned with the game-world project() function.
 */
const W = 1280;
const H = 720;
const point = (x: number, y: number, shift: number) => ({
  x: W / 2 + shift + x * (470 - 330 * y),
  y: 640 - 432 * y,
});
const seed = (i: number) => {
  const x = Math.sin(i * 127.1 + 43.2) * 43758.5453;
  return x - Math.floor(x);
};

function polygon(ctx: CanvasRenderingContext2D, coords: {x:number;y:number}[], fill: string | CanvasGradient) {
  ctx.beginPath();
  coords.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function line(ctx: CanvasRenderingContext2D, a: {x:number;y:number}, b: {x:number;y:number}, width: number, color: string) {
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
  ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
}
function quad(ctx: CanvasRenderingContext2D, left: number, right: number, front: number, rear: number, shift: number, fill: string | CanvasGradient) {
  polygon(ctx,[point(left,front,shift),point(right,front,shift),point(right,rear,shift),point(left,rear,shift)],fill);
}

export function drawHighDefinitionCourt(ctx: CanvasRenderingContext2D, shift: number) {
  ctx.save();
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  // Blue sky, distant haze and a faint sun, inspired by the user's court picture.
  const sky = ctx.createLinearGradient(0,0,0,350);
  sky.addColorStop(0,'#1895ed');sky.addColorStop(.55,'#57bafa');sky.addColorStop(1,'#c4efff');
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.globalAlpha=.22;
  const sun=ctx.createRadialGradient(996,68,4,996,68,240);
  sun.addColorStop(0,'#ffffff');sun.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sun;ctx.fillRect(760,0,520,330);
  ctx.restore();

  // Mountains and densely planted trees on the horizon.
  polygon(ctx,[{x:0,y:214},{x:90,y:198},{x:185,y:207},{x:340,y:186},{x:480,y:200},{x:590,y:191},{x:740,y:196},{x:860,y:176},{x:990,y:188},{x:1120,y:180},{x:1280,y:208},{x:1280,y:270},{x:0,y:270}],'#658e72');
  for(let i=0;i<130;i++){
    const x=i*11-13;
    const y=198+seed(i+21)*27;
    const size=11+seed(i+44)*19;
    const green=['#26694b','#39794f','#2e7450','#4c8755','#387052'][i%5];
    ctx.fillStyle=green;ctx.beginPath();ctx.ellipse(x,y,size*.8,size*.9,0,0,Math.PI*2);ctx.fill();
  }
  const lawn=ctx.createLinearGradient(0,220,0,H);
  lawn.addColorStop(0,'#548f63');lawn.addColorStop(.5,'#376e53');lawn.addColorStop(1,'#246044');
  ctx.fillStyle=lawn;ctx.fillRect(0,232,W,H-232);

  // Red fence with a regular fine wire mesh and posts.
  const fence=ctx.createLinearGradient(0,235,0,326);
  fence.addColorStop(0,'#f07159');fence.addColorStop(1,'#ac342c');
  ctx.fillStyle=fence;ctx.fillRect(0,235,W,102);
  ctx.save();ctx.beginPath();ctx.rect(0,235,W,102);ctx.clip();
  ctx.strokeStyle='rgba(239,203,188,.24)';ctx.lineWidth=.8;
  for(let x=-20;x<W+20;x+=12)line(ctx,{x,y:235},{x:x+22,y:337},.7,'rgba(255,226,212,.18)');
  for(let x=0;x<W;x+=22)line(ctx,{x,y:235},{x:x-22,y:337},.7,'rgba(255,226,212,.13)');
  for(let y=243;y<335;y+=12)line(ctx,{x:0,y},{x:W,y},.6,'rgba(238,249,230,.14)');
  ctx.restore();
  ctx.fillStyle='#f5d3b1';ctx.fillRect(0,235,W,5);
  for(let x=0;x<W;x+=106){ctx.fillStyle='#e3a18a';ctx.fillRect(x,235,5,103);ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(x+1,237,1,100);}

  // Clay-colored outside areas and the accurately converging green court.
  const floor=ctx.createLinearGradient(0,278,0,H);
  floor.addColorStop(0,'#c94a35');floor.addColorStop(1,'#c36b4b');
  ctx.fillStyle=floor;ctx.fillRect(0,278,W,H-278);
  const outer=ctx.createLinearGradient(0,210,0,700);
  outer.addColorStop(0,'#2c7559');outer.addColorStop(.55,'#427e61');outer.addColorStop(1,'#54896a');
  polygon(ctx,[point(-1.16,0,shift),point(1.16,0,shift),point(1.16,1,shift),point(-1.16,1,shift)],outer);
  const court=ctx.createLinearGradient(0,245,0,660);
  court.addColorStop(0,'#498965');court.addColorStop(.5,'#64a77f');court.addColorStop(1,'#71ad80');
  quad(ctx,-1,1,.0,1,shift,court);
  // alternating lawn light, subtle and stationary rather than animated noise
  for(let i=0;i<8;i++){
    const near=i/8,far=(i+1)/8;
    quad(ctx,-1,1,near,far,shift,i%2?'rgba(11,69,38,.015)':'rgba(255,255,255,.018)');
  }
  // crisp court paint, perspective width scaling
  const white='#ecfff3';
  const stripe=(xa:number,ya:number,xb:number,yb:number,width=4)=> {
    const a=point(xa,ya,shift),b=point(xb,yb,shift);
    line(ctx,{x:a.x+.5,y:a.y+1},{x:b.x+.5,y:b.y+1},width+1,'rgba(17,77,59,.18)');
    line(ctx,a,b,width,white);
  };
  // sidelines and baselines
  stripe(-.95,.07,.95,.07,5.7);
  stripe(-.95,.93,.95,.93,3.1);
  stripe(-.95,.07,-.95,.93,4.4);
  stripe(.95,.07,.95,.93,4.4);
  // doubles/singles and service lines
  stripe(-.75,.07,-.75,.93,3.0);
  stripe(.75,.07,.75,.93,3.0);
  stripe(-.75,.27,.75,.27,3.4);
  stripe(-.75,.73,.75,.73,2.7);
  stripe(0,.27,0,.73,2.7);
  stripe(0,.07,0,.10,3);
  stripe(0,.90,0,.93,2);

  // Low highlights around the court edges; no animated screen shake.
  ctx.save();ctx.globalAlpha=.12;
  line(ctx,point(-1.08,0,shift),point(-1.08,1,shift),7,'#ffffff');
  line(ctx,point(1.08,0,shift),point(1.08,1,shift),7,'#ffffff');
  ctx.restore();
  ctx.restore();
}

/** The net is drawn after far players but before the near player for real depth ordering. */
export function drawHighDefinitionNet(ctx: CanvasRenderingContext2D, shift: number) {
  ctx.save();
  const a=point(-1.12,.5,shift),b=point(1.12,.5,shift);
  const height=74;
  const topA={x:a.x,y:a.y-height},topB={x:b.x,y:b.y-height};
  const shade=ctx.createLinearGradient(a.x,topA.y,b.x,a.y);
  shade.addColorStop(0,'rgba(12,44,42,.44)');shade.addColorStop(.5,'rgba(12,44,42,.31)');shade.addColorStop(1,'rgba(12,44,42,.42)');
  polygon(ctx,[a,b,topB,topA],shade);
  ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(topB.x,topB.y);ctx.lineTo(topA.x,topA.y);ctx.closePath();ctx.clip();
  for(let x=a.x;x<=b.x;x+=14)line(ctx,{x,y:topA.y},{x,y:a.y},.75,'rgba(239,255,246,.39)');
  for(let y=topA.y+9;y<=a.y;y+=10)line(ctx,{x:a.x,y},{x:b.x,y},.75,'rgba(235,255,248,.35)');
  ctx.restore();
  line(ctx,topA,topB,7,'#f9fafb');
  line(ctx,{x:a.x-3,y:topA.y-4},{x:a.x-3,y:a.y+4},9,'#e5e7eb');
  line(ctx,{x:b.x+3,y:topB.y-4},{x:b.x+3,y:b.y+4},9,'#e5e7eb');
  line(ctx,{x:a.x,y:a.y},{x:b.x,y:b.y},2,'rgba(238,249,241,.7)');
  ctx.restore();
}
