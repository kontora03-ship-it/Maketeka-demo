// Dimensions in millimeters. The front and back share their side seams.
// Each sleeve starts at the matching perimeter of the dropped armhole.
const TAU=2*Math.PI;
const armDepth=.335;
const neckLeft=17,neckRight=31,columns=48,armSteps=18;
const levels=[0,.006,.019,.030,...Array.from({length:armSteps-1},(_,i)=>armDepth*(i+1)/armSteps).filter(v=>v>.030),armDepth,
 ...Array.from({length:24},(_,i)=>armDepth+(.962-armDepth)*(i+1)/24),.970,.980,.986,1];
const folds={
 front:[[.15,.44,.046,.36,.035,12],[.31,.68,.081,.42,-.024,-10],[.57,.83,.098,.38,-.033,9],[.76,.65,.068,.41,.020,-11],[.91,.69,.051,.34,-.034,10],[.82,.24,.062,.16,.21,-6]],
 back:[[.16,.49,.061,.40,.037,-9],[.32,.71,.074,.47,-.028,13],[.52,.58,.107,.38,.058,-8],[.68,.73,.066,.49,-.021,14],[.86,.67,.062,.42,.021,-9]]
};
const mix=(a,b,t)=>a+(b-a)*t;
const smoothstep=t=>t*t*(3-2*t);
function tint(hex,shade){
 return '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*shade).toString(16).padStart(2,'0')).join('');
}
function panel(u,v,side){
 const across=2*u-1,abs=Math.abs(across);
 const neckOffset=(u-.5)/(7/columns);
 const neck=Math.max(0,1-neckOffset**2);
 const neckDip=neck**.84;
 const worldU=side===1?u:1-u;
 const neckEdge=7/columns*2;
 const shoulder=Math.max(0,(abs-neckEdge)/(1-neckEdge));
 const sideWidth=209+13*Math.exp(-((v/.23)**2))-5*Math.sin(Math.PI*v)+3*v;
 const roundedAcross=.67*across+.33*Math.sin(across*Math.PI/2);
 const drift=5*Math.sin(Math.PI*v)*v;
 const x=side*roundedAcross*sideWidth+drift;
 const top=-350+105*(.52*shoulder+.48*shoulder**1.75)+(side===1?44:-5)*neckDip;
 const hem=350+3.4*Math.cos(worldU*TAU*1.12)+2.0*Math.sin(worldU*TAU*2.0);
 const shoulderEase=.029*shoulder*(1-Math.exp(-v/.027))*Math.exp(-v/.14);
 const y=mix(top,hem,v-shoulderEase);
 const breadth=Math.max(0,1-across**4)**.57;
 const underarm=v<armDepth?Math.sin(Math.PI*v/armDepth):0;
 const edgeDepth=37*underarm*abs**6;
 const bodyDepth=breadth*(side===1?91+12*Math.sin(v*Math.PI):86+17*v);
 const necklineDepth=(side===1?64:51)*Math.sqrt(neck);
 const upperBody=Math.min(1,v/.25);
 const transition=smoothstep(upperBody);
 const shoulderRound=Math.sin(upperBody*Math.PI/2);
 const roundWeight=.64*smoothstep(Math.min(1,Math.max(0,(abs-neckEdge+.06)/.39)));
 const expansion=mix(transition,shoulderRound,roundWeight);
 let drape=0;
 for(const [center,height,width,length,slant,depth] of folds[side===1?'front':'back']){
  const down=v-height;
  drape+=depth*Math.exp(-(((u-center-slant*down)/width)**2)-((down/length)**2));
 }
 const collarLift=Math.sin(neck*Math.PI/2)*4*Math.max(0,1-v/.021);
 const z=side*(mix(necklineDepth,bodyDepth,expansion)+edgeDepth+breadth*drape*transition+collarLift)-8+14*v;
 return [x,y,z];
}

