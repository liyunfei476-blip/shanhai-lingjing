// Gesture geometry is independent of frame timing and input hardware.
export function circleNodes(nodes, center, radius, project) {
  return nodes.filter(n=>n.owner===0&&Math.hypot(project(n).x-center.x,project(n).y-center.y)<=radius).map(n=>n.id);
}
export function groupOrder(game, ids, target, ratio) {
  let amount=0,sent=0;const failures=[];
  for(const id of new Set(ids)) {
    if(id===target)continue;
    const r=game.send(0,id,target,ratio);
    if(r.ok){amount+=r.amount;sent++;}else failures.push(r.reason);
  }
  return {amount,sent,failures};
}
