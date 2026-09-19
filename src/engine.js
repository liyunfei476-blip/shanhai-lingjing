export const LEVELS = [null, { cap: 12, hp: 100, rate: 1, cost: 8, duration: 4 }, { cap: 22, hp: 180, rate: 2, cost: 14, duration: 6 }, { cap: 32, hp: 280, rate: 3 }];
export const FACTIONS = [
  { name: '青木', short: '青', color: '#205d59', light: '#d9e7dd', symbol: '△' },
  { name: '赤羽', short: '赤', color: '#a33931', light: '#efd9ce', symbol: '◇' },
  { name: '赭岩', short: '赭', color: '#795231', light: '#e7dcc8', symbol: '□' },
  { name: '玄水', short: '玄', color: '#303b40', light: '#d8dfe0', symbol: '○' }
];
export const CARDS = {
  recruit: { name: '唤灵', icon: '灵', label: '唤醒墨灵', target: 'own', cd: 45, desc: '己方古树立即增加10灵，受灵力上限限制。至少需3个空位。' },
  haste: { name: '御风', icon: '风', label: '乘风而行', target: 'global', cd: 35, desc: '己方全体行军速度提升至1.7倍，持续8秒，期间新部队同样生效。' },
  guard: { name: '结界', icon: '结', label: '护树结界', target: 'own', cd: 40, desc: '根据古树等级获得40/70/100护盾，驻灵伤害提升25%，持续10秒。' },
  ink: { name: '惊雷', icon: '雷', label: '雷落灵根', target: 'enemy', cd: 45, desc: '消灭敌树最多4灵，并造成60耐久伤害。可破根，但须墨灵到场占领。' },
  aid: { name: '回春', icon: '春', label: '灵息回春', target: 'own', cd: 35, desc: '己方古树增加6灵并修复30耐久，均不超过上限。' },
  decoy: { name: '幻身', icon: '幻', label: '虚实相生', target: 'road', cd: 40, desc: '在灵脉放置8灵幻影，诱敌分流，持续8秒。遇敌无伤消散。' },
  silence: { name: '封脉', icon: '封', label: '九息封脉', target: 'enemy', cd: 40, desc: '冻结敌树孕灵9秒，不阻止其御灵、升级或使用卡牌。' }
};
const names = ['听雨','望川','栖霞','归雁','临溪','青石','南浦','松涧','白沙','云渡','春水','青岚','远山','竹里','寒江','浮岚','鹿鸣','风陵','平野','烟渚','疏林','石桥','晚照','长亭'];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const count = u => Math.max(0, Math.ceil((u?.power || 0) / 4 - 1e-8));
export function seeded(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export class Game {
  constructor(options = {}) {
    this.options = { size: 'small', opponents: 2, difficulty: 'standard', seed: 73129, autoPlayer: false, ...options };
    this.rng = seeded(this.options.seed); this.time = 0; this.nextId = 1; this.tick = 0;
    this.armies = []; this.ghosts = []; this.events = []; this.log = []; this.status = 'playing'; this.winner = null;
    this.lastCapture = 0; this.combatClock = 0; this.nodes = []; this.edges = []; this.stats = { orders: 0, cards: {}, captures: 0, aiVsAi: 0, rejected: 0, ghostResponses: 0 };
    const traits = ['expansion', 'defensive', 'raider'];
    for (let i=traits.length-1;i>0;i--) { const j=Math.floor(this.rng()*(i+1)); [traits[i],traits[j]]=[traits[j],traits[i]]; }
    this.factions = Array.from({ length: this.options.opponents + 1 }, (_, id) => ({ id, alive: true, trait: id === 0 ? 'expansion' : traits[id - 1], hand: ['recruit','haste','guard'], cooldowns: {}, bag: [], globalCD: 0, hasteUntil: 0, nextThink: 2 + this.rng() * 2, lastAction: 0, kills: 0, killProgress: 0, captured: 0, cardsUsed: 0, upgrades: 0, highest: 1, rewards: {} }));
    this.makeMap();
  }
  makeMap() {
    const cols = this.options.size === 'large' ? 4 : 3, rows = this.options.size === 'small' ? 4 : 6;
    this.world = { w: cols === 4 ? 560 : 420, h: rows === 4 ? 590 : 850 };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const id = r * cols + c, level = rows > 4 && r > 1 && r < rows - 2 && this.rng() < .22 ? 2 : 1;
      this.nodes.push({ id, name: names[id], x: 66 + c * (this.world.w - 132) / (cols - 1) + (this.rng() - .5) * 55, y: 64 + r * (this.world.h - 128) / (rows - 1) + (this.rng() - .5) * 56, owner: -1, level, power: (level === 2 ? 10 : 3 + Math.floor(this.rng() * 5)) * 4, hp: LEVELS[level].hp, prod: 0, shield: 0, guardUntil: 0, silenceUntil: 0, upgrade: null, lastHit: -100, battleUntil: -100, attackers: [], fightRound: 0 });
      if (c > 0) this.edges.push([id - 1, id]);
      if (r > 0) this.edges.push([id - cols, id]);
    }
    this.adj = this.nodes.map(() => []);
    for (const [a, b] of this.edges) { this.adj[a].push(b); this.adj[b].push(a); }
    const spawns = [this.nodes.length - cols, cols - 1, 0, this.nodes.length - 1];
    this.factions.forEach((f, i) => {
      const n = this.nodes[spawns[i]]; Object.assign(n, { owner: i, level: 1, hp: 100, power: 40 });
      for (const near of this.adj[n.id]) if (!spawns.includes(near)) this.nodes[near].power = 12;
    });
  }
  emit(type, data = {}) {
    const event = { type, time: this.time, id: this.nextId++, ...data };
    this.events.push(event); if (this.events.length > 250) this.events.shift();
    if (['capture','card','upgrade','eliminated','result','send','decoy'].includes(type)) { this.log.push(event); if (this.log.length > 2500) this.log.shift(); }
  }
  owned(owner) { return this.nodes.filter(n => n.owner === owner); }
  distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  networks() {
    const key=this.nodes.map(n=>n.owner).join(',');if(this.networkCache?.key===key)return this.networkCache;
    const sizes=Array(this.nodes.length).fill(0),components=[],seen=new Set();
    for(const n of this.nodes){if(n.owner<0||seen.has(n.id))continue;const group=[],open=[n.id];seen.add(n.id);
      while(open.length){const id=open.pop();group.push(id);for(const next of this.adj[id])if(!seen.has(next)&&this.nodes[next].owner===n.owner){seen.add(next);open.push(next);}}
      for(const id of group)sizes[id]=group.length;components.push({owner:n.owner,nodes:group});
    }
    return this.networkCache={key,sizes,components};
  }
  resonant(id){return this.networks().sizes[id]>=3;}
  edgeTime(a, b) {
    const A=this.nodes[a],B=this.nodes[b],resonance=A.owner>=0&&A.owner===B.owner&&this.resonant(a)?1.35:1;
    return this.distance(A,B)/28*({small:1.6,medium:1.7,large:1.8}[this.options.size])/resonance;
  }
  route(owner, start, target) {
    if (start === target) return [start];
    if (this.options.freeCommand) return this.nodes[start] && this.nodes[target] ? [start,target] : null;
    const dist = new Map([[start, 0]]), paths = new Map([[start, [start]]]), open = [start];
    while (open.length) {
      open.sort((a, b) => dist.get(a) - dist.get(b)); const a = open.shift();
      if (a === target) return paths.get(a);
      if (a !== start && this.nodes[a].owner !== owner) continue;
      for (const b of this.adj[a]) {
        const d = dist.get(a) + this.edgeTime(a, b);
        if (d < (dist.get(b) ?? Infinity)) { dist.set(b, d); paths.set(b, [...paths.get(a), b]); if (!open.includes(b)) open.push(b); }
      }
    }
    return null;
  }
  routeTime(path) { return path ? path.slice(1).reduce((sum, id, i) => sum + this.edgeTime(path[i], id), 0) : Infinity; }
  send(owner, source, target, ratio = .5, exact = null) {
    if (this.status !== 'playing' || !this.factions[owner]?.alive) return { ok: false, reason: '对局已经结束' };
    const n = this.nodes[source], to = this.nodes[target];
    if (!n || !to || n.owner !== owner || source === target) return { ok: false, reason: '请选择另一座可达古树' };
    const path = this.route(owner, source, target);
    if (!path) return { ok: false, reason: '道路未通，须先占领中间古树' };
    const amount = Math.min(count(n) - 2, exact == null ? Math.floor(count(n) * ratio) : Math.floor(exact));
    if (amount < 1) return { ok: false, reason: '至少需要留下2名驻灵' };
    if (this.options.freeCommand) return this.sendToPoint(owner,source,to,amount,target);
    n.power -= amount * 4;
    this.armies.push({ id: this.nextId++, owner, power: amount * 4, path, index: 0, progress: 0, source, target, ghostId: null });
    this.stats.orders++; this.factions[owner].lastAction = this.time;
    if (owner > 0 && to.owner > 0 && to.owner !== owner) this.stats.aiVsAi++;
    this.emit('send', { owner, source, target, amount }); return { ok: true, amount };
  }
  validPoint(point) { return point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x>=0 && point.y>=0 && point.x<=this.world.w && point.y<=this.world.h; }
  sendToPoint(owner, source, point, exact, target = null) {
    const n=this.nodes[source];
    if(this.status!=='playing'||!this.factions[owner]?.alive||!n||n.owner!==owner||!this.validPoint(point)||!Number.isFinite(exact)||(target!==null&&(!this.nodes[target]||target===source)))return {ok:false,reason:'请选择有效落点'};
    const amount=Math.min(Math.max(0,count(n)-2),Math.floor(exact));
    if(amount<1)return {ok:false,reason:'至少需要留下2名驻灵'};
    n.power-=amount*4;
    this.armies.push({id:this.nextId++,owner,power:amount*4,free:true,from:{x:n.x,y:n.y},destination:{x:point.x,y:point.y},progress:0,source,target,ghostId:null});
    this.stats.orders++;this.factions[owner].lastAction=this.time;
    if(owner>0&&this.nodes[target]?.owner>0&&this.nodes[target].owner!==owner)this.stats.aiVsAi++;
    this.emit('send',{owner,source,target,amount});return {ok:true,amount};
  }
  redirect(owner,id,point,exact,target=null) {
    const a=this.armies.find(a=>a.id===id);
    if(this.status!=='playing'||!this.factions[owner]?.alive||!a||a.owner!==owner||!this.validPoint(point)||!Number.isFinite(exact)||(target!==null&&!this.nodes[target]))return {ok:false,reason:'墨灵已离开选区'};
    const amount=Math.min(count(a),Math.floor(exact));if(amount<1)return {ok:false,reason:'未选中墨灵'};
    const power=Math.min(a.power,amount*4),from=this.armyPoint(a);a.power-=power;
    this.armies.push({id:this.nextId++,owner,power,free:true,from,destination:{x:point.x,y:point.y},progress:0,source:a.source,target,ghostId:null});
    this.armies=this.armies.filter(a=>a.power>0);this.stats.orders++;return {ok:true,amount};
  }
  upgrade(owner, id) {
    const n = this.nodes[id];
    if (this.status !== 'playing' || !n || n.owner !== owner) return { ok: false, reason: '请选择己方古树' };
    if (n.level === 3) return { ok: false, reason: '已是三级神木' };
    if (n.upgrade) return { ok: false, reason: '古树正在升级' };
    if (n.attackers.length) return { ok: false, reason: '交战中无法开始升级' };
    const rule = LEVELS[n.level];
    if (count(n) < rule.cost + 2) return { ok: false, reason: `需要${rule.cost}灵，并保留2灵` };
    n.power -= rule.cost * 4; n.upgrade = { remaining: rule.duration, duration: rule.duration }; this.factions[owner].lastAction = this.time;
    this.emit('upgradeStart', { node: id, owner }); return { ok: true };
  }
  drawCard(owner) {
    const f = this.factions[owner]; if (!f || !f.alive) return;
    if (!f.bag.length) { f.bag = Object.keys(CARDS); for (let i = f.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [f.bag[i], f.bag[j]] = [f.bag[j], f.bag[i]]; } }
    const key = f.bag.pop(); if (f.hand.length >= 5) { this.emit('discard', { owner, key }); return; }
    f.hand.push(key); this.emit('draw', { owner, key });
  }
  cardCheck(owner, key, target) {
    const f = this.factions[owner], card = CARDS[key], n = this.nodes[target];
    if (this.status !== 'playing' || !f?.alive || !card || !f.hand.includes(key)) return '没有这张卡牌';
    if (f.globalCD > this.time || (f.cooldowns[key] || 0) > this.time) return '卡牌尚在冷却';
    if (card.target === 'own' && n?.owner !== owner) return '请选择己方古树';
    if (card.target === 'enemy' && (!n || n.owner < 0 || n.owner === owner)) return '请选择敌方古树';
    if (key === 'recruit' && LEVELS[n.level].cap - count(n) < 3) return '树中至少需要3个空位';
    if (key === 'aid' && count(n) >= LEVELS[n.level].cap && n.hp >= LEVELS[n.level].hp) return '灵力与耐久已满';
    if (key === 'decoy' && (!target || !Number.isInteger(target.edge) || !this.edges[target.edge] || target.t < 0 || target.t > 1)) return '请选择一条道路';
    return null;
  }
  playCard(owner, key, target) {
    const reason = this.cardCheck(owner, key, target); if (reason) return { ok: false, reason };
    const f = this.factions[owner], n = this.nodes[target];
    f.hand.splice(f.hand.indexOf(key), 1); f.cooldowns[key] = this.time + CARDS[key].cd; f.globalCD = this.time + 1; f.cardsUsed++;
    this.stats.cards[key] = (this.stats.cards[key] || 0) + 1;
    switch (key) {
      case 'recruit': n.power = Math.min(LEVELS[n.level].cap * 4, n.power + 40); break;
      case 'haste': f.hasteUntil = this.time + 8; break;
      case 'guard': n.shield = Math.max(n.shield, [0,40,70,100][n.level]); n.guardUntil = this.time + 10; break;
      case 'ink': this.killDamage(n, 16, owner, n.owner); this.hitWall(n, 60); if (n.hp <= 0) this.breakCity(n); break;
      case 'aid': n.power = Math.min(LEVELS[n.level].cap * 4, n.power + 24); n.hp = Math.min(LEVELS[n.level].hp, n.hp + 30); break;
      case 'silence': n.silenceUntil = Math.max(n.silenceUntil, this.time + 9); break;
      case 'decoy': {
        const [a,b] = this.edges[target.edge], t = clamp(target.t,.18,.82);
        this.ghosts.push({ id: this.nextId++, owner, edge: target.edge, a, b, t, x: this.nodes[a].x + (this.nodes[b].x - this.nodes[a].x) * t, y: this.nodes[a].y + (this.nodes[b].y - this.nodes[a].y) * t, expires: this.time + 8, responded: [] }); break;
      }
    }
    this.emit('card', { owner, key, node: typeof target === 'number' ? target : null, point: key === 'decoy' ? this.ghosts.at(-1) : null });
    return { ok: true };
  }
  killDamage(unit, damage, killer, victim) {
    const before = count(unit); unit.power = Math.max(0, unit.power - damage);
    const kills = before - count(unit);
    if (kills && killer >= 0 && victim >= 0 && killer !== victim && this.factions[killer]?.alive) {
      const f = this.factions[killer]; f.kills += kills; f.killProgress += kills;
      while (f.killProgress >= 20) { f.killProgress -= 20; this.drawCard(killer); }
    }
    return kills;
  }
  hitWall(n, damage) {
    n.lastHit = this.time;
    if (n.guardUntil > this.time && n.shield > 0) { const absorbed = Math.min(n.shield, damage); n.shield -= absorbed; damage -= absorbed; }
    n.hp = Math.max(0, n.hp - damage);
  }
  clearStates(n) { n.shield = 0; n.guardUntil = 0; n.silenceUntil = 0; n.prod = 0; n.upgrade = null; }
  breakCity(n) {
    const previous = n.owner; n.owner = -1; n.power = 0; n.hp = 0; this.clearStates(n);
    this.emit('break', { node: n.id, owner: previous });
  }
  capture(n, group) {
    const previous = n.owner; n.owner = group.owner; n.power = Math.min(group.power, LEVELS[n.level].cap * 4); n.hp = LEVELS[n.level].hp * .5;
    this.clearStates(n); n.attackers = []; n.lastHit = this.time; this.lastCapture = this.time;
    const f = this.factions[n.owner]; f.captured++; f.highest = Math.max(f.highest, n.level); this.stats.captures++;
    if (this.time - (f.rewards[n.id] ?? -Infinity) >= 30) { this.drawCard(n.owner); f.rewards[n.id] = this.time; }
    this.emit('capture', { node: n.id, owner: n.owner, previous });
  }
  arrive(army) {
    const n = this.nodes[army.free ? army.target : army.path[army.index + 1]];
    if(!n)return;
    if (!army.free && n.owner === army.owner && army.index + 2 < army.path.length) { army.index++; army.progress = 0; return; }
    if (n.owner === army.owner) { n.power = Math.min(LEVELS[n.level].cap * 4, n.power + army.power); }
    else {
      const current = n.attackers.find(a => a.owner === army.owner);
      if (current) current.power += army.power; else n.attackers.push({ owner: army.owner, power: army.power, arrived: this.time });
      this.emit('clash', { node: n.id, owner: army.owner });
    }
    army.power = 0;
  }
  armyPoint(a) {
    const from = a.free?a.from:this.nodes[a.path[a.index]], to = a.free?a.destination:this.nodes[a.path[a.index + 1]];
    return { x: from.x + (to.x - from.x) * a.progress, y: from.y + (to.y - from.y) * a.progress };
  }
  returnGhostArmy(army) {
    if(army.free){const p=this.armyPoint(army),n=this.owned(army.owner).sort((a,b)=>this.distance(a,p)-this.distance(b,p))[0];if(n){army.from=p;army.destination={x:n.x,y:n.y};army.target=n.id;army.progress=0;}army.ghostId=null;return;}
    const from = army.path[army.index], to = army.path[army.index + 1];
    let candidates = this.owned(army.owner).map(n => this.route(army.owner, from, n.id)).filter(Boolean).sort((a,b) => this.routeTime(a) - this.routeTime(b));
    const tail = candidates[0] || [from];
    army.path = [to, ...tail]; army.index = 0; army.progress = 1 - army.progress; army.target = tail.at(-1); army.ghostId = null;
  }
  updateArmies(dt, combat) {
    const activeGhostIds = new Set(this.ghosts.filter(g => g.expires > this.time).map(g => g.id));
    for (const a of this.armies) if (a.ghostId && !activeGhostIds.has(a.ghostId)) this.returnGhostArmy(a);
    this.ghosts = this.ghosts.filter(g => g.expires > this.time);
    const blocked = new Set(), damage = new Map();
    // Contact is symmetric; no fixed owner gets first-strike advantage.
    for (let i = 0; i < this.armies.length; i++) for (let j = i + 1; j < this.armies.length; j++) {
      const a = this.armies[i], b = this.armies[j]; if (a.owner === b.owner || a.power <= 0 || b.power <= 0) continue;
      if(a.free||b.free){if(this.distance(this.armyPoint(a),this.armyPoint(b))>14)continue;}else{
      const af = a.path[a.index], at = a.path[a.index + 1], bf = b.path[b.index], bt = b.path[b.index + 1];
      if (!((af === bf && at === bt) || (af === bt && at === bf))) continue;
      const bp = af === bf ? b.progress : 1 - b.progress;
      if (Math.abs(a.progress - bp) > .045) continue;
      }
      if (blocked.has(a.id) || blocked.has(b.id)) continue;
      blocked.add(a.id); blocked.add(b.id);
      if (combat) {
        const k = Math.min(3, count(a), count(b));
        damage.set(a, { amount: k * 4, killer: b.owner }); damage.set(b, { amount: k * 4, killer: a.owner });
        this.emit('roadClash', { ...this.armyPoint(a), owner: a.owner, other: b.owner });
      }
    }
    for (const [a,d] of damage) this.killDamage(a,d.amount,d.killer,a.owner);
    for (const a of this.armies) {
      if (a.power <= 0 || blocked.has(a.id)) continue;
      if(a.free){
        const duration=Math.max(.05,this.distance(a.from,a.destination)/28*({small:1.6,medium:1.7,large:1.8}[this.options.size]));
        const resonance=a.target!==null&&this.nodes[a.source]?.owner===a.owner&&this.nodes[a.target]?.owner===a.owner&&this.resonant(a.source)?1.35:1;
        a.progress=Math.min(1,a.progress+dt/duration*(this.factions[a.owner].hasteUntil>this.time?1.7:1)*resonance);
        for(const g of this.ghosts)if(g.owner!==a.owner&&g.expires>this.time&&this.distance(this.armyPoint(a),g)<14){g.expires=this.time;this.emit('ghostGone',{x:g.x,y:g.y,owner:g.owner});if(a.ghostId===g.id)this.returnGhostArmy(a);}
        if(a.progress>=1&&a.target!==null)this.arrive(a);
        continue;
      }
      const nextNode = this.nodes[a.path[a.index + 1]];
      if (!a.ghostId && nextNode.owner !== a.owner && a.index + 2 < a.path.length) { a.path = a.path.slice(0,a.index+2); a.target = nextNode.id; }
      a.progress += dt / this.edgeTime(a.path[a.index], a.path[a.index + 1]) * (this.factions[a.owner].hasteUntil > this.time ? 1.7 : 1);
      for (const g of this.ghosts) {
        if (g.owner === a.owner || g.expires <= this.time) continue;
        const from = a.path[a.index], to = a.path[a.index + 1];
        if (!((from === g.a && to === g.b) || (from === g.b && to === g.a))) continue;
        const p = from === g.a ? g.t : 1 - g.t;
        if (Math.abs(a.progress - p) < .05) {
          g.expires = this.time; this.emit('ghostGone', { x: g.x, y: g.y, owner: g.owner });
          if (a.ghostId === g.id) this.returnGhostArmy(a);
        }
      }
      if (a.progress >= 1) this.arrive(a);
    }
    this.armies = this.armies.filter(a => a.power > 0);
  }
  battle(n) {
    n.attackers = n.attackers.filter(a => a.power > 0 && this.factions[a.owner]?.alive);
    // Friendly arrivals are reinforcements even if the node changed hands en route.
    for (const a of n.attackers.filter(a => a.owner === n.owner)) n.power = Math.min(LEVELS[n.level].cap * 4, n.power + a.power);
    n.attackers = n.attackers.filter(a => a.owner !== n.owner);
    if (!n.attackers.length) return;
    n.battleUntil = this.time + 2;
    if (n.power > 0) {
      const defenders = count(n), defenderOwner = n.owner, attacks = n.attackers.map(a => ({ a, k: Math.min(3, count(a), defenders) }));
      const targets = [...n.attackers]; const offset = n.fightRound++ % targets.length; let remaining = Math.min(3, defenders);
      const retaliation = new Map();
      for (let i = 0; remaining > 0 && i < 3; i++) { const a = targets[(i + offset) % targets.length]; if (count(a) > (retaliation.get(a) || 0)) { retaliation.set(a, (retaliation.get(a) || 0) + 1); remaining--; } }
      // Allocate simultaneous real soldier kills without granting rout kills.
      for (const {a,k} of attacks) { this.killDamage(n, k * 4, a.owner, defenderOwner); this.hitWall(n, k * 10); }
      for (const [a,k] of retaliation) this.killDamage(a, k * (n.guardUntil > this.time ? 5 : 4), defenderOwner, a.owner);
      this.emit('clash', { node: n.id, owner: defenderOwner });
      if (n.hp <= 0) this.breakCity(n);
    }
    n.attackers = n.attackers.filter(a => a.power > 0);
    if (n.power > 0) return;
    if (n.attackers.length === 1) { this.capture(n, n.attackers[0]); return; }
    if (n.attackers.length > 1) {
      if (n.owner !== -1) this.breakCity(n);
      const groups = [...n.attackers], incoming = new Map(); const offset = n.fightRound++ % (groups.length - 1) + 1;
      groups.forEach((a,i) => { const b = groups[(i + offset) % groups.length]; incoming.set(b, [...(incoming.get(b) || []), { source: a.owner, amount: Math.min(3,count(a),count(b)) * 4 }]); });
      for (const [a,hits] of incoming) for (const hit of hits) this.killDamage(a,hit.amount,hit.source,a.owner);
      n.attackers = n.attackers.filter(a => a.power > 0);
      if (n.attackers.length === 1) this.capture(n, n.attackers[0]);
    }
  }
  step(dt = .05) {
    if (this.status !== 'playing') return;
    this.time += dt; this.tick++; this.combatClock += dt;
    const combat = this.combatClock >= .5 - 1e-8; if (combat) this.combatClock -= .5;
    for (const n of this.nodes) {
      if (n.guardUntil <= this.time) n.shield = 0;
      if (n.owner >= 0) {
        if (n.upgrade) {
          if (!n.attackers.length && this.time >= n.battleUntil) n.upgrade.remaining -= dt;
          if (n.upgrade.remaining <= 1e-8) { const ratio = n.hp / LEVELS[n.level].hp; n.level++; n.hp = ratio * LEVELS[n.level].hp; n.upgrade = null; this.factions[n.owner].upgrades++; this.factions[n.owner].highest = Math.max(n.level, this.factions[n.owner].highest); this.emit('upgrade', { node: n.id, owner: n.owner }); }
        } else if (count(n) >= LEVELS[n.level].cap) n.prod = 0;
        else if (n.silenceUntil <= this.time) {
          n.prod += dt; if (n.prod >= 3 - 1e-8) { n.prod -= 3; n.power = Math.min(n.power + LEVELS[n.level].rate * 4, LEVELS[n.level].cap * 4); }
        }
      }
      if (n.hp > 0 && !n.attackers.length && this.time - n.lastHit >= 12) n.hp = Math.min(LEVELS[n.level].hp,n.hp + LEVELS[n.level].hp * (this.resonant(n.id)?.015:.01) * dt);
    }
    this.updateArmies(dt, combat);
    if (combat) for (const n of this.nodes) this.battle(n);
    this.checkEnd();
    if (this.status !== 'playing') return;
    for (const f of this.factions) if (f.alive && (f.id > 0 || this.options.autoPlayer) && this.time >= f.nextThink) {
      const base = this.options.difficulty === 'easy' ? 1.8 : this.options.difficulty === 'hard' ? .8 : 1;
      f.nextThink = this.time + base + this.rng() * .5; this.think(f);
    }
  }
  checkEnd() {
    const sizes = this.factions.map(f => this.owned(f.id).length);
    for (const f of this.factions) if (f.alive && sizes[f.id] === 0) { f.alive = false; f.hand = []; this.armies = this.armies.filter(a => a.owner !== f.id); this.ghosts = this.ghosts.filter(g => g.owner !== f.id); for (const n of this.nodes) n.attackers = n.attackers.filter(a => a.owner !== f.id); this.emit('eliminated', { owner: f.id }); }
    const victor = sizes.findIndex(size => size === this.nodes.length);
    if (victor >= 0) { this.winner = victor; this.status = victor === 0 ? 'victory' : 'defeat'; this.emit('result', { winner: victor }); }
    else if (!this.options.autoPlayer && !this.factions[0].alive) { this.status = 'defeat'; this.emit('result', { winner: null }); }
    else if (!this.factions.some(f => f.alive)) { this.status = 'draw'; this.emit('result', { winner: null }); }
  }
  incoming(id, owner, friendly = true) {
    return this.armies.filter(a => a.target === id && (friendly ? a.owner === owner : a.owner !== owner)).reduce((sum,a) => sum + count(a), 0);
  }
  estimateNeed(n, eta = 0) {
    const growth = n.owner >= 0 && !n.upgrade && n.silenceUntil < this.time + eta ? Math.floor(eta / 3) * LEVELS[n.level].rate : 0;
    const garrison = Math.min(LEVELS[n.level].cap, count(n) + growth);
    const shield = n.guardUntil > this.time + eta ? n.shield : 0;
    return Math.min(garrison * (shield ? 1.25 : 1) + 1, Math.ceil((n.hp + shield) / 10) + 2);
  }
  think(f) {
    const own = this.owned(f.id), enemies = this.nodes.filter(n => n.owner >= 0 && n.owner !== f.id);
    const fronts = own.filter(n => this.adj[n.id].some(id => this.nodes[id].owner !== f.id));
    const priorities = new Map(own.map(n => [n.id,(fronts.includes(n) ? 100 : 0) + count(n) - (fronts.includes(n) ? 0 : Math.min(100,...fronts.map(t => this.routeTime(this.route(f.id,n.id,t.id))))) * .7]));
    const danger = own.map(n => ({ n, incoming: this.incoming(n.id,f.id,false) + n.attackers.reduce((s,a) => s + count(a),0) })).sort((a,b) => b.incoming - count(b.n) - (a.incoming - count(a.n)));
    // Tactical cards precede orders, using only visible state and the AI's own hand.
    if (f.globalCD <= this.time) for (const key of [...f.hand]) {
      if ((f.cooldowns[key] || 0) > this.time) continue;
      let target = null, should = false;
      if (key === 'guard' || key === 'aid') { const d = danger.find(d => d.incoming > count(d.n) * .65 && d.incoming > 3); if (d) { target = d.n.id; should = true; } }
      if (key === 'recruit') { const n = own.filter(n => LEVELS[n.level].cap - count(n) >= 6).sort((a,b) => count(a) - count(b))[0]; if (n) { target = n.id; should = true; } }
      if (key === 'haste') should = this.armies.some(a => a.owner === f.id && count(a) >= 5);
      if (key === 'ink') { const n = enemies.find(n => n.hp <= 60 || this.incoming(n.id,f.id) > 0 || n.attackers.some(a => a.owner === f.id)); if (n) { target = n.id; should = true; } }
      if (key === 'silence') { const n = enemies.find(n => count(n) < LEVELS[n.level].cap - 2 && this.incoming(n.id,f.id) > 0 && n.silenceUntil <= this.time); if (n) { target = n.id; should = true; } }
      if (key === 'decoy' && this.time - this.lastCapture < 25) { const edge = this.edges.findIndex(([a,b]) => (this.nodes[a].owner === f.id && this.nodes[b].owner >= 0 && this.nodes[b].owner !== f.id) || (this.nodes[b].owner === f.id && this.nodes[a].owner >= 0 && this.nodes[a].owner !== f.id)); if (edge >= 0) { target = { edge, t: .5 }; should = true; } }
      if (should && this.playCard(f.id,key,target).ok) break;
    }
    const acted = new Set(); let orders = 0;
    // A perceived hostile eight-soldier contact uses the same tactical response channel.
    for (const g of this.ghosts) {
      if (g.owner === f.id || g.responded.includes(f.id)) continue;
      const candidates = own.filter(n => count(n) >= 9 && this.incoming(n.id,f.id,false) < 3 && (own.length > 1 || count(n) >= 12)).map(n => {
        const paths = [g.a,g.b].map(end => this.route(f.id,n.id,end)).filter(path => path && path.length <= 3 && this.nodes[path.at(-1)].owner === f.id).sort((a,b) => this.routeTime(a) - this.routeTime(b)); return { n, path: paths[0] };
      }).filter(c => c.path);
      if (candidates.length) {
        const {n,path} = candidates[0], endpoint = path.at(-1), other = endpoint === g.a ? g.b : g.a;
        const amount = Math.min(count(n) - 4, 6); n.power -= amount * 4; acted.add(n.id); orders++;
        this.armies.push({ id: this.nextId++, owner: f.id, power: amount * 4, path: [...path,other], index: 0, progress: 0, source: n.id, target: other, ghostId: g.id });
        if(this.options.freeCommand){const army=this.armies.at(-1);Object.assign(army,{free:true,from:{x:n.x,y:n.y},destination:{x:g.x,y:g.y},target:null});}
        g.responded.push(f.id); this.stats.ghostResponses++; this.emit('decoy', { owner: f.id, node: n.id }); break;
      }
    }
    // Issue a two-city siege atomically. Counting future allies without actually
    // ordering them was insufficient to break mature, high-production fronts.
    if (orders === 0) for (const target of enemies.filter(t => this.adj[t.id].some(id => this.nodes[id].owner === f.id)).sort((a,b)=>a.hp-b.hp)) {
      const donors = own.filter(n => !n.upgrade && !n.attackers.length && this.incoming(n.id,f.id,false) < 3 && count(n) >= 10).map(n => ({ n, path:this.route(f.id,n.id,target.id) })).filter(d=>d.path).map(d=>({...d,eta:this.routeTime(d.path),available:count(d.n)-3})).filter(d=>d.eta<30).sort((a,b)=>a.eta-b.eta);
      if (donors.length<2) continue;
      const [a,b]=donors,committed=this.incoming(target.id,f.id),need=Math.ceil(this.estimateNeed(target,b.eta)*(f.trait==='defensive'?1.35:1.15));
      if (committed>=need || Math.max(a.available,b.available)>=need || a.available+b.available+committed<need || b.eta-a.eta>8) continue;
      for (const donor of [a,b]) { const result=this.send(f.id,donor.n.id,target.id,1,donor.available);if(result.ok){acted.add(donor.n.id);orders++;} }
      if(orders)break;
    }
    for (const n of [...own].sort((a,b) => priorities.get(b.id) - priorities.get(a.id))) {
      if (orders >= 2) break;
      if (acted.has(n.id)) continue;
      const reserve = Math.max(2, Math.min(LEVELS[n.level].cap - 2, this.incoming(n.id,f.id,false)));
      const available = count(n) - reserve; if (available < 2) continue;
      const urgent = danger.find(d => d.n.id !== n.id && d.incoming > count(d.n) + this.incoming(d.n.id,f.id) && this.route(f.id,n.id,d.n.id));
      if (urgent) { if (this.send(f.id,n.id,urgent.n.id,1,available).ok) orders++; continue; }
      const candidates = this.nodes.filter(t => t.owner !== f.id).map(t => {
        const path = this.route(f.id,n.id,t.id); if (!path) return null;
        const eta = this.routeTime(path), committed = this.incoming(t.id,f.id) + t.attackers.filter(a => a.owner === f.id).reduce((s,a) => s + count(a),0);
        const need = this.estimateNeed(t,eta), ratio = t.owner < 0 ? 1.05 : f.trait === 'defensive' ? 1.6 : f.trait === 'raider' ? 1.1 : 1.2;
        const stalemate = this.time - this.lastCapture > 45 ? .15 : 0;
        const wanted = Math.ceil(need * Math.max(1.05,ratio - stalemate));
        if (committed >= wanted || eta > 35) return null;
        const required = Math.max(2, wanted - committed);
        const networkValue=this.adj[t.id].filter(id=>this.nodes[id].owner===f.id).length*4+(t.owner>=0&&this.resonant(t.id)?6:0);
        const score = networkValue + (t.owner < 0 && f.trait === 'expansion' ? 26 : 12) + t.level * 5 - count(t) * (f.trait === 'raider' ? 1.2 : .45) - eta * .65 + (t.hp < LEVELS[t.level].hp * .4 ? 8 : 0);
        return { t, eta, required, score };
      }).filter(Boolean).sort((a,b) => b.score - a.score);
      const safe = this.incoming(n.id,f.id,false) === 0 && !n.attackers.length;
      const immediate = candidates.find(c => c.required <= available);
      // Preserve some expansion opportunities before investing scarce starting troops.
      const preferUpgrade = f.trait === 'defensive' ? this.time > 15 : own.length >= 2 && this.time > 22;
      if (safe && preferUpgrade && n.level < 3 && !n.upgrade && count(n) >= LEVELS[n.level].cost + 2 && (!immediate || this.rng() < (f.trait === 'defensive' ? .7 : .4))) { if (this.upgrade(f.id,n.id).ok) { orders++; continue; } }
      if (immediate && !n.upgrade) { const amount = Math.min(available, Math.max(immediate.required,Math.floor(count(n) * .65))); if (this.send(f.id,n.id,immediate.t.id,1,amount).ok) orders++; continue; }
      // Concentrate surplus behind a front instead of stranding it in capped rear cities.
      if (available >= 5 && safe && !n.upgrade) {
        const fronts = own.filter(t => t.id !== n.id && this.adj[t.id].some(id => this.nodes[id].owner !== f.id) && count(t) + this.incoming(t.id,f.id) < LEVELS[t.level].cap - 3).map(t => ({t,path:this.route(f.id,n.id,t.id)})).filter(x => x.path).sort((a,b) => this.routeTime(a.path) - this.routeTime(b.path));
        if (fronts.length && !this.adj[n.id].some(id => this.nodes[id].owner !== f.id)) { const t = fronts[0].t; const amount = Math.min(available,LEVELS[t.level].cap-count(t)-this.incoming(t.id,f.id)); if (amount > 2 && this.send(f.id,n.id,t.id,1,amount).ok) { orders++; continue; } }
      }
      // Against a larger fort, stage a coordinated siege only when the combined force can win.
      if (candidates.length && this.time - this.lastCapture > 30 && !n.upgrade) {
        const c = candidates[0]; const allies = own.filter(o => o.id !== n.id && !o.upgrade && this.route(f.id,o.id,c.t.id) && count(o) > 5);
        if (available + allies.reduce((s,o) => s + count(o) - 3,0) >= c.required && available >= 5) { if (this.send(f.id,n.id,c.t.id,1,available).ok) orders++; }
      }
    }
  }
  assertValid() {
    for (const n of this.nodes) {
      if (!Number.isFinite(n.power) || n.power < -1e-7 || n.power > LEVELS[n.level].cap * 4 + 1e-7) throw Error(`Invalid garrison ${n.id}`);
      if (!Number.isFinite(n.hp) || n.hp < 0 || n.hp > LEVELS[n.level].hp + 1e-6) throw Error(`Invalid wall ${n.id}`);
      if (n.owner >= 0 && !this.factions[n.owner].alive) throw Error('Eliminated city owner');
    }
    for (const a of this.armies) { if (a.power <= 0 || !Number.isFinite(a.progress) || (a.free?(!this.validPoint(a.from)||!this.validPoint(a.destination)||a.progress<0||a.progress>1||(a.target!==null&&!this.nodes[a.target])):!this.nodes[a.path[a.index+1]]) || !this.factions[a.owner].alive) throw Error('Invalid army'); }
    for (const f of this.factions) if (f.hand.length > 5) throw Error('Hand overflow');
    return true;
  }
}
