import { count } from './engine.js';
// Gesture geometry is independent of frame timing and input hardware.
export function circleNodes(nodes, center, radius, project) {
  return nodes.filter(n=>n.owner===0&&Math.hypot(project(n).x-center.x,project(n).y-center.y)<=radius).map(n=>n.id);
}
export function groupOrder(game, ids, target, ratio, amounts = null) {
  let amount=0,sent=0;const failures=[];
  for(const id of new Set(ids)) {
    if(id===target)continue;
    const r=game.send(0,id,target,ratio,amounts?.get(id) ?? null);
    if(r.ok){amount+=r.amount;sent++;}else failures.push(r.reason);
  }
  return {amount,sent,failures};
}

// Use the same positions for drawing and selecting the orbiting spirits.
export function patrolSpirits(node, point, scale, time) {
  const s=Math.max(.34,Math.min(1.25,scale)),r=(20+node.level*3)*s;
  return Array.from({length:count(node)},(_,index)=>{
    const lane=Math.floor(index/12),angle=index*2.399963+node.id*.73+time*(.36-lane*.035),radius=r+12*s+lane*7*s;
    return {index,x:point.x+Math.cos(angle)*radius,y:point.y+Math.sin(angle)*radius*.73+5,face:Math.sin(angle)>0?-1:1,phase:time*8+index};
  });
}
export function circleSpirits(nodes,center,radius,patrol) {
  const result=new Map();
  for(const node of nodes){
    if(node.owner!==0)continue;
    const limit=Math.max(0,count(node)-2);
    const hits=patrol(node).filter(p=>Math.hypot(p.x-center.x,p.y-5-center.y)<=radius+4).slice(0,limit);
    if(hits.length)result.set(node.id,new Set(hits.map(p=>p.index)));
  }
  return result;
}
