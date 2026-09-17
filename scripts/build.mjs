import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
const css=await readFile('style.css','utf8');
const font=await readFile('assets/brush.ttf');
let embeddedCSS=css.replace("url('./assets/brush.ttf')",`url('data:font/ttf;base64,${font.toString('base64')}')`);
const files=['src/engine.js','src/gestures.js','src/render.js','src/app.js'];
let code='';for(const p of files){let s=await readFile(p,'utf8');s=s.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');code+=s+'\n';}
let html=await readFile('index.html','utf8');html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+embeddedCSS+'</style>').replace('<script type="module" src="src/app.js"></script>',()=>'<script>(()=>{\n'+code+'\n})();</script>');
for(const name of ['spirit-forest.png','spirit-atlas.png']){const data=await readFile('assets/'+name);const uri='data:image/png;base64,'+data.toString('base64');html=html.replaceAll('./assets/'+name,uri);}
await writeFile('dist/山海灵境.html',html);
await writeFile('dist/墨境争城.html',html);
await copyFile('assets/FONT-LICENSE.txt','dist/FONT-LICENSE.txt');
console.log(`离线游戏已生成：dist/山海灵境.html (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB)`);
