import {texture,sample} from './texture.js';
// Normalized dimensions refer to the original photograph, including its margins.
export const defaultBody = {left:.2,right:.8,top:.2,bottom:.8,bend:.055};
export function validBody(b) {
  return b && Object.keys(defaultBody).every(k=>Number.isFinite(b[k])) &&
    [b.baseLeft??b.left,b.baseRight??b.right,b.rotation??0,b.pivotX??.5,b.pivotY??.5].every(Number.isFinite) &&
    (b.baseLeft??b.left)>=0 && (b.baseRight??b.right)<=1 && (b.baseRight??b.right)-(b.baseLeft??b.left)>=.04 &&
    b.left>=0 && b.right<=1 && b.right-b.left>=.04 && b.top>=0 &&
    b.bottom+b.bend<=1.000001 && b.bottom-b.top>=.04 && b.bend>=0 && b.bend<=.25;
}
export function cylinder(box,b) {
  const [x,y,w,h]=box, left=x+w*b.left, right=x+w*b.right, radius=(right-left)/2;
  const baseLeft=x+w*(b.baseLeft??b.left),baseRight=x+w*(b.baseRight??b.right);
  const top=y+h*b.top,height=h*(b.bottom-b.top),bend=h*b.bend;
  const pivotX=b.pivotX??(b.left+b.right+(b.baseLeft??b.left)+(b.baseRight??b.right))/4;
  const pivotY=b.pivotY??(b.top+b.bottom+b.bend)/2;
  const cx=x+pivotX*w,cy=y+pivotY*h,angle=b.rotation??0;
  const co=Math.cos(angle),si=Math.sin(angle);
  function rotate(X,Y){return [cx+(X-cx)*co-(Y-cy)*si,cy+(X-cx)*si+(Y-cy)*co]}
  function local(X,Y){return [cx+(X-cx)*co+(Y-cy)*si,cy-(X-cx)*si+(Y-cy)*co]}
  function row(Y){
    const t=Math.min(1,Math.max(0,(Y-top)/height));
    return [left+t*(baseLeft-left),right+t*(baseRight-right)];
  }
  function map(u,v){
    const a=(Math.min(1,Math.max(0,u))-.5)*Math.PI;
    const Y=top+height*v+bend*Math.cos(a),[l,r]=row(Y);
    return rotate(l+(r-l)*(1+Math.sin(a))/2,Y);
  }
  function inverse(X,Y){
    const [px,py]=local(X,Y),[l,r]=row(py);
    const a=Math.asin(Math.max(-1,Math.min(1,2*(px-l)/(r-l)-1)));
    return [.5+a/Math.PI,(py-top-bend*Math.cos(a))/height];
  }
  function contains(X,Y){
    const [px,py]=local(X,Y),[l,r]=row(py);
    return px>=l && px<=r;
  }
  return {map,inverse,contains,local,row,cx,cy,pivotX,pivotY,angle,top,height,bend,
    left:Math.min(left,baseLeft),right:Math.max(right,baseRight),
    ratio:Math.PI*radius/height,
    handles:[map(0,0),map(1,0),map(.5,0),map(.5,1),map(0,1),map(1,1),rotate((left+right)/2,top-30)]};
}

const layer=document.createElement('canvas'), layerCtx=layer.getContext('2d');
export function wrapImage(ctx,bitmap,body,state,w,h) {
  const tex=texture(bitmap,state.width*body.ratio*body.height);
  const x0=Math.floor(body.left), x1=Math.ceil(body.right);
  const y0=Math.floor(body.top), y1=Math.ceil(body.top+body.height+body.bend);
  const W=x1-x0,H=y1-y0;
  if(W<=0||H<=0)return;
  if(layer.width!==W)layer.width=W;
  if(layer.height!==H)layer.height=H;
  const frame=layerCtx.createImageData(W,H),out=frame.data;
  const angle=state.angle*Math.PI/180, co=Math.cos(angle),si=Math.sin(angle);
  const aw=state.width,ah=aw*bitmap.height/bitmap.width;
  for(let j=0;j<H;j++){
    const Y=y0+j+.5,[l,r]=body.row(Y);
    for(let i=Math.max(0,Math.ceil(l-x0-.5));i<W && x0+i+.5<=r;i++){
      const sine=Math.max(-1,Math.min(1,2*(x0+i+.5-l)/(r-l)-1));
      const dx=.5+Math.asin(sine)/Math.PI-state.x;
      const v=(Y-body.top-body.bend*Math.sqrt(1-sine*sine))/body.height;
      if(v<0||v>1)continue;
      const dy=(v-state.y)/body.ratio;
      const a=.5+(co*dx+si*dy)/aw,b=.5+(-si*dx+co*dy)/ah;
      if(a<0||a>=1||b<0||b>=1)continue;
      sample(tex,a,b,out,4*(j*W+i));
    }
  }
  layerCtx.putImageData(frame,0,0);ctx.save();ctx.translate(body.cx,body.cy);ctx.rotate(body.angle);ctx.drawImage(layer,x0-body.cx,y0-body.cy);ctx.restore();
}
export function drawGuides(ctx,body){
  ctx.save();ctx.beginPath();
  for(let i=0;i<=64;i++)ctx[i?'lineTo':'moveTo'](...body.map(i/64,0));
  for(let i=64;i>=0;i--)ctx.lineTo(...body.map(i/64,1));
  ctx.closePath();ctx.strokeStyle='#008e83';ctx.lineWidth=1.5;ctx.stroke();
  const [left,right]=body.handles,knob=body.handles[6];
  ctx.beginPath();ctx.moveTo((left[0]+right[0])/2,(left[1]+right[1])/2);ctx.lineTo(...knob);ctx.stroke();
  for(const p of body.handles){ctx.beginPath();ctx.arc(...p,7,0,Math.PI*2);ctx.fillStyle=p===knob?'#008e83':'white';ctx.fill();ctx.stroke()}
  ctx.restore();
}
