import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.json':'application/json' };
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const p=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const info=await stat(p);const file=info.isDirectory()?path.join(p,'index.html'):p;res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}});
const port=Number(process.env.PORT)||4187;
server.listen(port,'0.0.0.0',()=>console.log(`墨境争城：http://localhost:${port}`));
