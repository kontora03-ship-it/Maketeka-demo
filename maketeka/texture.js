// Cache a prefiltered level for the projected width. Power-of-two steps
// keep the same level reusable while an object is dragged or rotated.
const cache=new WeakMap();
export function texture(image,projectedWidth){
 const level=Math.max(0,Math.floor(Math.log2(image.width/Math.max(1,projectedWidth))));
 let levels=cache.get(image);
 if(!levels){levels=new Map();cache.set(image,levels)}
 if(levels.has(level))return levels.get(level);
 const c=document.createElement('canvas');
 c.width=Math.max(1,Math.round(image.width/2**level));
 c.height=Math.max(1,Math.round(image.height/2**level));
 const ctx=c.getContext('2d');
 ctx.imageSmoothingQuality='high';
 ctx.drawImage(image,0,0,c.width,c.height);
 const result=ctx.getImageData(0,0,c.width,c.height);
 levels.set(level,result);
 return result;
}
export function sample(tex,u,v,out,offset){
 const x=u*tex.width-.5,y=v*tex.height-.5,left=Math.floor(x),top=Math.floor(y);
 const fx=x-left,fy=y-top;
 let alpha=0,r=0,g=0,b=0;
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){
   const px=left+i,py=top+j;
   if(px<0||px>=tex.width||py<0||py>=tex.height)continue;
   const src=4*(py*tex.width+px);
   const a=tex.data[src+3]*(i?fx:1-fx)*(j?fy:1-fy);
   alpha+=a;r+=tex.data[src]*a;g+=tex.data[src+1]*a;b+=tex.data[src+2]*a;
 }
 if(alpha){out[offset]=r/alpha;out[offset+1]=g/alpha;out[offset+2]=b/alpha}
 out[offset+3]=alpha;
}