export function buildTee(face,shadow,color){
 const seam=tint(color,.965),rib=tint(color,.987),inside=tint(color,.68);
 const footprint=[];
 for(const side of [1,-1]){
  const name=side===1?'front':'back';
  const grid=levels.map(v=>Array.from({length:columns+1},(_,i)=>panel(i/columns,v,side)));
  const lining=grid.map((row,j)=>row.map(([x,y,z])=>[x*.994,y+1.5*(1-2*levels[j]),z*.981]));
  for(let row=1;row<levels.length;row++){
   const v0=levels[row-1],v1=levels[row];
   for(let i=0;i<columns;i++){
    const q=[grid[row-1][i],grid[row-1][i+1],grid[row][i+1],grid[row][i]];
    const u0=i/columns,u1=(i+1)/columns;
    const collar=i>=neckLeft&&i<neckRight&&row<=3;
    const stitch=v0===.962||v0===.980;
    const shade=collar?(row===3?seam:rib):stitch?seam:color;
    const uv=collar?null:[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
    face(q,shade,uv,name,true,name,collar?'rib':'jersey');
    const inner=[lining[row-1][i],lining[row-1][i+1],lining[row][i+1],lining[row][i]];
    face([...inner].reverse(),inside,null,null,true,'teeLining'+name);
    if(row===1&&collar)face([q[1],q[0],inner[0],inner[1]],seam);
    if(row===levels.length-1)face([q[3],q[2],inner[2],inner[3]],seam);
   }
  }
  footprint.push(...grid.at(-1));
 }
 shadow.push(footprint);

 const ends=levels.filter(v=>v<=armDepth);
 for(const side of [1,-1]){
  // The first and last points of either half meet on the shoulder and armpit.
  const ring=[
   ...ends.map(v=>({p:panel(side===1?1:0,v,1),angle:Math.PI*v/armDepth})),
   ...ends.slice(1,-1).reverse().map(v=>({p:panel(side===1?0:1,v,-1),angle:TAU-Math.PI*v/armDepth}))
  ];
  function sleevePoint({p,angle},f){
   const outer=Math.cos(angle),around=Math.sin(angle);
   const cuffX=274+67*outer+4*around*side;
   const cuffY=44-32*outer+6*around+3*side;
   const cuffZ=-6+70*around+7*outer+3*side;
   const fold=(Math.sin(3*angle+side*.55)*4+Math.sin(5*angle+f*2)*1.6)*Math.sin(Math.PI*f*.89);
   const fall=f**1.10;
   return [
    mix(p[0],side*cuffX,f)+side*Math.sin(Math.PI*f)*(6+3*outer),
    mix(p[1],cuffY,fall)+Math.sin(Math.PI*f)*5*around,
    mix(p[2],cuffZ,f)+fold*around
   ];
  }
  const bands=[0,.018,.044,.10,.19,.29,.40,.51,.62,.72,.81,.89,.934,.948,.961,.981,1];
  const shell=bands.map(f=>ring.map(p=>sleevePoint(p,f)));
  const cuff=shell.at(-1);
  const lining=shell.map((row,i)=>row.map(([x,y,z])=>[x-side*2*bands[i],mix(y,44,.022*bands[i]),z*.97]));
  const inner=lining.at(-1);
  function emit(q,shade,surface,finish){
   face(side===1?q:q.reverse(),shade,null,null,true,surface+side,finish);
  }
  for(let i=0;i<ring.length;i++){
   const j=(i+1)%ring.length;
   for(let b=1;b<shell.length;b++){
    const a=shell[b-1],z=shell[b];
    const stitch=b===2||b===14||b===16;
    emit([a[i],z[i],z[j],a[j]],stitch?seam:color,'teeSleeve','jersey');
    const insideA=lining[b-1],insideZ=lining[b];
    emit([insideA[j],insideZ[j],insideZ[i],insideA[i]],inside,'teeSleeveLining','jersey');
   }
   emit([cuff[i],inner[i],inner[j],cuff[j]],seam,'teeSleeveRim','jersey');
  }
 }
}
