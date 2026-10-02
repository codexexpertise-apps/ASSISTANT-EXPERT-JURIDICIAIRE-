const VERSION="v254-stable-20261002";
const CACHE=`aej-${VERSION}`;
const SHELL=[
  "./","./index.html","./style.css","./app.js","./manifest.json","./icons/icon-192.png","./icons/icon-512.png",
  "./vendor/pdfjs/pdf.mjs","./vendor/pdfjs/pdf.worker.mjs",
  "./vendor/tesseract-core/tesseract-core.wasm.js","./vendor/tessdata/fra.traineddata"
];
const CHANGING=new Set(["/index.html","/app.js","/style.css","/manifest.json"]);
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("aej-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function networkFirst(req){
  try{const resp=await fetch(req,{cache:"no-store"});if(resp.ok){const c=await caches.open(CACHE);await c.put(req,resp.clone());}return resp;}
  catch(e){return (await caches.match(req,{ignoreSearch:true}))||(req.mode==="navigate"?await caches.match("./index.html"):Response.error());}
}
async function cacheFirst(req){const hit=await caches.match(req,{ignoreSearch:true});if(hit)return hit;try{const resp=await fetch(req);if(resp.ok){const c=await caches.open(CACHE);await c.put(req,resp.clone());}return resp;}catch(e){return Response.error();}}
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;const u=new URL(e.request.url);
  if(u.origin!==location.origin){e.respondWith(new Response("Accès réseau externe bloqué par AEJ V2.5.4",{status:403}));return;}
  const changing=e.request.mode==="navigate"||CHANGING.has(u.pathname.slice(u.pathname.lastIndexOf('/')));
  e.respondWith(changing?networkFirst(e.request):cacheFirst(e.request));
});
