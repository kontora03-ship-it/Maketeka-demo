const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const cropRatios={'1:1':1,'4:3':4/3,'3:4':3/4,'16:9':16/9,'9:16':9/16};

export function validCrop(crop){
 if(!crop||!['free',...Object.keys(cropRatios)].includes(crop.format))return null;
 const {x,y,w,h,format}=crop;
 if(![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>1+1e-8||y+h>1+1e-8)return null;
 return {x,y,w,h,format};
}

export function cropPixels(crop,width,height){
 let {x,y,w,h,format}=crop;
 x*=width;y*=height;w*=width;h*=height;
 const ratio=cropRatios[format];
 if(ratio){
  const fittedW=Math.min(w,h*ratio),fittedH=fittedW/ratio;
  x+=(w-fittedW)/2;y+=(h-fittedH)/2;w=fittedW;h=fittedH;
 }
 return {x,y,w,h};
}

function normalize({x,y,w,h},format,width,height){
 return {x:x/width,y:y/height,w:w/width,h:h/height,format};
}

export function chooseCrop(crop,format,width,height){
 if(format==='free')return normalize(cropPixels(crop,width,height),format,width,height);
 const current=cropPixels(crop,width,height);
 const ratio=cropRatios[format];
 const area=current.w*current.h;
 const w=Math.min(Math.sqrt(area*ratio),width,height*ratio),h=w/ratio;
 const x=clamp(current.x+(current.w-w)/2,0,width-w);
 const y=clamp(current.y+(current.h-h)/2,0,height-h);
 return normalize({x,y,w,h},format,width,height);
}

export function dragCrop(crop,handle,dx,dy,width,height){
 const {x,y,w,h}=cropPixels(crop,width,height);
 const format=crop.format;
 if(handle==='move')return normalize({x:clamp(x+dx,0,width-w),y:clamp(y+dy,0,height-h),w,h},format,width,height);
 const left=handle.includes('w'),top=handle.includes('n');
 const ax=left?x+w:x,ay=top?y+h:y;
 const limitW=left?ax:width-ax,limitH=top?ay:height-ay;
 const nextW=w+(left?-dx:dx),nextH=h+(top?-dy:dy);
 const ratio=cropRatios[format];
 let rw,rh;
 if(ratio){
  const maxW=Math.min(limitW,limitH*ratio);
  const proportionate=(nextW+nextH/ratio)/(1+1/(ratio*ratio));
  rw=clamp(proportionate,Math.min(maxW,24*Math.max(1,ratio)),maxW);rh=rw/ratio;
 }else{
  rw=clamp(nextW,Math.min(24,limitW),limitW);rh=clamp(nextH,Math.min(24,limitH),limitH);
 }
 return normalize({x:left?ax-rw:ax,y:top?ay-rh:ay,w:rw,h:rh},format,width,height);
}

export function exportCrop(crop,viewW,viewH,width,height){
 const box=cropPixels(crop,viewW,viewH);
 const x=Math.min(width-1,Math.round(box.x/viewW*width));
 const y=Math.min(height-1,Math.round(box.y/viewH*height));
 const w=Math.max(1,Math.min(width,Math.round((box.x+box.w)/viewW*width))-x);
 const h=Math.max(1,Math.min(height,Math.round((box.y+box.h)/viewH*height))-y);
 if(crop.format==='free')return {x,y,w,h};
 const [a,b]=crop.format.split(':').map(Number);
 const units=Math.floor(Math.min(w/a,h/b));
 if(!units)return {x,y,w,h};
 return {x:x+Math.floor((w-units*a)/2),y:y+Math.floor((h-units*b)/2),w:units*a,h:units*b};
}
