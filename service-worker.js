const VERSION="v252-extraction-20261001";
const CACHE=`aej-${VERSION}`;
const SHELL=[
  "./","./index.html","./style.css","./app.js","./manifest.json","./icons/icon-192.png","./icons/icon-512.png",
  "./vendor/pdfjs/pdf.mjs","./vendor/pdfjs/pdf.worker.mjs",
  "./vendor/tesseract-core/tesseract-core.wasm.js","./vendor/tessdata/fra.traineddata"
];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("aej-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin){e.respondWith(new Response("Accès réseau externe bloqué par AEJ V2.5.2",{status:403}));return;}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;}).catch(()=>e.request.mode==="navigate"?caches.match("./index.html"):Response.error())));
});
