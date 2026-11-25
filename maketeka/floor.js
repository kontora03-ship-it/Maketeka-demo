// Convex parts are projected separately so openings such as the handle survive.
function hull(points){
  const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  function chain(list){
    const result=[];
    for(const p of list){
      while(result.length>1){
        const a=result[result.length-2],b=result[result.length-1];
        if((b[0]-a[0])*(p[1]-a[1])>(b[1]-a[1])*(p[0]-a[0]))break;
        result.pop();
      }
      result.push(p);
    }
    result.pop();return result;
  }
  return chain(sorted).concat(chain(sorted.reverse()));
}
export const floorSlope=.20;
export function floorAnchorY(w,h,zoom){
  return h*.469+Math.min(w/209,h/274)*123*zoom;
}
export function floorShadow(ctx,background,x,y,scale,parts,transform,floorHeight,softness,{opacity=1,bounce=true}={}){
  const rgb=parseInt((background||'#ffffff').slice(1),16);
  const luminance=(.2126*(rgb>>16)+.7152*((rgb>>8)&255)+.0722*(rgb&255))/255;
  const pixelRatio=Math.hypot(ctx.getTransform().a,ctx.getTransform().b);
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  if(bounce&&luminance<.18){
    ctx.save();ctx.scale(floorHeight*1.65,floorHeight*.38);
    const bounce=ctx.createRadialGradient(0,0,0,0,0,1);
    bounce.addColorStop(0,'rgba(255,255,255,'+(.105*(1-luminance/.18))+')');
    bounce.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=bounce;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  ctx.restore();ctx.save();
  ctx.beginPath();
  for(const part of parts){
    const outline=hull(part.map(p=>{
      const [right,down,depth]=transform(...p),height=Math.max(0,floorHeight+floorSlope*depth-down);
      return [x+scale*(right+.018*height),y+scale*(floorSlope*depth+.035*height)];
    }));
    ctx.moveTo(...outline[0]);
    for(const p of outline.slice(1))ctx.lineTo(...p);
    ctx.closePath();
  }
  ctx.fillStyle='black';
  ctx.filter='blur('+Math.max(1,softness*pixelRatio)+'px)';
  ctx.globalAlpha*=opacity*Math.min(1,1.5*(.17+.21*(1-luminance)));
  ctx.fill();ctx.restore();
}

export function paintBackdrop(ctx,w,h,state){
  if(state.transparentBackdrop)return;
  const base=ctx.createRadialGradient(w*.37,h*.33,0,w*.48,h*.42,Math.max(w,h)*.78);
  base.addColorStop(0,'#f5f2ef');base.addColorStop(.63,'#eae5e0');base.addColorStop(1,'#d8d4cf');
  ctx.fillStyle=state.background || (state.whiteBackdrop?'#fff':base);
  ctx.fillRect(0,0,w,h);
  const strength=(state.studioLight??100)/100;
  if(state.whiteBackdrop || strength===0)return;
  ctx.save();
  ctx.scale(w,h);
  ctx.globalAlpha*=strength;

  const shade=ctx.createRadialGradient(.83,.98,0,.83,.98,.69);
  shade.addColorStop(0,'rgba(38,34,31,.27)');
  shade.addColorStop(.48,'rgba(38,34,31,.125)');
  shade.addColorStop(1,'rgba(38,34,31,0)');
  ctx.fillStyle=shade;
  ctx.fillRect(0,0,1,1);

  const glow=ctx.createRadialGradient(.31,.23,0,.31,.23,.69);
  glow.addColorStop(0,'rgba(255,252,247,.55)');
  glow.addColorStop(.42,'rgba(255,252,247,.24)');
  glow.addColorStop(1,'rgba(255,252,247,0)');
  ctx.fillStyle=glow;
  ctx.fillRect(0,0,1,1);
  ctx.restore();
}
