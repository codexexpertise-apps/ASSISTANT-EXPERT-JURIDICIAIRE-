const fs=require('fs');
const corpus=JSON.parse(fs.readFileSync(__dirname+'/corpus-missions.json','utf8'));
const clean=s=>String(s||'').replace(/[ \t]+/g,' ').replace(/\n\s+/g,'\n').trim();
function parse(text){
 const anchors=[/disons que l.expert(?:e)? aura pour mission de\s*:?/i,/l.expert(?:e)? aura pour mission de\s*:?/i];let m;for(const r of anchors){m=r.exec(text);if(m)break;}if(!m)return {n:0,complete:false};let z=text.slice(m.index+m[0].length);const st=z.search(/\n\s*(?:DISONS|ORDONNONS|RAPPELONS|CONDAMNONS|DESIGNONS|DÉSIGNONS|INDIQUONS|FIXONS)\b/i);if(st>0)z=z.slice(0,st);
 const marker=/^(?:\s*(?:[•·▪◦*+\-–—]|\d{1,2}\s*(?:[°º]\s*\)|[°º]|[.)-])|[A-Z]\s*[.)-])\s+)/;const lines=z.split(/\n+/).map(x=>x.trim()).filter(Boolean),chunks=[];let cur='',marked=0;for(const line of lines){if(marker.test(line)){marked++;if(cur)chunks.push(cur);cur=line.replace(marker,'').trim();}else cur+=(cur?' ':'')+line;}if(cur)chunks.push(cur);const items=chunks.map(clean).filter(x=>x.length>=3);return {n:items.length,complete:items.length>0&&items.length===marked};
}
let fail=0;for(const c of corpus){const r=parse(c.text),ok=r.n===c.expected&&(!c.mustFlagIncomplete||!r.complete);console.log(ok?'PASS':'FAIL',c.id,'expected',c.expected,'got',r.n,'complete',r.complete);if(!ok)fail++;}process.exitCode=fail?1:0;
