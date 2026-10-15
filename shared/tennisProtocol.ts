/** Wire values are always bounded before entering the simulation. */
export function cleanInput(raw: any) {
  const v=raw&&typeof raw==='object'?raw:{};
  const number=(value:unknown,min:number,max:number,fallback:number)=>
    typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
  return {
    left:v.left===true,right:v.right===true,up:v.up===true,down:v.down===true,dash:v.dash===true,
    hit:v.hit===true,lob:v.lob===true,smash:v.smash===true,serve:v.serve===true,
    aim:number(v.aim,-1,1,0),power:number(v.power,0,1,.5),
    actionId:Math.floor(number(v.actionId,0,Number.MAX_SAFE_INTEGER,0)),
  };
}
