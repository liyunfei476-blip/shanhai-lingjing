import {Game} from '../src/engine.js';
import {mkdir,writeFile} from 'node:fs/promises';
const total=Number(process.argv[2])||216,results=[],started=performance.now();
for(let i=0;i<total;i++){
  const options={seed:1000+i,size:['small','medium','large'][i%3],opponents:1+Math.floor(i/3)%3,difficulty:['easy','standard','hard'][Math.floor(i/9)%3],autoPlayer:true,freeCommand:true};
  const g=new Game(options);let steps=0;
  while(g.time<1800&&g.status==='playing'){g.step(.1);if(steps++%20===0)g.assertValid();}
  g.assertValid();results.push({options,seconds:Math.round(g.time),status:g.status,winner:g.winner,stats:g.stats,upgrades:g.factions.map(f=>f.upgrades),factions:g.factions.map(f=>({id:f.id,cities:g.owned(f.id).length,trait:f.trait}))});
  if((i+1)%36===0)console.log(`已完成 ${i+1}/${total} 局`);
}
const summary={total,finished:results.filter(r=>r.status!=='playing').length,unfinished:results.filter(r=>r.status==='playing').map(r=>r.options),runtimeSeconds:Math.round((performance.now()-started)/1000),byMap:{},cards:{},aiVsAi:results.reduce((s,r)=>s+r.stats.aiVsAi,0),ghostResponses:results.reduce((s,r)=>s+r.stats.ghostResponses,0)};
for(const size of ['small','medium','large']){const sorted=results.filter(r=>r.options.size===size).map(r=>r.seconds).sort((a,b)=>a-b);summary.byMap[size]={count:sorted.length,min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p90:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.9))],max:sorted.at(-1)};}
for(const r of results)for(const[key,value]of Object.entries(r.stats.cards))summary.cards[key]=(summary.cards[key]||0)+value;
await mkdir('qa',{recursive:true});await writeFile('qa/simulation-results.json',JSON.stringify({summary,results},null,2));console.log(JSON.stringify(summary,null,2));
if(summary.unfinished.length)process.exitCode=2;
