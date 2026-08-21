'use strict';
const DB='ielts-reading-package-v1',STORE='files';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
function read(path){return new Promise(ok=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const d=r.result,q=d.transaction(STORE).objectStore(STORE).get(path);q.onsuccess=()=>{d.close();ok(q.result)};q.onerror=()=>{d.close();ok(null)}};r.onerror=()=>ok(null)})}
self.addEventListener('fetch',e=>{const u=new URL(e.request.url),mark='/reading-local/';if(!u.pathname.includes(mark))return;e.respondWith((async()=>{let path=decodeURIComponent(u.pathname.split(mark)[1]||'index.html');if(!path||path.endsWith('/'))path+='index.html';const row=await read(path);if(row)return new Response(row.blob,{headers:{'Content-Type':row.blob.type||'application/octet-stream','Cache-Control':'no-store'}});return new Response('阅读题库文件不存在：'+path,{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}})})())});
