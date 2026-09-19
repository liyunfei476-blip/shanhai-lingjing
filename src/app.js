import { Game, LEVELS, FACTIONS, CARDS, count, clamp } from './engine.js';
import { Renderer } from './render.js';
import { circleSpirits } from './gestures.js';

const $ = id => document.getElementById(id);
const dialog = $('main-dialog');
let saved = {}; try { saved = JSON.parse(localStorage.getItem('mojing.preferences') || '{}'); } catch {}
const preferences = { sound: true, music: false, vibration: true, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, ...saved };
let options = { size: 'small', opponents: 2, difficulty: 'standard', seed: 73129, freeCommand: true }, game = new Game(options), renderer = new Renderer($('map-canvas'),game);
let running = false, paused = false, selection = game.owned(0)[0].id, ratio = .5, selectedCard = null, halfMode = false, lastUI = 0, processedEvent = 0, speed = 1, modalType = '', uiHandKey = '', toastTimer, feed = [], actionPointer = null;
let selectedGroup = new Set(), spiritSelection = new Map(), armySelection = new Map();
function clearGroup(){selectedGroup.clear();spiritSelection.clear();armySelection.clear();renderer.selectionCircle=null;}
function selectedAmounts(){return new Map([...spiritSelection].map(([id,ids])=>[id,Math.min(ids.size,Math.max(0,count(game.nodes[id])-2))]));}
let audioContext, nextMusic = 0;
const pointers = new Map(); let pinch = null;
const fmtTime = t => `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const savePrefs = () => { try { localStorage.setItem('mojing.preferences',JSON.stringify(preferences)); } catch {} renderer.reduced = preferences.reduced; };
function tone(freq=300,duration=.08,volume=.025,kind='sine') { if(!audioContext)return;const o=audioContext.createOscillator(),gain=audioContext.createGain();o.type=kind;o.frequency.setValueAtTime(freq,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.8,audioContext.currentTime+duration);gain.gain.setValueAtTime(volume,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);o.connect(gain);gain.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration); }
function wakeAudio(){if(!audioContext)try{audioContext=new(window.AudioContext||window.webkitAudioContext)();}catch{}audioContext?.resume();}
function sound(type){if(!preferences.sound)return;const f={send:330,capture:580,card:410,upgrade:680,break:120,clash:95};tone(f[type]||260,type==='capture'?.3:.09,type==='clash'?.008:.025);}
function vibrate(){if(preferences.vibration&&navigator.vibrate)navigator.vibrate(12);}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
function openModal(type,html){modalType=type;paused=true;cancelGesture();dialog.innerHTML=`<div class="dialog-body">${html}</div>`;if(!dialog.open)dialog.showModal();}
function closeModal(){dialog.close();modalType='';paused=false;lastFrame=performance.now();}
dialog.addEventListener('cancel',e=>{e.preventDefault();if(['setup','result'].includes(modalType))return;closeModal();});
const titleArt = `<div class="title-art" aria-hidden="true"><span class="seal-small">山河志</span></div>`;
function showSetup(){
  running=false;openModal('setup',`<p class="dialog-overline">万 木 有 灵 · 引 墨 归 山</p><h2 class="dialog-title">山海灵境</h2>${titleArt}<p class="dialog-subtitle">连树成林，断脉破阵。<br>御使墨灵，唤醒一片山海。</p><div class="setup-group"><span class="setup-label">择一方天地</span><div class="choice-row" id="size-choices">${[['small','古林','12处灵树'],['medium','云岫','18处灵树'],['large','大荒','24处灵树']].map(([v,n,t])=>`<button class="choice ${options.size===v?'selected':''}" data-size="${v}">${n}<small>${t}</small></button>`).join('')}</div></div><div class="setup-group"><span class="setup-label">对弈灵主</span><div class="choice-row">${[1,2,3].map(v=>`<button class="choice ${options.opponents===v?'selected':''}" data-opponents="${v}">${['','一位','两位','三位'][v]}</button>`).join('')}</div></div><div class="setup-group"><span class="setup-label">用灵之道</span><div class="choice-row">${[['easy','初入'],['standard','论道'],['hard','问鼎']].map(([v,n])=>`<button class="choice ${options.difficulty===v?'selected':''}" data-difficulty="${v}">${n}</button>`).join('')}</div></div><button class="primary-button" id="start-game">入山唤灵</button><div class="dialog-footer"><button class="text-button" id="watch-game">先看灵境演化</button> · <button class="text-button" id="setup-help">读御灵录</button></div>`);
  dialog.querySelectorAll('[data-size],[data-opponents],[data-difficulty]').forEach(b=>b.onclick=()=>{if(b.dataset.size)options.size=b.dataset.size;if(b.dataset.opponents)options.opponents=Number(b.dataset.opponents);if(b.dataset.difficulty)options.difficulty=b.dataset.difficulty;b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));});
  $('start-game').onclick=()=>startGame(false);$('watch-game').onclick=()=>startGame(true);$('setup-help').onclick=()=>showHelp(true);
}
function startGame(watch=false,sameSeed=false){
  if(!sameSeed)options.seed=Math.floor(Math.random()*900000)+100000;
  game=new Game({...options,autoPlayer:watch});renderer.game=game;renderer.fit();renderer.resize();renderer.effects=[];renderer.lastEvent=0;
  selection=game.owned(0)[0].id;clearGroup();selectedGroup=new Set();renderer.group=selectedGroup;renderer.spiritSelection=spiritSelection;renderer.armySelection=armySelection;renderer.selected=selection;selectedCard=null;halfMode=false;speed=1;ratio=.5;$('ratio').value=50;
  processedEvent=0;feed=[];uiHandKey='';running=true;closeModal();wakeAudio();nextMusic=0;rebuildNodeControls();updateUI();
  toast(watch?'灵主对弈中 · 可在设置返回':'拉圆圈住墨灵 · 松手后点任意落点');
}
function showHelp(fromSetup=false){
  openModal('help',`<p class="dialog-overline">御 灵 入 门</p><h2 class="dialog-title">入山须知</h2><ul class="help-list"><li><b>一</b><strong>拉圆御灵</strong><br>从任意位置按下向外拉圆，拖远放大、拖近缩小。松手圆圈消失，选中的墨灵高亮；再点古树攻占或增援，点空地移动到落点。行军中、停驻中的墨灵都可以重新圈选改道。再次拖动始终重新拉圆，点击“取消”清除选择。圈到多少派多少，古树始终保留两名驻灵。</li><li><b>二</b><strong>养树与护根</strong><br>古树每三秒孕灵，满额暂停。消耗驻灵升级，最高三级。耐久归零直接破根；出灵始终保留两名驻灵。</li><li><b>三</b><strong>因势用计</strong><br>占树或每消灭20名敌灵得一张灵符，最多五张。点牌后选目标，长按牌查看详情。同类灵符共享冷却。</li><li><b>四</b><strong>万木归流</strong><br>占领全部古树才算获胜，失去全部古树立即败北。灵主各自为战，也会彼此攻伐。</li></ul><p class="fineprint">三棵己方古树经灵脉相连，内部行速提升35%，脱战生机恢复提升50%；断开即失效。<br>双指可缩放和移动地图；单指空白拉圆选灵；点击“全图”复位。<br>电脑版可用鼠标拖拽和滚轮缩放。打开说明或设置时全局暂停。</p><div class="help-cards">${Object.values(CARDS).map(c=>`<div class="help-card"><b>${c.name}</b><span>${c.desc}<br>同类冷却 ${c.cd} 秒</span></div>`).join('')}</div><button class="primary-button" id="help-close">${fromSetup?'返回择局':'心中有数'}</button>`);
  $('help-close').onclick=()=>fromSetup?showSetup():closeModal();
}
function showSettings(){
  if(!running){showSetup();return;}
  openModal('settings',`<p class="dialog-overline">歇 笔 片 刻</p><h2 class="dialog-title">山河静候</h2><p class="dialog-subtitle">对局已暂停 · ${fmtTime(game.time)}</p><label class="setting-line">落笔音效<input id="sound-setting" type="checkbox" ${preferences.sound?'checked':''}></label><label class="setting-line">清音伴奏<input id="music-setting" type="checkbox" ${preferences.music?'checked':''}></label><label class="setting-line">操作震动<input id="vibration-setting" type="checkbox" ${preferences.vibration?'checked':''}></label><label class="setting-line">减少动态效果<input id="motion-setting" type="checkbox" ${preferences.reduced?'checked':''}></label><p class="fineprint">山河卷 ${game.options.seed} · ${game.nodes.length}座古树<br>${game.options.autoPlayer?'当前为AI观战模式':'青木由你执掌'}</p><button class="primary-button" id="resume-game">继续落子</button><button class="secondary-button" id="restart-game">重战此图</button><button class="text-button" id="settings-exit">退出本局</button>`);
  for(const [id,key] of [['sound-setting','sound'],['music-setting','music'],['vibration-setting','vibration'],['motion-setting','reduced']])$(id).onchange=e=>{preferences[key]=e.target.checked;savePrefs();wakeAudio();};
  $('resume-game').onclick=closeModal;$('restart-game').onclick=()=>startGame(game.options.autoPlayer,true);$('settings-exit').onclick=showExit;
}
function showExit(){
  if(!running){showSetup();return;}
  openModal('exit',`<p class="dialog-overline">搁 笔 归 山</p><h2 class="dialog-title">离开此局？</h2><p class="dialog-subtitle">当前战局不会保存。<br>山河仍在，来日再争。</p><button class="primary-button" id="exit-continue">继续对局</button><button class="secondary-button" id="exit-confirm">退出，重新择局</button>`);
  $('exit-continue').onclick=closeModal;$('exit-confirm').onclick=showSetup;
}
function showResult(){
  const win=game.status==='victory',f=game.factions[0];
  openModal('result',`<p class="dialog-overline">${game.options.autoPlayer?'诸 侯 对 弈 · 终 卷':'山 河 终 卷'}</p><h2 class="dialog-title">${game.options.autoPlayer?(game.winner!=null?FACTIONS[game.winner].name+'一统':'灵主俱寂'):win?'万木回生':'灵脉暂寂'}</h2>${titleArt}<p class="dialog-subtitle">${win?'一纸山河，尽染青墨。':game.options.autoPlayer?'墨色落定，此卷已终。':'暂且收笔，再谋山河。'}</p><div class="result-grid"><div class="result-stat"><b>${fmtTime(game.time)}</b><span>本局用时</span></div><div class="result-stat"><b>${f.captured}</b><span>夺树次数</span></div><div class="result-stat"><b>${f.kills}</b><span>消灭敌灵</span></div><div class="result-stat"><b>${f.cardsUsed}</b><span>施计次数</span></div></div><p class="fineprint">最高古树：${['','一级','二级','三级'][f.highest]} · 升级${f.upgrades}次<br>山河卷 ${game.options.seed}</p><button class="primary-button" id="result-retry">再战此图</button><button class="secondary-button" id="result-new">另择山河</button>`);
  $('result-retry').onclick=()=>startGame(game.options.autoPlayer,true);$('result-new').onclick=showSetup;
}
function showCardInfo(key){const card=CARDS[key];openModal('cardinfo',`<p class="dialog-overline">灵 符 释 义</p><div class="card-detail-icon">${card.icon}</div><h2 class="dialog-title">${card.name}</h2><p class="card-detail-copy">${card.desc}</p><p class="fineprint">同类冷却 ${card.cd} 秒 · 使用后消耗一张<br>长按查看不会消耗卡牌</p><button class="primary-button" id="card-info-close">收卷</button>`);$('card-info-close').onclick=closeModal;}
function cancelTarget(){clearGroup();selectedCard=null;halfMode=false;renderer.card=null;renderer.drag=null;updateUI();}
function pickCard(key){if(!running||paused||game.options.autoPlayer)return;const f=game.factions[0];if((f.cooldowns[key]||0)>game.time){toast(`同类灵符冷却中，还需${Math.ceil(f.cooldowns[key]-game.time)}秒`);return;}clearGroup();halfMode=false;selectedCard=selectedCard===key?null:key;renderer.card=selectedCard;updateUI();}
function applyCard(target){if(!selectedCard)return;const key=selectedCard,result=game.playCard(0,key,target);if(result.ok){cancelTarget();sound('card');vibrate();toast(`${CARDS[key].name} · 已施放`);updateUI();}else toast(result.reason);}
function selectedNode(n){selection=n.id;renderer.selected=n.id;updateUI();}
function selectionCount(){return [...selectedAmounts().values()].reduce((a,b)=>a+b,0)+[...armySelection].reduce((sum,[id,slots])=>sum+Math.min(slots.size,count(game.armies.find(a=>a.id===id))),0);}
function command(point,target=null){
  const results=[];
  for(const [id,amount] of selectedAmounts())if(id!==target)results.push(game.sendToPoint(0,id,point,amount,target));
  for(const [id,slots] of armySelection)results.push(game.redirect(0,id,point,slots.size,target));
  if(results.some(r=>r.ok)){renderer.commandPoint={...point,born:performance.now()};sound('send');vibrate();clearGroup();}
  else if(results.length)toast(results[0].reason);
  else clearGroup();
  updateUI();
}
function handleNode(n){
  if(!running||paused)return;
  if(selectedCard){if(CARDS[selectedCard].target==='road'){toast('请点击灵脉上的落点');return;}if(CARDS[selectedCard].target==='global'){toast('点击下方“施放御风”确认');return;}applyCard(n.id);return;}
  if(halfMode){const result=game.send(0,selection,n.id,ratio);if(result.ok){toast(`已派出${result.amount}灵`);cancelTarget();sound('send');vibrate();}else toast(result.reason);updateUI();return;}
  if(selectionCount()){command(n,n.id);return;}
  clearGroup();selectedNode(n);
}
function rebuildNodeControls(){
  $('node-controls').innerHTML=game.nodes.map(n=>`<button class="node-access" id="node-${n.id}" aria-label="${n.name}树">${n.name}</button>`).join('');
  for(const n of game.nodes)$('node-'+n.id).onclick=()=>handleNode(n);
}
function updateUI(){
  const f=game.factions[0],n=game.nodes[selection],owned=game.owned(0).length;
  $('owned-count').textContent=owned;$('total-count').textContent=game.nodes.length;$('clock').textContent=fmtTime(game.time);
  const mapName={small:'青木初醒',medium:'云岫寻脉',large:'大荒灵境'}[game.options.size];$('map-name').textContent=mapName;$('map-inscription-title').textContent=mapName;$('seed-label').textContent=`山河卷 ${game.options.seed}`;
  $('faction-counts').innerHTML=game.factions.map(x=>`<span class="faction-item ${x.alive?'':'out'}" style="color:${FACTIONS[x.id].color}" title="${FACTIONS[x.id].name} · ${x.id===0&&!game.options.autoPlayer?'你':{expansion:'扩张型',defensive:'防守型',raider:'游击型'}[x.trait]}"><i>${FACTIONS[x.id].symbol}</i>${game.owned(x.id).length}</span>`).join('');
  if(n){const level=LEVELS[n.level];$('city-name').textContent=n.name;$('city-emblem').textContent=n.owner>=0?FACTIONS[n.owner].symbol:'○';$('city-emblem').style.color=n.owner>=0?FACTIONS[n.owner].color:'#888c7a';$('city-level').textContent=`${['','一级 · 灵芽','二级 · 古树','三级 · 神木'][n.level]}`;$('city-troops').innerHTML=`${count(n)}<span>/${level.cap}</span>`;$('city-hp').innerHTML=`${Math.ceil(n.hp)}<span>/${level.hp}${n.shield?' +'+Math.ceil(n.shield):''}</span>`;
    $('city-production').textContent=n.owner<0?'中立驻灵 · 不孕灵':n.upgrade?'蕴养期间暂停孕灵':n.silenceUntil>game.time?`封脉中 · ${Math.ceil(n.silenceUntil-game.time)}秒`:`每3秒孕灵${level.rate}灵${count(n)>=level.cap?' · 已满员':''}`;
    $('city-state').textContent=n.attackers.length?'两军交锋':n.guardUntil>game.time?`墨盾护树 · ${Math.ceil(n.guardUntil-game.time)}秒`:n.owner<0?'中立据点':`${FACTIONS[n.owner].name}所属`;
    $('upgrade-button').disabled=n.owner!==0||game.options.autoPlayer||n.level===3||!!n.upgrade||count(n)<(level.cost||0)+2||n.attackers.length>0;
    $('upgrade-button').innerHTML=`<span>${n.level===3?'神木已成':n.upgrade?'蕴养中':'进阶 ↑'}</span><small>${n.level===3?'已达最高级':n.upgrade?`${Math.ceil(n.upgrade.remaining)}秒${n.attackers.length?' · 暂停':''}`:`消耗 ${level.cost} 灵`}</small>`;
    $('half-button').disabled=n.owner!==0||game.options.autoPlayer||count(n)<=2;$('ratio').disabled=n.owner!==0||game.options.autoPlayer;
  }
  $('ratio').disabled=selectionCount()>0||n?.owner!==0||game.options.autoPlayer;$('ratio-label').textContent=selectionCount()?selectionCount()+'灵':Math.round(ratio*100)+'%';$('hand-count').textContent=`${f.hand.length} / 5`;
  const handKey=f.hand.join(',')+'|'+selectedCard;
  if(handKey!==uiHandKey){uiHandKey=handKey;$('cards').innerHTML=Array.from({length:5},(_,i)=>{const key=f.hand[i];if(!key)return'<div class="card empty" aria-label="空灵符位">待悟</div>';const c=CARDS[key];return`<button class="card ${selectedCard===key?'selected':''}" data-card="${key}" aria-label="${c.name}：${c.desc}" aria-pressed="${selectedCard===key}"><span class="card-name">${c.name}</span><span class="rune-icon" aria-hidden="true">${c.icon}</span><small>${c.label}</small><span class="cooldown-label" hidden></span></button>`;}).join('');
    $('cards').querySelectorAll('button').forEach(b=>{let timer,long=false;b.onpointerdown=()=>{long=false;timer=setTimeout(()=>{long=true;showCardInfo(b.dataset.card);},500);};b.onpointerup=()=>clearTimeout(timer);b.onpointercancel=()=>clearTimeout(timer);b.onpointerleave=()=>clearTimeout(timer);b.onclick=()=>{if(!long)pickCard(b.dataset.card);};b.oncontextmenu=e=>e.preventDefault();});
  }
  $('cards').querySelectorAll('button').forEach(b=>{const left=Math.max(0,Math.ceil((f.cooldowns[b.dataset.card]||0)-game.time));b.classList.toggle('cooling',left>0);b.setAttribute('aria-disabled',left>0?'true':'false');const label=b.querySelector('.cooldown-label');label.hidden=left===0;label.textContent=left+'s';});
  let hint='';if(selectedCard){const card=CARDS[selectedCard];hint=card.target==='own'?`${card.name} · 选择己方古树`:card.target==='enemy'?`${card.name} · 选择敌方古树`:card.target==='road'?'幻身 · 选择灵脉落点':'御风 · 全军行速提升8秒';}else if(halfMode)hint=`出灵 ${Math.round(ratio*100)}% · 请选择目标古树`;else if(selectionCount())hint=`已选 ${selectionCount()} 灵 · 点落点出发`;
  $('target-hint').hidden=!hint;$('target-hint').querySelector('span').textContent=hint;
  let cast=$('cast-global');if(selectedCard==='haste'){if(!cast){cast=document.createElement('button');cast.id='cast-global';cast.textContent='施放御风';cast.onclick=()=>applyCard(null);$('target-hint').insertBefore(cast,$('cancel-target'));}}else if(cast)cast.remove();
  for(const id of selectedGroup){
    const node=game.nodes[id];
    if(node.owner!==0){selectedGroup.delete(id);spiritSelection.delete(id);continue;}
    const slots=spiritSelection.get(id);
    if(slots){for(const index of slots)if(index>=count(node))slots.delete(index);while(slots.size>Math.max(0,count(node)-2))slots.delete([...slots].at(-1));if(!slots.size){spiritSelection.delete(id);selectedGroup.delete(id);}}
  }
  for(const [id,slots] of armySelection){const a=game.armies.find(a=>a.id===id&&a.owner===0);if(!a){armySelection.delete(id);continue;}for(const index of slots)if(index>=count(a))slots.delete(index);if(!slots.size)armySelection.delete(id);}
  $('resonance-status').textContent=game.owned(0).some(n=>game.resonant(n.id))?'灵脉共鸣 · 行速↑':'三树相连 · 唤醒共鸣';
  $('group-count').textContent=selectionCount()?`已选 ${selectionCount()} 灵`:'';
  $('gesture-tip').hidden=!!hint;$('gesture-tip').textContent=game.options.autoPlayer?'灵主对弈 · 观战中':'拉圆选灵 · 松手后点落点 · 双指缩放';
  $('speed-button').hidden=game.factions.slice(1).some(x=>x.alive)&&!game.options.autoPlayer;$('speed-button').textContent='×'+speed;
  for(const node of game.nodes){const b=$('node-'+node.id);if(!b)continue;const p=renderer.screen(node);b.style.left=p.x+'px';b.style.top=p.y+'px';b.setAttribute('aria-label',`${node.name}，${node.owner<0?'中立':FACTIONS[node.owner].name}，${count(node)}灵，等级${node.level}，耐久${Math.ceil(node.hp)}`);}
}
function eventUpdates(){
  for(const e of game.events){if(e.id<=processedEvent)continue;processedEvent=e.id;
    if(e.type==='capture'){feed.push({time:game.time,text:`${FACTIONS[e.owner].short} · 取下${game.nodes[e.node].name}`});if(e.owner===0){sound('capture');vibrate();}}
    if(e.type==='eliminated')feed.push({time:game.time,text:`${FACTIONS[e.owner].name}已退出山河之争`});
    if(e.type==='discard'&&e.owner===0)toast('手牌已满，新灵符已弃');
    if(e.type==='upgrade'&&e.owner===0){sound('upgrade');toast(`${game.nodes[e.node].name} · 进阶已成`);}
    if(e.type==='card'&&e.owner>0)feed.push({time:game.time,text:`${FACTIONS[e.owner].short} · 施放${CARDS[e.key].name}`});
    if(e.type==='break')sound('break');
  }
  feed=feed.filter(e=>game.time-e.time<5).slice(-2);$('event-feed').innerHTML=feed.map(e=>`<span>${e.text}</span>`).join('');
}
function localPoint(e){const r=$('map-canvas').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function cancelGesture(){actionPointer=null;renderer.drag=null;clearGroup();pointers.clear();pinch=null;}
const canvas=$('map-canvas');
canvas.addEventListener('pointerdown',e=>{
  if(!running||paused)return;wakeAudio();const p=localPoint(e);pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);
  if(pointers.size===2){actionPointer=null;renderer.drag=null;clearGroup();const ps=[...pointers.values()];pinch={distance:Math.max(1,Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)),zoom:renderer.zoom,center:{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2},pan:{...renderer.pan}};return;}
  actionPointer={id:e.pointerId,start:p,last:p,mode:'pending'};
});
canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;const p=localPoint(e);pointers.set(e.pointerId,p);
  if(pinch&&pointers.size===2){const ps=[...pointers.values()];renderer.zoom=clamp(pinch.zoom*Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)/pinch.distance,1,2.5);renderer.pan={x:clamp(pinch.pan.x+(ps[0].x+ps[1].x)/2-pinch.center.x,-renderer.w,renderer.w),y:clamp(pinch.pan.y+(ps[0].y+ps[1].y)/2-pinch.center.y,-renderer.h,renderer.h)};updateUI();return;}
  const a=actionPointer;if(!a||a.id!==e.pointerId||selectedCard||halfMode||game.options.autoPlayer)return;
  const dist=Math.hypot(p.x-a.start.x,p.y-a.start.y);
  if(a.mode==='pending'&&dist>5){a.mode='circle';clearGroup();}
  if(a.mode==='circle'){
    renderer.selectionCircle={center:a.start,radius:dist};
    spiritSelection=circleSpirits(game.nodes,a.start,dist,n=>renderer.patrol(n));
    armySelection=new Map();
    for(const army of game.armies){if(army.owner!==0)continue;const hits=renderer.formation(army).filter(t=>Math.hypot(t.x-a.start.x,t.y-5-a.start.y)<=dist+4);if(hits.length)armySelection.set(army.id,new Set(hits.map(t=>t.index)));}
    selectedGroup=new Set(spiritSelection.keys());renderer.group=selectedGroup;renderer.spiritSelection=spiritSelection;renderer.armySelection=armySelection;
    updateUI();
  }
  a.last=p;
});
canvas.addEventListener('pointerup',e=>{
  pointers.delete(e.pointerId);if(pinch){if(!pointers.size)pinch=null;actionPointer=null;return;}
  const a=actionPointer;actionPointer=null;if(!a||paused)return;const p=localPoint(e),target=renderer.nodeAt(p);
  if(a.mode==='circle'){renderer.selectionCircle=null;if(selectedGroup.size)selectedNode(game.nodes[[...selectedGroup][0]]);updateUI();return;}
  if(selectedCard==='decoy'){const road=renderer.roadAt(p);if(road)applyCard(road);else toast('请点击墨色灵脉');return;}
  if(!selectedCard&&!halfMode&&selectionCount()){
    const q=target||renderer.world(p);command({x:clamp(q.x,0,game.world.w),y:clamp(q.y,0,game.world.h)},target?.id??null);return;
  }
  if(target)handleNode(target);else if(selectedCard||halfMode)cancelTarget();else updateUI();
});
canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',e=>{if(actionPointer?.id===e.pointerId)cancelGesture();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{if(!running||paused)return;e.preventDefault();clearGroup();renderer.zoom=clamp(renderer.zoom*(e.deltaY<0?1.1:.91),1,2.5);if(renderer.zoom===1)renderer.pan={x:0,y:0};updateUI();},{passive:false});
$('ratio').oninput=e=>{clearGroup();selectedCard=null;renderer.card=null;ratio=Number(e.target.value)/100;halfMode=true;updateUI();};
$('upgrade-button').onclick=()=>{if(game.options.autoPlayer)return;const result=game.upgrade(0,selection);if(result.ok){toast('开始蕴养 · 暂停孕灵');sound('upgrade');}else toast(result.reason);updateUI();};
$('half-button').onclick=()=>{cancelTarget();halfMode=true;ratio=.5;$('ratio').value=50;updateUI();};
$('cancel-target').onclick=cancelTarget;$('fit-button').onclick=()=>{clearGroup();renderer.fit();updateUI();};$('speed-button').onclick=()=>{speed=speed===1?2:1;updateUI();};
$('help-button').onclick=()=>showHelp(!running);$('settings-button').onclick=showSettings;$('exit-button').onclick=showExit;
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open)cancelTarget();if(e.key===' '&&!dialog.open&&running&&e.target===document.body){e.preventDefault();showSettings();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!dialog.open&&game.status==='playing')showSettings();lastFrame=performance.now();accumulator=0;});
new ResizeObserver(()=>{cancelGesture();renderer.resize();updateUI();}).observe($('battlefield'));
let lastFrame=performance.now(),accumulator=0;
function frame(now){const dt=Math.min((now-lastFrame)/1000,.25);lastFrame=now;
  if(running&&!paused&&game.status==='playing'){accumulator+=dt*speed;let loops=0;while(accumulator>=.05&&loops++<12){game.step(.05);accumulator-=.05;}eventUpdates();if(game.status!=='playing')showResult();
    if(preferences.music&&game.time>nextMusic){nextMusic=game.time+3;const notes=[196,220,261.63,293.66,329.63];tone(notes[Math.floor(game.time/3)%5],1.5,.012);}
  }else accumulator=0;
  renderer.selected=selection;renderer.reduced=preferences.reduced;renderer.draw(now);if(now-lastUI>180){updateUI();lastUI=now;}requestAnimationFrame(frame);
}
rebuildNodeControls();updateUI();requestAnimationFrame(frame);showSetup();
// Test hooks are deliberately absent unless requested in this local browser session.
if(new URLSearchParams(location.search).has('test'))window.__MOJING__={get game(){return game;},get renderer(){return renderer;},start:(o={})=>{options={...options,...o};startGame(!!o.autoPlayer,true);},advance:seconds=>{for(let i=0;i<seconds/.05&&game.status==='playing';i++)game.step(.05);eventUpdates();updateUI();},get paused(){return paused;},get selection(){return selection;},get card(){return selectedCard;}};
