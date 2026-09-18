import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, count } from '../src/engine.js';
import { circleNodes, circleSpirits, patrolSpirits, groupOrder } from '../src/gestures.js';
test('drag radius grows and shrinks selection without a hand-drawn path',()=>{const nodes=[{id:1,x:10,y:0,owner:0},{id:2,x:60,y:0,owner:0},{id:3,x:20,y:0,owner:1}],p=n=>n,c={x:0,y:0};assert.deepEqual(circleNodes(nodes,c,80,p),[1,2]);assert.deepEqual(circleNodes(nodes,c,30,p),[1]);assert.deepEqual(circleNodes(nodes,c,0,p),[]);});
test('circle uses projected screen coordinates and includes the boundary',()=>{assert.deepEqual(circleNodes([{id:1,x:10,y:0,owner:0}],{x:100,y:100},10,n=>({x:n.x+100,y:n.y+100})),[1]);});
test('group dispatch deduplicates and retains two defenders in each source',()=>{const g=new Game({opponents:1,seed:1});for(const id of [9,10,11]){g.nodes[id].owner=0;g.nodes[id].power=40;}const r=groupOrder(g,[9,9,10,11],11,1);assert.equal(r.sent,2);assert.equal(r.amount,16);assert.equal(count(g.nodes[9]),2);assert.equal(count(g.nodes[10]),2);assert.equal(count(g.nodes[11]),10);g.assertValid();});
test('partially blocked group sends only reachable sources',()=>{const g=new Game({opponents:1,seed:1});g.nodes[0].owner=0;g.nodes[0].power=40;const r=groupOrder(g,[9,0],10,.5);assert.equal(r.sent,1);assert.equal(r.failures.length,1);assert.equal(count(g.nodes[0]),10);});
test('captured selected sources cannot send stale orders',()=>{const g=new Game({opponents:1,seed:1});g.nodes[9].owner=1;assert.equal(groupOrder(g,[9],10,1).sent,0);});
test('three connected trees resonate, isolated trees do not; breaking the bridge removes resonance',()=>{const g=new Game({opponents:1,seed:1});for(const id of [6,7,8])g.nodes[id].owner=0;assert(g.resonant(6));assert.equal(g.networks().sizes[8],4);g.nodes[7].owner=1;assert(!g.resonant(8));assert(!g.resonant(6));});
test('resonance speeds only friendly internal routes and applies equally to AI',()=>{for(const owner of [0,1]){const g=new Game({opponents:1,seed:1});for(const id of [0,1,2])g.nodes[id].owner=owner;const normal=g.distance(g.nodes[0],g.nodes[1])/28*1.6;assert(Math.abs(g.edgeTime(0,1)-normal/1.35)<1e-8);const outer=g.distance(g.nodes[1],g.nodes[4])/28*1.6;assert(Math.abs(g.edgeTime(1,4)-outer)<1e-8);}});

test('circle selects visible spirits without enclosing their tree',()=>{
 const n={id:0,owner:0,level:1,power:40},positions=patrolSpirits(n,{x:100,y:100},1,0),first=positions[0];
 const selected=circleSpirits([n],{x:first.x,y:first.y-5},2,()=>positions);
 assert.deepEqual([...selected.get(0)],[0]);assert(Math.hypot(first.x-100,first.y-5-100)>2);
});
test('exact circle count is not halved again and always retains two defenders',()=>{
 const g=new Game({opponents:1,seed:1});
 const r=groupOrder(g,[9],10,.25,new Map([[9,3]]));assert.equal(r.amount,3);assert.equal(count(g.nodes[9]),7);
 const next=groupOrder(g,[9],10,1,new Map([[9,100]]));assert.equal(next.amount,5);assert.equal(count(g.nodes[9]),2);
});
test('circle excludes enemy spirits and reserves two at a full selection',()=>{
 const n={id:0,owner:0,level:1,power:40},other={...n,id:1,owner:1};
 const selected=circleSpirits([n,other],{x:100,y:100},100,node=>patrolSpirits(node,{x:100,y:100},1,0));
 assert.equal(selected.size,1);assert.equal(selected.get(0).size,8);
});
