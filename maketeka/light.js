// Estimate the light direction from opposing halves of the selected surface.
const samples=new WeakMap();
export function photoAngle(photo,projection,box){
 let pixels=samples.get(photo);
 if(!pixels){
  const c=document.createElement('canvas');c.width=c.height=48;
  const ctx=c.getContext('2d');ctx.drawImage(photo,0,0,48,48);
  pixels=ctx.getImageData(0,0,48,48).data;samples.set(photo,pixels);
 }
 const center=projection.map(.5,.5);
 let mx=0,my=0,ml=0,xx=0,xy=0,yy=0,xl=0,yl=0,n=0;
 for(let j=0;j<8;j++)for(let i=0;i<8;i++){
  const p=projection.map(.1+.8*(i+.5)/8,.1+.8*(j+.5)/8);
  const u=Math.floor(48*(p[0]-box[0])/box[2]),v=Math.floor(48*(p[1]-box[1])/box[3]);
  if(u<0||v<0||u>47||v>47)continue;
  const k=4*(v*48+u),l=.21*pixels[k]+.72*pixels[k+1]+.07*pixels[k+2];
  const x=(p[0]-center[0])/box[2],y=(p[1]-center[1])/box[2];
  n++;mx+=x;my+=y;ml+=l;xx+=x*x;yy+=y*y;xy+=x*y;xl+=x*l;yl+=y*l;
 }
 if(n<3)return 0;
 xx-=mx*mx/n;yy-=my*my/n;xy-=mx*my/n;xl-=mx*ml/n;yl-=my*ml/n;
 return Math.round(Math.atan2(yl*xx-xl*xy,xl*yy-yl*xy)*180/Math.PI);
}
const ink=document.createElement('canvas'),ctx=ink.getContext('2d');
export function paintLight(t,w,h,projection,settings,draw){
 const d=t.getTransform().a;
 const W=Math.round(w*d),H=Math.round(h*d);
 if(ink.width!==W||ink.height!==H){ink.width=W;ink.height=H}
 ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);draw(ctx);
 const rad=settings.angle*Math.PI/180,dx=Math.cos(rad),dy=Math.sin(rad);
 const points=[[0,0],[1,0],[0,1],[1,1],[.5,.5]].map(p=>projection.map(...p));
 const coords=points.map(([x,y])=>x*dx+y*dy);
 const lo=Math.min(...coords),hi=Math.max(...coords),span=Math.max(1,hi-lo);
 const grad=ctx.createLinearGradient(lo*dx,lo*dy,(lo+span)*dx,(lo+span)*dy);
 const center=.15+.7*settings.position/100;
 const shade=settings.shadow/100,glow=settings.shine/100;
 grad.addColorStop(0,'rgba(0,0,0,'+shade+')');
 const width=(settings.glowSize??30)/30;
 const left=Math.max(.001,center-.06*width),right=Math.min(.999,center+.12*width);
 grad.addColorStop(left*.65,'rgba(0,0,0,'+shade*.65+')');
 grad.addColorStop(left,'rgba(0,0,0,0)');
 grad.addColorStop(center,'rgba(255,255,255,'+glow+')');
 grad.addColorStop(right,'rgba(255,255,255,0)');
 grad.addColorStop(1,'rgba(0,0,0,'+shade*.35+')');
 ctx.globalCompositeOperation='source-atop';ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';
 t.drawImage(ink,0,0,w,h);
}
