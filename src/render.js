import { FACTIONS, LEVELS, count, clamp } from './engine.js';
import { patrolSpirits } from './gestures.js';
const brush = 'MoBrush, "Kaiti SC", serif';
const SPRITES={tree1:[70,90,490,540],tree2:[615,20,639,625],tree3:[0,632,747,622],spirit:[797,676,407,539]};
export class Renderer {
  constructor(canvas,game){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.game=game;this.zoom=1;this.pan={x:0,y:0};this.selected=null;this.group=new Set();this.spiritSelection=new Map();this.selectionCircle=null;this.drag=null;this.card=null;this.effects=[];this.reduced=false;this.lastEvent=0;this.sprites=new Map();
    this.backdrop=new Image();this.backdrop.src='./assets/spirit-forest.png';document.documentElement.style.setProperty('--forest-image',`url("${this.backdrop.src}")`);this.atlas=new Image();this.atlas.src='./assets/spirit-atlas.png';this.resize();
  }
  resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=this.w*this.dpr;this.canvas.height=this.h*this.dpr;this.baseScale=Math.max(.15,Math.min((this.w-8)/this.game.world.w,(this.h-52)/this.game.world.h));}
  fit(){this.zoom=1;this.pan={x:0,y:0};}
  get scale(){return this.baseScale*this.zoom;}
  get scaleX(){return this.scale*Math.min(1.6,(this.w-24)/(this.game.world.w*this.baseScale));}
  get offset(){return{x:(this.w-this.game.world.w*this.scaleX)/2+this.pan.x,y:(this.h-this.game.world.h*this.scale)/2+this.pan.y};}
  screen(p){const o=this.offset;return{x:p.x*this.scaleX+o.x,y:p.y*this.scale+o.y};}
  world(p){const o=this.offset;return{x:(p.x-o.x)/this.scaleX,y:(p.y-o.y)/this.scale};}
  nodeAt(p){return this.game.nodes.map(n=>{const q=this.screen(n),s=this.scale;return{n,d:Math.hypot((q.x-p.x)/Math.max(24,(25+n.level*3)*s),(q.y-12*s-p.y)/Math.max(32,(34+n.level*4)*s))};}).filter(v=>v.d<1).sort((a,b)=>a.d-b.d)[0]?.n||null;}
  patrol(n){return patrolSpirits(n,this.screen(n),this.scale,this.reduced?0:this.game.time);}
  roadAt(p){const q=this.world(p);let best=null;this.game.edges.forEach(([a,b],edge)=>{const A=this.game.nodes[a],B=this.game.nodes[b],dx=B.x-A.x,dy=B.y-A.y,t=clamp(((q.x-A.x)*dx+(q.y-A.y)*dy)/(dx*dx+dy*dy),.18,.82),d=Math.hypot(q.x-A.x-t*dx,q.y-A.y-t*dy);if(!best||d<best.d)best={edge,t,d};});return best&&best.d*this.scale<38?best:null;}
  sprite(kind,color){
    if(!this.atlas.complete||!this.atlas.naturalWidth)return null;const key=kind+color;if(this.sprites.has(key))return this.sprites.get(key);
    const rect=SPRITES[kind],c=document.createElement('canvas');c.width=rect[2];c.height=rect[3];const x=c.getContext('2d');x.drawImage(this.atlas,...rect,0,0,c.width,c.height);x.globalCompositeOperation='source-atop';x.globalAlpha=.62;x.fillStyle=color;x.fillRect(0,0,c.width,c.height);this.sprites.set(key,c);return c;
  }
  line(points,color,width=1){const c=this.ctx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  ring(x,y,r,color,width=1,portion=1){const c=this.ctx;c.beginPath();c.arc(x,y,r,-Math.PI/2,-Math.PI/2+Math.PI*2*portion);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  soldier(x,y,color,phase=0,scale=1,trail=0,face=1){
    const c=this.ctx,run=trail>1,sprite=this.sprite('spirit',color);if(!sprite)return;
    const h=(run?23:24)*scale,w=h*sprite.width/sprite.height,bob=this.reduced?0:Math.sin(phase)*.7*scale;
    c.save();if(trail){c.globalAlpha=.13;this.line([{x:x-face*2,y:y+3},{x:x-face*(3+trail),y:y+3}],color,1.5);c.globalAlpha=1;}
    c.translate(x,y+bob);c.scale(face,1);c.drawImage(sprite,-w/2,-h+5,w,h);c.restore();
  }
  city(n,now){
    const c=this.ctx,p=this.screen(n),s=clamp(this.scale,.34,1.25),r=(20+n.level*3)*s,active=this.group.has(n.id),selected=active||this.selected===n.id,color=FACTIONS[n.owner]?.color||'#838b7b',hp=n.hp/LEVELS[n.level].hp,resonant=this.game.resonant(n.id);
    const x=p.x+(!this.reduced&&this.game.time-n.lastHit<.15?Math.sin(now*.1)*1.7:0),y=p.y;
    const target=this.card&&(['ink','silence'].includes(this.card)?n.owner>0:['recruit','guard','aid'].includes(this.card)?n.owner===0:false);
    c.save();
    // Soft ownership wash under living trees. These are world objects, not circular city badges.
    const halo=c.createRadialGradient(x,y+8,0,x,y+8,r+19);halo.addColorStop(0,color+(resonant?'45':'24'));halo.addColorStop(1,color+'00');c.fillStyle=halo;c.fillRect(x-r-20,y-r-12,2*r+40,2*r+40);
    if(selected||target){c.setLineDash(active?[]:[4,5]);c.beginPath();c.ellipse(x,y+7,r+13,(r+13)*.64,0,0,Math.PI*2);c.strokeStyle=active?'#247762':color;c.lineWidth=active?2:1;c.stroke();c.setLineDash([]);}
    const tree=this.sprite('tree'+n.level,color),height=(68+n.level*10)*s,width=tree?height*tree.width/tree.height:0;
    const population=count(n),patrol=this.patrol(n);
    const spirits=front=>{for(const t of patrol.filter(t=>front?t.y>=y:t.y<y).sort((a,b)=>a.y-b.y)){
      if(this.spiritSelection.get(n.id)?.has(t.index)){c.fillStyle='#d9f0bacc';c.beginPath();c.arc(t.x,t.y-5,7*s+2,0,Math.PI*2);c.fill();this.ring(t.x,t.y-5,7*s+2,'#2c8069',1.2);}
      this.soldier(t.x,t.y,color,t.phase,clamp(s*.85,.35,1),.35,t.face);
    }};
    spirits(false);if(tree){c.globalAlpha=.5+.5*hp;c.drawImage(tree,x-width/2,y-height+15*s,width,height);c.globalAlpha=1;}spirits(true);
    // Numeral remains separate from the canopy and gets a small paper backing.
    c.textAlign='center';c.textBaseline='middle';c.font=`${Math.max(15,19*s)}px ${brush}`;const numberY=y+9,number=String(population),nw=c.measureText(number).width+10;c.fillStyle='#f5f5e6ec';c.fillRect(x-nw/2,numberY-10,nw,20);c.fillStyle=n.owner<0?'#737e67':color;c.fillText(number,x,numberY);
    const barW=Math.max(24,35*s),barY=y+22*s;c.fillStyle='#6c846132';c.fillRect(x-barW/2,barY,barW,2);c.fillStyle=color;c.fillRect(x-barW/2,barY,barW*hp,2);
    c.font=`${Math.max(10,12*s)}px ${brush}`;c.fillStyle=color;if(this.scale>.5||selected)c.fillText(n.name+(n.level===3?'·神木':n.level===2?'·古树':''),x,Math.min(this.h-10,y+36*s));
    if(resonant){c.fillStyle='#3c826a';c.font=`10px ${brush}`;c.fillText('共鸣',x,y-height+10*s);}
    if(n.guardUntil>this.game.time){c.strokeStyle='#649c8baa';c.lineWidth=2;c.beginPath();c.ellipse(x,y-7,r+12,r+25,0,0,Math.PI*2);c.stroke();}
    if(n.silenceUntil>this.game.time){c.font=`17px ${brush}`;c.fillStyle='#76536c';c.fillText('封',x+r+9,y-r);}
    if(n.upgrade){this.ring(x,y,r+9,'#a89448',2,1-n.upgrade.remaining/n.upgrade.duration);c.font=`11px ${brush}`;c.fillStyle='#7c7039';c.fillText(n.attackers.length?'受袭':'蕴养',x,y-r-26);}
    if(n.attackers.length){n.attackers.forEach((a,j)=>{const angle=j*2.1-1.6;for(let i=0;i<Math.min(count(a),28);i++){const aa=angle+(i%7-3)*.18,d=r+14+Math.floor(i/7)*6;this.soldier(x+Math.cos(aa)*d,y+Math.sin(aa)*d,FACTIONS[a.owner].color,now*.017+i,s*.9,2,Math.cos(aa)>0?-1:1);}});c.fillStyle='#a65854';c.font=`12px ${brush}`;c.fillText('争灵',x,y-r-21);}
    c.restore();
  }
  army(a,now){
    const c=this.ctx,p=this.screen(this.game.armyPoint(a)),color=FACTIONS[a.owner].color,s=clamp(this.scale,.6,1.2),num=count(a),haste=this.game.factions[a.owner].hasteUntil>this.game.time,from=this.game.nodes[a.path[a.index]],to=this.game.nodes[a.path[a.index+1]],angle=Math.atan2(to.y-from.y,to.x-from.x);
    for(let i=num-1;i>=0;i--){
      const row=Math.floor(i/4),col=i%4-1.5,dx=-row*7*s,dy=col*7*s;
      let x=p.x+Math.cos(angle)*dx-Math.sin(angle)*dy,y=p.y+Math.sin(angle)*dx+Math.cos(angle)*dy;
      if(a.progress<.16){const origin=this.screen(from),phase=i*2.399963+from.id*.73+this.game.time*.33,radius=(32+Math.floor(i/12)*8)*s,t=clamp(a.progress/.16,0,1);x=(origin.x+Math.cos(phase)*radius)*(1-t)+x*t;y=(origin.y+Math.sin(phase)*radius*.87)*(1-t)+y*t;}
      this.soldier(x,y,color,now*.018+i,s,haste?11:2,to.x>=from.x?1:-1);
    }
    c.textAlign='center';c.font=`13px ${brush}`;c.fillStyle='#f5f3e8ef';c.fillRect(p.x-10,p.y-29,20,16);c.fillStyle=color;c.fillText(num,p.x,p.y-20);
  }
  orders(){
    const c=this.ctx,d=this.drag;if(!d)return;let total=0,reachable=0;const target=d.target!=null?this.game.nodes[d.target]:null,sources=d.sources||[d.source];
    for(const id of sources){const source=this.game.nodes[id],A=this.screen(source),path=target?this.game.route(0,id,target.id):null,color=target&&!path?'#a3393155':'#205d59';const amount=Math.max(0,Math.min(count(source)-2,d.amounts?.get(id) ?? Math.floor(count(source)*d.ratio)));if(path){total+=amount;reachable++;}
      c.setLineDash([7,4]);c.lineDashOffset=-performance.now()/60;if(path){this.line(path.map(id=>this.screen(this.game.nodes[id])),color,2.5);}else this.line([A,{x:d.x,y:d.y}],color,1.8);c.setLineDash([]);
    }
    if(target){const p=this.screen(target);this.ring(p.x,p.y,Math.max(27,33*this.scale),reachable?'#205d59':'#a33931',2);}
    const text=target?(reachable?`${reachable}树 · ${total}灵`:'灵脉未通'):sources.length>1?`${sources.length}树齐发 · 拖向目标`:'松手出灵';
    c.font=`14px ${brush}`;const w=c.measureText(text).width+20,x=clamp(d.x, w/2+4,this.w-w/2-4),y=clamp(d.y-55,18,this.h-25);c.fillStyle='#213e35ee';c.fillRect(x-w/2,y-12,w,25);c.fillStyle='#fffae9';c.textAlign='center';c.textBaseline='middle';c.fillText(text,x,y+1);
  }
  draw(now){
    const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.w,this.h);c.fillStyle='#f2f0e7';c.fillRect(0,0,this.w,this.h);if(this.backdrop.complete&&this.backdrop.naturalWidth){c.globalAlpha=.38;c.drawImage(this.backdrop,0,0,this.w,this.h);c.globalAlpha=1;}
    c.lineCap='round';c.textBaseline='middle';
    for(const [a,b]of this.game.edges){const A=this.screen(this.game.nodes[a]),B=this.screen(this.game.nodes[b]),owner=this.game.nodes[a].owner,linked=owner>=0&&owner===this.game.nodes[b].owner,resonant=linked&&this.game.resonant(a),color=linked?FACTIONS[owner].color:'#85967b';
      if(linked){this.line([A,B],color+'16',resonant?10:5);this.line([A,B],color+(resonant?'70':'35'),resonant?1.7:1);if(resonant){const flow=this.reduced?0:(this.game.time*.16)%1;for(let k=0;k<3;k++){const t=(flow+k/3)%1;c.fillStyle=color+'90';c.beginPath();c.arc(A.x+(B.x-A.x)*t,A.y+(B.y-A.y)*t,2,0,Math.PI*2);c.fill();}}}
      else{c.setLineDash([2,6]);this.line([A,B],this.card==='decoy'?'#286c6688':color+'44',this.card==='decoy'?2.5:1);c.setLineDash([]);}
    }
    this.game.nodes.forEach(n=>this.city(n,now));this.game.armies.forEach(a=>this.army(a,now));
    for(const g of this.game.ghosts){const p=this.screen(g);c.save();c.globalAlpha=g.owner===0?.45:.9;for(let i=0;i<8;i++)this.soldier(p.x+(i%4-1.5)*8,p.y+Math.floor(i/4)*9,FACTIONS[g.owner].color,now*.012+i,.9,4);c.restore();}
    this.orders();
    if(this.selectionCircle){const {center:p,radius:r}=this.selectionCircle;c.save();c.fillStyle='#247b641a';c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();c.setLineDash([6,4]);this.ring(p.x,p.y,r,'#205d59',2);c.setLineDash([]);this.ring(p.x,p.y,3,'#205d59',1.5);c.font=`14px ${brush}`;c.fillStyle='#205d59';c.textAlign='center';c.fillText(`已选 ${[...this.spiritSelection.values()].reduce((sum,ids)=>sum+ids.size,0)} 灵${this.selectionCircle.locked?' · 圈内拖向目标':''}`,p.x,Math.max(18,p.y-r-13));c.restore();}
    for(const e of this.game.events){if(e.id<=this.lastEvent)continue;this.lastEvent=e.id;if(['clash','roadClash','capture','card','break','upgrade','ghostGone','send'].includes(e.type)){const p=e.node!=null?this.game.nodes[e.node]:e.source!=null?this.game.nodes[e.source]:e.point||e;if(p.x!=null)this.effects.push({type:e.type,x:p.x,y:p.y,owner:e.owner,born:now,key:e.key,amount:e.amount});}}
    this.effects=this.effects.filter(e=>now-e.born<900);
    for(const e of this.effects){const p=this.screen(e),age=(now-e.born)/900,color=FACTIONS[e.owner]?.color||'#333a30';c.save();c.globalAlpha=1-age;c.fillStyle=color;c.strokeStyle=color;
      if(['capture','card','upgrade','send'].includes(e.type)){this.ring(p.x,p.y,24+age*38,color+'77',2-age);const word=e.type==='send'?`−${e.amount}`:e.type==='capture'?'唤醒':e.type==='upgrade'?'进阶':{recruit:'唤灵',guard:'结界',ink:'惊雷',aid:'回春',silence:'封脉'}[e.key]||'施计';c.font=`${e.type==='send'?19:25}px ${brush}`;c.textAlign='center';c.fillText(word,p.x,p.y-32-age*25);}
      if(!this.reduced&&e.type!=='send')for(let i=0;i<15;i++){const a=i*2.39+e.born,r=5+age*(22+(i%4)*8);c.beginPath();c.ellipse(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r*.7,Math.max(.2,(1-age)*(1+i%4)),Math.max(.2,(1-age)*2),a,0,Math.PI*2);c.fill();}c.restore();
    }
  }
}
