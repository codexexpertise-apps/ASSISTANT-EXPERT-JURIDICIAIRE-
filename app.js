console.info("AEJ — Version moteur V2.5.4 — app.js 2026-10-02");
const DEFAULT_MISSIONS = [
  "Prendre connaissance des documents contractuels et de toutes les pièces utiles.",
  "Convoquer les parties et recueillir contradictoirement leurs observations.",
  "Se rendre sur les lieux et examiner les éléments concernés par la mission.",
  "Décrire les désordres, malfaçons, non-façons ou non-conformités allégués.",
  "Examiner les points techniques expressément visés par l’ordonnance.",
  "Préconiser et, lorsque cela relève de la mission, chiffrer les travaux de reprise ou de sauvegarde.",
  "Évaluer les éléments techniques utiles aux préjudices, préparer la synthèse et répondre aux dires."
];
const DEFAULT_TASKS = [
  ["Vérifier l’avis de consignation et la date de saisine","À vérifier","Source à confirmer dans l’ordonnance"],
  ["Établir le calendrier prévisionnel avec les parties","Suggestion","Organisation des opérations"],
  ["Informer du montant prévisible de la rémunération","À vérifier","Source juridique / ordonnance à confirmer"],
  ["Organiser la première réunion contradictoire","Suggestion","Mission"],
  ["Préparer les constats, pièces et éventuels chiffrages","Suggestion","Opérations d’expertise"],
  ["Préparer la synthèse / prérapport et le délai des dires","À vérifier","Ordonnance / texte applicable à confirmer"],
  ["Préparer le dépôt du rapport au greffe","À vérifier","Délai à confirmer dans l’ordonnance"]
];
const INDEX_KEY = "aej_v242_index";
const DOSSIER_PREFIX = "aej_v242_dossier_";
const LEGACY_KEY = "aej_v23_state";
const DB_NAME = "aej_v2_files";
const DB_VERSION = 1;
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
let selectedFile = null;
let saveTimer = null;
let objectUrls = [];
let previewObjectUrls = [];
let currentId = null;
let state = null;

function loadIndex(){
  try{return JSON.parse(localStorage.getItem(INDEX_KEY))||{version:2.5,currentId:null,dossiers:[]};}
  catch{return {version:2.5,currentId:null,dossiers:[]};}
}
function saveIndex(index){localStorage.setItem(INDEX_KEY,JSON.stringify(index));}
function dossierKey(id){return DOSSIER_PREFIX+id;}
function indexUpsert(s){
  const idx=loadIndex(), d=s.dossier||{};
  const meta={id:d.id,title:d.title||d.ordonnanceName||"Dossier sans titre",ordonnanceName:d.ordonnanceName||"",createdAt:d.createdAt,updatedAt:d.updatedAt};
  const i=idx.dossiers.findIndex(x=>x.id===d.id); if(i>=0)idx.dossiers[i]=meta;else idx.dossiers.unshift(meta);
  idx.currentId=d.id; idx.dossiers.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))); saveIndex(idx); currentId=d.id;
}
function loadDossier(id){
  try{const v=JSON.parse(localStorage.getItem(dossierKey(id)));if(v){v.version="2.5.4";normalizeMissionInterventions(v);normalizePhotoPlacements(v);normalizeDossierMeta(v);if(!Array.isArray(v.contradictoire))v.contradictoire=[];if(typeof v.dossier.missionsValidated!=='boolean')v.dossier.missionsValidated=false;return v;}}catch{}
  return null;
}
function migrateLegacy(){
  const idx=loadIndex(); if(idx.dossiers.length)return idx;
  for(const key of [LEGACY_KEY,"aej_v22_state","aej_v211_state","aej_v21_state","aej_v2_state"]){
    try{const old=JSON.parse(localStorage.getItem(key));if(old&&old.dossier){old.version=2.5;old.dossier.id=old.dossier.id||uid();normalizeMissionInterventions(old);normalizePhotoPlacements(old);localStorage.setItem(dossierKey(old.dossier.id),JSON.stringify(old));indexUpsert(old);return loadIndex();}}catch{}
  }
  return idx;
}
function blankState(){
  return {
    version:"2.5.4",
    dossier:{id:uid(),title:"", ordonnanceName:"", ordonnanceFileId:"", reportMeta:blankReportMeta(), extractedFacts:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()},
    resume:"",
    vigilances:"• Vérifier les dates, délais et point de départ des échéances.\n• Vérifier exactement les missions de l’expert figurant au dispositif.\n• Identifier les parties, pièces annoncées et opérations à organiser.\n• Signaler ici toute incohérence ou information nécessitant une vérification.",
    missions:DEFAULT_MISSIONS.map((text,i)=>({id:uid(),order:i+1,text,response:"",status:"À rédiger",intervention:blankIntervention()})),
    tasks:DEFAULT_TASKS.map((x,i)=>({id:uid(),title:x[0],type:x[1],source:x[2],due:"",confirmed:false,done:false})),
    operations:[],
    contradictoire:[],
    photoMeta:[],
    annexMeta:[]
  };
}
function blankReportMeta(){return {juridiction:"",rg:"",affaire:"",demandeurs:"",defendeurs:"",expert:"",destinataires:"",reportType:"RAPPORT DÉFINITIF",reportDate:""};}
function normalizeDossierMeta(s){if(!s?.dossier)return;s.dossier.reportMeta={...blankReportMeta(),...(s.dossier.reportMeta||{})};if(!Array.isArray(s.dossier.extractedFacts))s.dossier.extractedFacts=[];}
function blankIntervention(){return {role:"Expert",identity:"",specialty:"",object:"",status:"Non requis",email:"",documents:[]};}
function normalizeMissionInterventions(s){
  if(!s||!Array.isArray(s.missions))return;
  s.missions.forEach(m=>{if(!m.intervention)m.intervention=blankIntervention();if(!Array.isArray(m.intervention.documents))m.intervention.documents=[];});
}
function normalizePhotoPlacements(s){
  if(!s||!Array.isArray(s.photoMeta))return;
  s.photoMeta.forEach(p=>{if(typeof p.placement!=="string")p.placement="unplaced";});
}
function persist(reason="Modification"){
  if(!state?.dossier?.id)return false;
  try{
    state.version="2.5.1"; state.dossier.updatedAt=new Date().toISOString();
    localStorage.setItem(dossierKey(state.dossier.id),JSON.stringify(state)); indexUpsert(state);
    setSaveState("Sauvegardé"); renderDossierList();
    clearTimeout(saveTimer); saveTimer=setTimeout(()=>setSaveState("Sauvegarde locale active"),1200); return true;
  }catch(e){
    console.error("Échec sauvegarde locale",e); setSaveState("⚠ NON SAUVEGARDÉ");
    alert("La sauvegarde locale a échoué. N'ajoute plus de données avant d'avoir exporté une sauvegarde. Cause : "+(e?.message||e)); return false;
  }
}
function touch(reason="Modification"){
  setSaveState("Enregistrement…");
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>persist(reason),350);
}
function setSaveState(text){if($("saveState")) $("saveState").textContent=text;}
function escapeHtml(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function fmtDateTime(iso){if(!iso)return"";return new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function status(text){$("status").textContent=text;$("status").classList.remove("hidden");}


// --- V2.5 : moteur PDF/OCR 100 % local ---
// PDF.js 6.3.289 et Tesseract Core 7.0.0 sont physiquement embarqués dans /vendor.
// Aucun CDN ni service distant n'est utilisé par cette chaîne.
const PDFJS_MODULE_URL = "./vendor/pdfjs/pdf.mjs";
const PDFJS_WORKER_URL = "./vendor/pdfjs/pdf.worker.mjs";
const TESSERACT_CORE_URL = "./vendor/tesseract-core/tesseract-core.wasm.js";
const TESSERACT_LANG_URL = "./vendor/tessdata/fra.traineddata";
let pdfjsModulePromise=null, tessCorePromise=null, tessLangPromise=null;
function loadScriptOnce(url,test){
  if(test())return Promise.resolve();
  return new Promise((resolve,reject)=>{const old=[...document.scripts].find(x=>x.src.endsWith(url.replace(/^\.\//,'')));if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',()=>reject(new Error('Composant OCR local indisponible.')),{once:true});return;}const sc=document.createElement('script');sc.src=url;sc.async=true;sc.onload=resolve;sc.onerror=()=>reject(new Error(`Installation incomplète : ${url} est introuvable.`));document.head.appendChild(sc);});
}
async function ensurePdfJs(){
  if(!pdfjsModulePromise)pdfjsModulePromise=import(PDFJS_MODULE_URL);
  const lib=await pdfjsModulePromise;if(!lib?.getDocument)throw new Error('Installation incomplète : PDF.js local indisponible.');
  lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;return lib;
}
async function ensureTesseractCore(){
  if(!tessCorePromise)tessCorePromise=(async()=>{await loadScriptOnce(TESSERACT_CORE_URL,()=>typeof window.TesseractCore==='function');if(typeof window.TesseractCore!=='function')throw new Error('Installation incomplète : moteur OCR local indisponible.');return window.TesseractCore();})();
  return tessCorePromise;
}
async function ensureFrenchModel(){
  if(!tessLangPromise)tessLangPromise=fetch(TESSERACT_LANG_URL,{cache:'force-cache'}).then(r=>{if(!r.ok)throw new Error('Installation incomplète : modèle OCR français absent.');return r.arrayBuffer();});
  return tessLangPromise;
}
function cleanPdfText(text){
  return String(text||"").replace(/\u0000/g,"").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g," ")
    .replace(/[ \t]+/g," ").replace(/\s+([,.;:!?])/g,"$1").replace(/\n\s+/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}
function normalizeForMatch(text){return cleanPdfText(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function pageTextFromItems(items){
  const rows=[];
  for(const it of items){
    const y=Math.round((it.transform?.[5]||0)*2)/2, x=it.transform?.[4]||0;
    let row=rows.find(r=>Math.abs(r.y-y)<2.5); if(!row){row={y,cells:[]};rows.push(row);} row.cells.push({x,s:it.str||""});
  }
  rows.sort((a,b)=>b.y-a.y);
  return cleanPdfText(rows.map(r=>r.cells.sort((a,b)=>a.x-b.x).map(c=>c.s).join(' ')).join('\n'));
}
async function openPdfWithPdfJs(file){
  const lib=await ensurePdfJs();
  const data=new Uint8Array(await file.arrayBuffer());
  return lib.getDocument({data,isEvalSupported:false}).promise;
}
async function extractTextLayer(pdf,onProgress){
  const pages=[]; let totalChars=0, pagesWithText=0;
  for(let n=1;n<=pdf.numPages;n++){
    onProgress?.(`Lecture PDF.js · page ${n}/${pdf.numPages}`,(n-1)/pdf.numPages);
    const page=await pdf.getPage(n), tc=await page.getTextContent({normalizeWhitespace:true});
    const text=pageTextFromItems(tc.items||[]); const chars=text.replace(/\s/g,'').length;
    if(chars>=40)pagesWithText++; totalChars+=chars; pages.push({page:n,text,source:'texte',confidence:chars>=80?'élevée':chars>=40?'moyenne':'faible'});
  }
  return {pages,totalChars,pagesWithText};
}
async function ocrPdfPages(pdf,pageNumbers,onProgress){
  const TessModule=await ensureTesseractCore();
  const model=new Uint8Array(await ensureFrenchModel());
  try{TessModule.FS.unlink('/fra.traineddata');}catch{}
  TessModule.FS.writeFile('/fra.traineddata',model);
  const api=new TessModule.TessBaseAPI();
  const out=new Map();
  try{
    const init=api.Init(null,'fra'); if(init!==0)throw new Error('Le modèle OCR français n’a pas pu être initialisé.');
    api.SetPageSegMode?.(3);
    for(let i=0;i<pageNumbers.length;i++){
      const n=pageNumbers[i];onProgress?.(`OCR local · page ${n}/${pdf.numPages} (${i+1}/${pageNumbers.length})`,i/Math.max(1,pageNumbers.length));
      const page=await pdf.getPage(n), viewport=page.getViewport({scale:2.15});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);await page.render({canvasContext:ctx,viewport}).promise;
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Conversion de page OCR impossible.')),'image/png'));
      const bytes=new Uint8Array(await blob.arrayBuffer());try{TessModule.FS.unlink('/input');}catch{}TessModule.FS.writeFile('/input',bytes);
      api.SetImageFile();api.Recognize(null);const text=cleanPdfText(api.GetUTF8Text()||'');
      const conf=Number(api.MeanTextConf?.()||0);out.set(n,{page:n,text,source:'ocr',confidence:conf>=75?'élevée':conf>=55?'moyenne':'faible',ocrConfidence:conf});
      canvas.width=1;canvas.height=1;
    }
  }finally{try{api.End();}catch{}try{TessModule.destroy(api);}catch{}}
  return out;
}
async function extractPdfDocument(file,onProgress){
  const pdf=await openPdfWithPdfJs(file), layer=await extractTextLayer(pdf,onProgress);
  const weak=layer.pages.filter(p=>p.text.replace(/\s/g,'').length<80).map(p=>p.page); let pages=layer.pages, mode='pdfjs-text';
  if(weak.length){onProgress?.(`OCR local ciblé · ${weak.length} page${weak.length>1?'s':''} sans texte fiable`,0);const ocr=await ocrPdfPages(pdf,weak,onProgress);pages=layer.pages.map(p=>ocr.get(p.page)||p);mode=weak.length===pdf.numPages?'pdfjs-ocr':'pdfjs-hybride';}
  const text=pages.map(p=>`\n[[PAGE ${p.page}]]\n${p.text}`).join('\n');
  return {text:cleanPdfText(text),pages,pageCount:pdf.numPages,mode,scanLikely:weak.length===pdf.numPages,chars:pages.reduce((a,p)=>a+p.text.replace(/\s/g,'').length,0),ocrPages:weak};
}
function splitSentences(text){
  return cleanPdfText(text).split(/\n+|(?<=[.;!?])\s+(?=[A-ZÀ-ÖØ-Ý•\-])/).map(x=>x.trim()).filter(Boolean);
}
function findPageForSnippet(pages,snippet){
  const needle=normalizeForMatch(snippet).replace(/\s+/g,' ').slice(0,55); if(!needle)return null;
  const words=needle.split(' ').filter(w=>w.length>3).slice(0,7);
  let best=null,score=0;
  for(const p of pages){const hay=normalizeForMatch(p.text);const s=words.reduce((n,w)=>n+(hay.includes(w)?1:0),0);if(s>score){score=s;best=p.page;}}
  return score>=Math.min(3,words.length)?best:null;
}
function extractMissionZone(pages){
  const joined=pages.map(p=>`\n[[PAGE ${p.page}]]\n${p.text}`).join('\n');
  const n=normalizeForMatch(joined);
  const anchors=[/disons que l.expert(?:e)? aura pour mission de\s*:?/,/l.expert(?:e)? aura pour mission de\s*:?/,/mission(?:s)? (?:confiee|confiees) a l.expert[\s\S]{0,300}?:/];
  let start=-1; for(const re of anchors){const m=re.exec(n);if(m){start=m.index+m[0].length;break;}}
  if(start<0)return {zone:'',startFound:false,pages:[]};
  const ratio=start/Math.max(1,n.length), approx=Math.floor(joined.length*ratio); let zone=joined.slice(Math.max(0,approx-350),approx+24000);
  const visible=zone.search(/(?:expert(?:e)?\s+aura\s+pour\s+mission\s+de|missions?\s+confi[ée]es?\s+[àa]\s+l['’]expert)/i); if(visible>=0)zone=zone.slice(visible).replace(/^[\s\S]*?(?:mission\s+de|expert)\s*:?/i,'');
  const stop=zone.search(/\n\s*(?:DISONS|ORDONNONS|RAPPELONS|CONDAMNONS|DESIGNONS|DÉSIGNONS|INDIQUONS|FIXONS)\b/i); if(stop>80)zone=zone.slice(0,stop);
  const pageNos=[...zone.matchAll(/\[\[PAGE\s+(\d+)\]\]/gi)].map(m=>Number(m[1]));
  return {zone:cleanPdfText(zone),startFound:true,pages:pageNos};
}
function extractMissionItemsFromPages(pages){
  const mz=extractMissionZone(pages); if(!mz.startFound)return {items:[],complete:false,reason:"Ancre du dispositif non reconnue",zone:"",candidateCount:0,residual:""};
  let zone=mz.zone.replace(/N[°º]\s*RG[^\n]{0,120}Page\s+\d+\s+sur\s+\d+/gi,'\n');
  const marker=/^(?:\s*(?:[•·▪◦*+\-–—°«»]|\d{1,2}\s*(?:[°º]\s*\)|[°º]|[.)-])|[A-Z]\s*[.)-])\s+)/;
  const lines=zone.split(/\n+/).map(x=>x.trim()).filter(Boolean); const chunks=[]; let cur=''; let marked=0;
  for(let line of lines){ if(/^\[\[PAGE\s+\d+\]\]$/i.test(line))continue; const structural=marker.test(line); const probableMissingMarker=!structural&&cur&&/[,;]\s*$/.test(cur)&&/^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ’' -]{2,30}\b/.test(line); if(structural||probableMissingMarker){marked++; if(cur)chunks.push(cur); cur=structural?line.replace(marker,'').trim():line.trim();} else {cur+=(cur?' ':'')+line;} } if(cur)chunks.push(cur);
  if(marked===0){
    const inline=zone.split(/(?=\s(?:[•·▪◦]|\d{1,2}\s*(?:[°º]\s*\)|[°º]|[.)-]))\s+)/).map(x=>x.replace(marker,'').trim()).filter(x=>x.length>15); if(inline.length>1){marked=inline.length;chunks.splice(0,chunks.length,...inline);}
  }
  const items=[]; for(let x of chunks){x=cleanPdfText(x).replace(/\[\[PAGE\s+\d+\]\]/gi,' ').replace(/\s+/g,' ').trim(); if(x.length<12)continue; if(!/[.!?]$/.test(x))x+='.'; items.push({text:x,page:findPageForSnippet(pages,x)});}
  const candidateCount=marked||items.length; const residual=candidateCount>0&&items.length!==candidateCount?`Éléments structurés repérés : ${candidateCount}; missions exploitables : ${items.length}.`:'';
  return {items:items.slice(0,40),complete:items.length>0 && (!candidateCount||items.length===candidateCount),reason:items.length?residual:"Aucune mission structurée reconnue",zone:mz.zone,candidateCount,residual};
}
function nearbyExtract(text,regex,span=260){const m=regex.exec(text);if(!m)return'';return cleanPdfText(text.slice(Math.max(0,m.index-60),Math.min(text.length,m.index+m[0].length+span))).replace(/\n/g,' ');}
function nearbyExtractLast(text,regex,span=260){let found=null,m;regex.lastIndex=0;while((m=regex.exec(text))!==null){found=m;if(!regex.global)break;if(m.index===regex.lastIndex)regex.lastIndex++;}if(!found)return'';return cleanPdfText(text.slice(Math.max(0,found.index-60),Math.min(text.length,found.index+found[0].length+span))).replace(/\n/g,' ');}
function dispositiveText(pages){
  const all=pages.map(p=>p.text).join('\n'); const idx=normalizeForMatch(all).indexOf('par ces motifs');
  if(idx<0)return all; const ratio=idx/Math.max(1,normalizeForMatch(all).length); return all.slice(Math.max(0,Math.floor(all.length*ratio)-80));
}
function extractVigilances(pages){
  const text=dispositiveText(pages), items=[];
  const addSource=(title,source,comment)=>{if(source)items.push({title,source,comment,page:findPageForSnippet(pages,source)});};
  addSource('Consignation', nearbyExtract(text,/(?:devra\s+consigner|consigner)\s+la\s+somme[\s\S]{0,240}?(?:deux\s+mois|\d+\s+mois)[\s\S]{0,180}?(?:notification|décision|decision)/i,120),'Vérifier le montant, le débiteur de la consignation et le point de départ du délai.');
  addSource('Prérapport / dires', nearbyExtract(text,/(?:préalablement|prealablement)[\s\S]{0,140}?dépôt[^\n]{0,80}?rapport[\s\S]{0,380}?pré[- ]?rapport[\s\S]{0,380}?(?:quatre|4)\s+semaines[\s\S]{0,220}?dires/i,100) || nearbyExtractLast(text,/pré[- ]?rapport[\s\S]{0,320}?(?:quatre|4)\s+semaines[\s\S]{0,180}?dires/gi,100),'Vérifier la forme du prérapport et le délai contradictoire laissé aux parties.');
  addSource('Dépôt du rapport', nearbyExtract(text,/(?:déposer|deposer)\s+son\s+rapport[\s\S]{0,360}?(?:quatre|4)\s+mois[\s\S]{0,260}?(?:avis\s+de\s+consignation|consignation\s+de\s+la\s+provision)/i,100),'Vérifier le délai exact et son événement déclencheur.');
  addSource('Sapiteur / technicien', nearbyExtractLast(text,/(?:article\s+278|technicien\s+d['’]une\s+spécialité\s+distincte|sapiteur)[\s\S]{0,420}?(?:consignation\s+complémentaire|remuneration\s+possible|rémunération\s+possible)?/gi,80),'Vérifier les conditions de recours et, le cas échéant, la consignation complémentaire.');
  addSource('Pièces à joindre au rapport', nearbyExtract(text,/(?:joindra\s+au\s+rapport|joindre\s+au\s+rapport)[\s\S]{0,850}/i,40),'Préparer la traçabilité des pièces, convocations, présences et réunions demandées par l’ordonnance.');
  return items;
}
function extractIdentityFacts(pages){
  const text=pages.map(p=>p.text).join('\n'), facts=[];
  const add=(label,value,page,kind='information')=>{if(value)facts.push({label,value:cleanPdfText(value).replace(/\n/g,' '),page:page||findPageForSnippet(pages,value),kind});};
  const court=(text.match(/TRIBUNAL\s+JUDICIAIRE\s+DE\s+[A-ZÀ-ÖØ-Ý -]+/i)||[])[0];
  const date=(text.match(/ORDONNANCE[\s\S]{0,160}?(?:DU\s+)?(\d{1,2}\s+(?:JANVIER|F[ÉE]VRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AO[ÛU]T|SEPTEMBRE|OCTOBRE|NOVEMBRE|D[ÉE]CEMBRE)\s+20\d{2})/i)||[])[1];
  add('Juridiction',court,1);add('Date de l’ordonnance',date,findPageForSnippet(pages,date||''));
  return facts;
}
function buildAnalysis(extracted){
  const errors=[];let mx={items:[],complete:false,reason:"Extraction des missions non exécutée",zone:"",candidateCount:0};let vig=[];let identity=[];
  try{identity=extractIdentityFacts(extracted.pages)||[];}catch(e){console.error("Identification ordonnance",e);errors.push(`Identification : ${e.message||"erreur indéterminée"}`);}
  try{vig=extractVigilances(extracted.pages)||[];}catch(e){console.error("Échéances / contrôles",e);errors.push(`Échéances / contrôles : ${e.message||"erreur indéterminée"}`);}
  try{mx=extractMissionItemsFromPages(extracted.pages)||mx;}catch(e){console.error("Extraction missions",e);mx={...mx,reason:e.message||"erreur indéterminée"};errors.push(`Missions : ${e.message||"erreur indéterminée"}`);}
  const facts=[...identity,...vig.map(v=>({label:v.title,value:v.source,page:v.page,kind:'ordonnance',control:v.comment}))];
  const warning=mx.complete?'':'Extraction des missions potentiellement incomplète : comparer impérativement la liste au dispositif reproduit dans l’onglet Mission.';
  const controls=[...vig.map(v=>v.comment),...errors.map(x=>`Extraction partielle — ${x}`),warning,'Tout préremplissage doit être contrôlé sur le PDF original avant validation.'].filter(Boolean);
  return {facts,controls,missions:(mx.items||[]).map(m=>m.text),missionSources:(mx.items||[]).map(m=>({text:m.text,page:m.page})),missionCheck:{complete:!!mx.complete,candidateCount:mx.candidateCount||0,extractedCount:(mx.items||[]).length,reason:mx.reason||'',errors},dispositifVerbatim:mx.zone||'',pages:extracted.pageCount,chars:extracted.chars,mode:extracted.mode,analysisErrors:errors};
}
async function prepareOrdonnanceFromPdf(file,onProgress){
  const extracted=await extractPdfDocument(file,onProgress);
  if(!extracted.text||extracted.chars<100)throw new Error("Aucun texte exploitable n’a pu être obtenu, même après tentative OCR.");
  // V2.5.4 : conserver la sortie RÉELLE PDF.js/OCR avant le moindre extracteur.
  const diagnostic=extracted.pages.map(p=>({page:p.page,source:p.source,confidence:p.confidence,ocrConfidence:p.ocrConfidence??null,text:p.text||''}));
  state.dossier.ocrDiagnostic=diagnostic;
  state.dossier.analysis={mode:extracted.mode,pages:extracted.pageCount,chars:extracted.chars,readAt:new Date().toISOString(),stage:'lecture-terminée'};
  try{persist("Lecture PDF/OCR terminée — diagnostic conservé");}catch(e){console.warn("Persistance diagnostic",e);}
  try{
    await dbPut({id:'ordonnance-text-'+state.dossier.id,kind:'texte-ordonnance',name:file.name+'.txt',type:'text/plain',blob:new Blob([extracted.text],{type:'text/plain'}),updatedAt:new Date().toISOString()});
    await dbPut({id:'ordonnance-diagnostic-'+state.dossier.id,kind:'diagnostic-ordonnance',name:file.name+'.diagnostic.json',type:'application/json',blob:new Blob([JSON.stringify({version:'2.5.4',file:file.name,mode:extracted.mode,pages:diagnostic},null,2)],{type:'application/json'}),updatedAt:new Date().toISOString()});
  }catch(e){console.warn("Sauvegarde diagnostic OCR",e);state.dossier.diagnosticStorageWarning=e.message||String(e);}
  // Seulement maintenant : extraction métier, isolée composant par composant dans buildAnalysis().
  const a=buildAnalysis(extracted);a.ocrDiagnostic=diagnostic;return a;
}

// IndexedDB : fichiers binaires locaux
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains("files"))db.createObjectStore("files",{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function dbPut(record){if(state?.dossier?.id&&!record.dossierId)record.dossierId=state.dossier.id;const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").put(record);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function dbGet(id){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction("files").objectStore("files").get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function dbDelete(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function dbAll(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction("files").objectStore("files").getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
async function dbDeleteDossier(id){const rows=await dbAll();for(const r of rows)if(r.dossierId===id)await dbDelete(r.id);}


const BACKUP_FORMAT = "AEJ-BACKUP";
const BACKUP_VERSION = 1;
const LAST_BACKUP_KEY = "aej_last_backup_at";
function arrayBufferToBase64(buffer){
  const bytes=new Uint8Array(buffer); let binary=""; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
}
function base64ToBlob(base64,type="application/octet-stream"){
  const binary=atob(base64), bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type});
}
async function serializeDbRecord(r){
  const out={...r};
  if(r.blob){out.blobBase64=arrayBufferToBase64(await r.blob.arrayBuffer());out.blobType=r.blob.type||r.type||"application/octet-stream";delete out.blob;}
  return out;
}
async function deriveBackupKey(password,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encryptBackupPayload(payload,password){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await deriveBackupKey(password,salt);const plain=new TextEncoder().encode(JSON.stringify(payload));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);return {format:'AEJ-BACKUP-ENCRYPTED',version:1,kdf:'PBKDF2-SHA256',iterations:250000,cipher:'AES-256-GCM',salt:arrayBufferToBase64(salt),iv:arrayBufferToBase64(iv),data:arrayBufferToBase64(cipher)};}
async function decryptBackupEnvelope(env,password){const salt=new Uint8Array(await (await base64ToBlob(env.salt)).arrayBuffer()),iv=new Uint8Array(await (await base64ToBlob(env.iv)).arrayBuffer()),cipher=await (await base64ToBlob(env.data)).arrayBuffer(),key=await deriveBackupKey(password,salt);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher);return JSON.parse(new TextDecoder().decode(plain));}
async function exportFullBackup(){
  if(!crypto?.subtle)throw new Error('WebCrypto indisponible : sauvegarde chiffrée impossible.');
  const password=prompt('Mot de passe de la sauvegarde chiffrée (12 caractères minimum).\n\nConserve-le séparément : il est impossible de restaurer la sauvegarde sans lui.');
  if(password===null)return;if(password.length<12)throw new Error('Le mot de passe doit contenir au moins 12 caractères.');
  const idx=loadIndex(),dossiers=idx.dossiers.map(d=>loadDossier(d.id)).filter(Boolean),rows=await dbAll(),files=[];for(const r of rows)files.push(await serializeDbRecord(r));
  const payload={format:BACKUP_FORMAT,backupVersion:BACKUP_VERSION,appVersion:'2.5.1',createdAt:new Date().toISOString(),index:idx,dossiers,files};
  const envelope=await encryptBackupPayload(payload,password),stamp=new Date().toISOString().replace(/[:.]/g,'-');
  download(`AEJ-sauvegarde-chiffree-${stamp}.aej-backup`,JSON.stringify(envelope),'application/octet-stream');
  localStorage.setItem(LAST_BACKUP_KEY,payload.createdAt);updateBackupState();
}
function updateBackupState(){
  const el=$("backupState"); if(!el)return; const iso=localStorage.getItem(LAST_BACKUP_KEY);
  el.textContent=iso?`Dernière sauvegarde créée : ${fmtDateTime(iso)}`:"Aucune sauvegarde créée depuis cette version.";
}
async function restoreFullBackup(file){
  const text=await file.text(); let payload;
  try{payload=JSON.parse(text);}catch{throw new Error("Fichier de sauvegarde invalide.");}
  if(payload?.format==='AEJ-BACKUP-ENCRYPTED'){const password=prompt('Mot de passe de cette sauvegarde chiffrée :');if(password===null)return;try{payload=await decryptBackupEnvelope(payload,password);}catch{throw new Error('Mot de passe incorrect ou sauvegarde altérée.');}}
  if(payload?.format!==BACKUP_FORMAT||!Array.isArray(payload.dossiers)||!Array.isArray(payload.files))throw new Error("Ce fichier n’est pas une sauvegarde complète AEJ reconnue.");
  const existing=loadIndex();
  const incomingIds=new Set(payload.dossiers.map(s=>s?.dossier?.id).filter(Boolean));
  const collisions=existing.dossiers.filter(d=>incomingIds.has(d.id));
  if(collisions.length&&!confirm(`${collisions.length} dossier(s) existent déjà avec le même identifiant.\n\nRestaurer la sauvegarde remplacera ces dossiers par leur version sauvegardée, sans supprimer les autres dossiers locaux. Continuer ?`))return;
  for(const s of payload.dossiers){
    if(!s?.dossier?.id)continue; s.version=2.5; normalizeMissionInterventions(s);normalizePhotoPlacements(s);
    localStorage.setItem(dossierKey(s.dossier.id),JSON.stringify(s));
  }
  for(const r of payload.files){
    const rec={...r}; if(rec.blobBase64){rec.blob=base64ToBlob(rec.blobBase64,rec.blobType||rec.type);delete rec.blobBase64;delete rec.blobType;}
    await dbPut(rec);
  }
  const merged=new Map(existing.dossiers.map(d=>[d.id,d]));
  for(const s of payload.dossiers){if(!s?.dossier?.id)continue;const d=s.dossier;merged.set(d.id,{id:d.id,title:d.title||d.ordonnanceName||"Dossier sans titre",ordonnanceName:d.ordonnanceName||"",createdAt:d.createdAt,updatedAt:d.updatedAt});}
  const idx={version:2.5,currentId:payload.index?.currentId||existing.currentId||null,dossiers:[...merged.values()].sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))};
  saveIndex(idx); localStorage.setItem(LAST_BACKUP_KEY,new Date().toISOString()); renderDossierList();updateBackupState();
  alert(`${payload.dossiers.length} dossier(s) restauré(s). Les dossiers locaux non présents dans la sauvegarde ont été conservés.`);
}


// Accueil / ordonnance
const pdfInput=$("pdfInput"), chooseBtn=$("chooseBtn"), analyseBtn=$("analyseBtn"), drop=$("drop");
chooseBtn.onclick=()=>pdfInput.click();
pdfInput.onchange=()=>selectFile(pdfInput.files[0]);
["dragenter","dragover"].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.add("drag");}));
["dragleave","drop"].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.remove("drag");}));
drop.addEventListener("drop",e=>selectFile(e.dataTransfer.files[0]));
async function selectFile(file){
  if(!file)return;
  if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))return status("Le document sélectionné n’est pas un PDF.");
  selectedFile=file;
  $("fileName").textContent=file.name;
  $("fileInfo").textContent=`${(file.size/1024/1024).toFixed(2)} Mo · conservé localement`;
  analyseBtn.disabled=false;
  status("Ordonnance prête. L’ouverture du dossier ne transmet aucun document.");
}
analyseBtn.onclick=async()=>{
  if(!selectedFile)return; analyseBtn.disabled=true; analyseBtn.textContent="Lecture locale en cours…";
  status("Création d’un nouveau dossier. Aucun dossier existant ne sera remplacé.");
  state=blankState(); currentId=state.dossier.id; state.dossier.title=selectedFile.name.replace(/\.pdf$/i,""); state.dossier.ordonnanceName=selectedFile.name;
  try{
    const ordId='ordonnance-'+uid(); state.dossier.ordonnanceFileId=ordId; await dbPut({id:ordId,kind:"ordonnance",name:selectedFile.name,type:selectedFile.type,blob:selectedFile,updatedAt:new Date().toISOString()});
    const a=await prepareOrdonnanceFromPdf(selectedFile,msg=>status(msg)); state.resume="";state.vigilances=(a.controls||[]).map(x=>`• ${x}`).join("\n");state.dossier.extractedFacts=a.facts||[];normalizeDossierMeta(state);const jf=(a.facts||[]).find(x=>x.label==="Juridiction");if(jf&&!state.dossier.reportMeta.juridiction)state.dossier.reportMeta.juridiction=jf.value;state.dossier.dispositifVerbatim=a.dispositifVerbatim||"";state.dossier.missionCheck=a.missionCheck||null;state.dossier.ocrDiagnostic=a.ocrDiagnostic||state.dossier.ocrDiagnostic||[];state.dossier.analysisErrors=a.analysisErrors||[];state.dossier.missionsValidated=false;state.dossier.missionsValidatedAt=null;
    state.missions=(a.missions.length?a.missions:["Missions de l’expert non extraites automatiquement — vérifier et reprendre le dispositif de l’ordonnance."]).map((text,i)=>({id:uid(),order:i+1,text,sourcePage:a.missionSources?.[i]?.page||null,response:"",status:"À vérifier",intervention:blankIntervention()}));
    state.dossier.analysis={mode:a.mode,pages:a.pages,chars:a.chars,analysedAt:new Date().toISOString()};persist("Lecture locale de l’ordonnance");openDossier();
  }catch(e){console.error(e);state.resume="";if(!Array.isArray(state.dossier.extractedFacts))state.dossier.extractedFacts=[];const previous=state.vigilances?state.vigilances+"\n":"";state.vigilances=previous+`• Lecture automatique incomplète : ${e.message||"cause indéterminée"}\n• Les données déjà extraites et le diagnostic PDF/OCR ont été conservés.\n• Le PDF original demeure la référence.`;if(!Array.isArray(state.missions)||!state.missions.length)state.missions=[{id:uid(),order:1,text:"Missions de l’expert à reprendre manuellement depuis le dispositif de l’ordonnance.",response:"",status:"À vérifier",intervention:blankIntervention()}];state.dossier.analysis={...(state.dossier.analysis||{}),error:e.message||"cause indéterminée",failedAt:new Date().toISOString()};persist("Import PDF partiel — données conservées");openDossier();}
  finally{analyseBtn.disabled=false;analyseBtn.textContent="Créer le dossier et analyser";}
};
function openDossierById(id){const s=loadDossier(id);if(!s)return status("Dossier local introuvable.");state=s;currentId=id;openDossier();}
function openDossier(){$("dossierTitle").textContent=state.dossier.title||state.dossier.ordonnanceName||"Dossier d’expertise";$('home').classList.remove('active');$('dossier').classList.add('active');renderAll();}
document.querySelector("[data-back]").onclick=()=>{persist();$("dossier").classList.remove("active");$("home").classList.add("active");renderDossierList();};
function renderDossierList(){const el=$("dossierList");if(!el)return;const idx=loadIndex();if(!idx.dossiers.length){el.innerHTML='<div class="empty-zone">Aucun dossier enregistré.</div>';return;}el.innerHTML=idx.dossiers.map(d=>`<article class="dossier-row"><div><strong>${escapeHtml(d.title)}</strong><small>${escapeHtml(d.ordonnanceName||'')} · modifié ${fmtDateTime(d.updatedAt)}</small></div><div class="dossier-actions"><button data-open-dossier="${d.id}" class="primary">Ouvrir</button><button data-delete-dossier="${d.id}" class="danger-light">Supprimer</button></div></article>`).join('');
  el.querySelectorAll('[data-open-dossier]').forEach(b=>b.onclick=()=>openDossierById(b.dataset.openDossier));
  el.querySelectorAll('[data-delete-dossier]').forEach(b=>b.onclick=async()=>{const id=b.dataset.deleteDossier,d=loadDossier(id);if(!confirm(`Supprimer définitivement « ${d?.dossier?.title||'ce dossier'} » de ce navigateur ?\n\nCette action supprime également ses photos, annexes et l’ordonnance enregistrées localement.`))return;localStorage.removeItem(dossierKey(id));await dbDeleteDossier(id);const idx=loadIndex();idx.dossiers=idx.dossiers.filter(x=>x.id!==id);if(idx.currentId===id)idx.currentId=null;saveIndex(idx);renderDossierList();});
}
if($("backupExportBtn")) $("backupExportBtn").onclick=async()=>{try{await exportFullBackup();}catch(e){console.error(e);alert("La sauvegarde n’a pas pu être créée : "+(e.message||e));}};
if($("backupImportBtn")) $("backupImportBtn").onclick=()=>$("backupImportInput").click();
if($("backupImportInput")) $("backupImportInput").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{await restoreFullBackup(file);}catch(err){console.error(err);alert("Restauration impossible : "+(err.message||err));}finally{e.target.value="";}};
updateBackupState();

document.querySelectorAll("[data-tab]").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll("[data-tab],.tab").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");$(btn.dataset.tab).classList.add("active");
  if(btn.dataset.tab==="apercu")renderPreview();
  if(btn.dataset.tab==="photos")renderPhotos();
});

// Synthèse structurée de l’ordonnance
function bindReportMeta(){document.querySelectorAll('[data-report-meta]').forEach(el=>{const save=()=>{normalizeDossierMeta(state);state.dossier.reportMeta[el.dataset.reportMeta]=el.value;touch();renderPreview();};el.oninput=save;el.onchange=save;});}


// Missions de l’expert + rédaction + intervenants
$("addMission").onclick=()=>{state.dossier.missionsValidated=false;state.dossier.missionsValidatedAt=null;state.missions.push({id:uid(),order:state.missions.length+1,text:"Nouvelle mission de l’expert à reformuler.",response:"",status:"À rédiger",intervention:blankIntervention()});persist();renderMission();renderResponses();};
function renderMission(){
  $("missionList").innerHTML=state.missions.map((m,i)=>`<div class="mission-edit"><b>${String(i+1).padStart(2,"0")}${m.sourcePage?` · p.${m.sourcePage}`:""}</b><textarea data-mission-text="${m.id}" class="editor mini">${escapeHtml(m.text)}</textarea><button class="delete" data-del-mission="${m.id}" title="Supprimer">×</button></div>`).join("")||"<div class='empty-zone'>Aucune mission de l’expert.</div>";
  document.querySelectorAll("[data-mission-text]").forEach(el=>el.oninput=()=>{const m=state.missions.find(x=>x.id===el.dataset.missionText);m.text=el.value;state.dossier.missionsValidated=false;state.dossier.missionsValidatedAt=null;touch();renderResponses(false);});
  document.querySelectorAll("[data-del-mission]").forEach(el=>el.onclick=()=>{if(!confirm("Supprimer cette mission, sa réponse et ses informations d’intervention ?"))return;state.dossier.missionsValidated=false;state.dossier.missionsValidatedAt=null;state.missions=state.missions.filter(x=>x.id!==el.dataset.delMission);state.missions.forEach((m,i)=>m.order=i+1);persist();renderMission();renderResponses();});
}
function interventionDocsHtml(m){
  const iv=m.intervention||blankIntervention();
  if(!state.annexMeta.length)return '<div class="intervention-empty">Aucun document dans Annexes. Tu peux en importer un directement ici.</div>';
  return state.annexMeta.map((a,i)=>`<label class="doc-check"><input type="checkbox" data-int-doc="${m.id}" value="${a.id}" ${iv.documents.includes(a.id)?'checked':''}> A${String(i+1).padStart(2,'0')} · ${escapeHtml(a.name)}</label>`).join('');
}
function mailDraft(m,i){
  const iv=m.intervention||blankIntervention();
  const who=iv.identity?` ${iv.identity}`:'';
  const subject=`Expertise judiciaire – demande d’intervention – mission ${String(i+1).padStart(2,'0')}`;
  const body=`Bonjour${who},\n\nDans le cadre de l’expertise judiciaire en cours, je souhaite solliciter votre intervention en qualité de ${iv.role||'intervenant'}${iv.specialty?` – ${iv.specialty}`:''}.\n\nObjet précis de l’intervention :\n${iv.object||'[à compléter]'}\n\nMission de l’expert concernée :\n${m.text}\n\nMerci de me confirmer vos disponibilités et les modalités de votre intervention. Les éléments utiles vous seront transmis séparément.\n\nCordialement`;
  return {subject,body};
}
function renderResponses(preserveFocus=true){
  normalizeMissionInterventions(state);
  const active=preserveFocus?document.activeElement?.dataset?.response:null;
  $("responseList").innerHTML=state.missions.map((m,i)=>{const iv=m.intervention;return `<section class="response-card"><div class="response-title"><span>${String(i+1).padStart(2,"0")}</span><div><strong>${escapeHtml(m.text)}</strong><small>Mission ${i+1}</small></div><select data-status="${m.id}"><option ${m.status==="À rédiger"?"selected":""}>À rédiger</option><option ${m.status==="En cours"?"selected":""}>En cours</option><option ${m.status==="Rédigé"?"selected":""}>Rédigé</option><option ${m.status==="À vérifier"?"selected":""}>À vérifier</option></select></div><textarea class="editor response-editor" data-response="${m.id}" placeholder="Rédiger ici les constatations, éléments techniques, réponses et réserves utiles à cette mission…">${escapeHtml(m.response)}</textarea>
  <details class="intervention-panel" ${iv.role!=="Expert"||iv.identity?'open':''}><summary><span>Intervention / concours extérieur</span><span class="intervention-badge">${escapeHtml(iv.role)}${iv.identity?' · '+escapeHtml(iv.identity):''}</span></summary><div class="intervention-grid">
    <label>Rôle<select data-int-field="role" data-mid="${m.id}"><option ${iv.role==='Expert'?'selected':''}>Expert</option><option ${iv.role==='Assistant'?'selected':''}>Assistant</option><option ${iv.role==='Technicien-sapiteur'?'selected':''}>Technicien-sapiteur</option></select></label>
    <label>Identité<input data-int-field="identity" data-mid="${m.id}" value="${escapeHtml(iv.identity)}" placeholder="Mme / M. …"></label>
    <label>Spécialité / qualité<input data-int-field="specialty" data-mid="${m.id}" value="${escapeHtml(iv.specialty)}" placeholder="Géomètre-expert, ingénieur structure…"></label>
    <label>Statut<select data-int-field="status" data-mid="${m.id}"><option ${iv.status==='Non requis'?'selected':''}>Non requis</option><option ${iv.status==='À solliciter'?'selected':''}>À solliciter</option><option ${iv.status==='Sollicité'?'selected':''}>Sollicité</option><option ${iv.status==='Accepté'?'selected':''}>Accepté</option><option ${iv.status==='En cours'?'selected':''}>En cours</option><option ${iv.status==='Document reçu'?'selected':''}>Document reçu</option><option ${iv.status==='Terminé'?'selected':''}>Terminé</option></select></label>
    <label class="wide">Objet précis de l’intervention<textarea data-int-field="object" data-mid="${m.id}" class="editor mini" placeholder="Décrire précisément le concours demandé, sans transférer la mission judiciaire…">${escapeHtml(iv.object)}</textarea></label>
    <label class="wide">E-mail de l’intervenant<input type="email" data-int-field="email" data-mid="${m.id}" value="${escapeHtml(iv.email)}" placeholder="nom@exemple.fr"></label>
    <div class="wide intervention-docs"><div class="intervention-doc-head"><strong>Documents associés</strong><button type="button" data-int-upload="${m.id}">+ Importer un document</button><input type="file" data-int-file="${m.id}" hidden multiple></div><div>${interventionDocsHtml(m)}</div></div>
    <div class="wide mail-actions"><button type="button" data-mail-copy="${m.id}" data-index="${i}">Copier le courriel préparé</button><button type="button" class="primary" data-mail-open="${m.id}" data-index="${i}">Préparer dans la messagerie</button><small>Le message est seulement préparé : l’expert le relit et décide de l’envoyer.</small></div>
  </div></details></section>`}).join("");
  document.querySelectorAll("[data-response]").forEach(el=>el.oninput=()=>{const m=state.missions.find(x=>x.id===el.dataset.response);m.response=el.value;touch();});
  document.querySelectorAll("[data-status]").forEach(el=>el.onchange=()=>{state.missions.find(x=>x.id===el.dataset.status).status=el.value;persist();});
  document.querySelectorAll("[data-int-field]").forEach(el=>{const save=()=>{const m=state.missions.find(x=>x.id===el.dataset.mid);m.intervention[el.dataset.intField]=el.value;touch();};el.oninput=save;el.onchange=save;});
  document.querySelectorAll("[data-int-doc]").forEach(el=>el.onchange=()=>{const m=state.missions.find(x=>x.id===el.dataset.intDoc),docs=m.intervention.documents;el.checked?(!docs.includes(el.value)&&docs.push(el.value)):m.intervention.documents=docs.filter(x=>x!==el.value);persist();});
  document.querySelectorAll("[data-int-upload]").forEach(el=>el.onclick=()=>document.querySelector(`[data-int-file="${el.dataset.intUpload}"]`).click());
  document.querySelectorAll("[data-int-file]").forEach(el=>el.onchange=async()=>{const m=state.missions.find(x=>x.id===el.dataset.intFile);for(const file of [...el.files]){const id=uid();await dbPut({id,kind:"annexe",name:file.name,type:file.type,blob:file,updatedAt:new Date().toISOString()});state.annexMeta.push({id,number:state.annexMeta.length+1,name:file.name,category:"Intervention",description:`Document associé à la mission ${m.order}`,createdAt:new Date().toISOString()});m.intervention.documents.push(id);}el.value="";persist();renderAnnexes();renderResponses(false);});
  document.querySelectorAll("[data-mail-copy]").forEach(el=>el.onclick=async()=>{const m=state.missions.find(x=>x.id===el.dataset.mailCopy),d=mailDraft(m,Number(el.dataset.index));const text=`Objet : ${d.subject}\n\n${d.body}`;try{await navigator.clipboard.writeText(text);alert("Courriel préparé copié dans le presse-papiers.");}catch{prompt("Copie ce courriel :",text);}});
  document.querySelectorAll("[data-mail-open]").forEach(el=>el.onclick=()=>{const m=state.missions.find(x=>x.id===el.dataset.mailOpen),d=mailDraft(m,Number(el.dataset.index));location.href=`mailto:${encodeURIComponent(m.intervention.email||'')}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;});
  if(active){const e=document.querySelector(`[data-response="${active}"]`); if(e){e.focus();e.selectionStart=e.selectionEnd=e.value.length;}}
}

// Validation explicite de la liste des missions
if($("validateMissionsBtn")) $("validateMissionsBtn").onclick=()=>{
  const mc=state.dossier.missionCheck;
  const msg=mc&&!mc.complete?"Le contrôle automatique signale une extraction potentiellement incomplète. As-tu comparé ligne par ligne la liste ci-dessous avec le dispositif original et corrigé/ajouté toutes les missions ?":"As-tu comparé la liste des missions avec le dispositif original de l’ordonnance ?";
  if(!confirm(msg))return;state.dossier.missionsValidated=true;state.dossier.missionsValidatedAt=new Date().toISOString();persist('Validation missions');renderAll();
};

// Registre du contradictoire
if($("addContradictoire")) $("addContradictoire").onclick=()=>{state.contradictoire=state.contradictoire||[];state.contradictoire.push({id:uid(),date:new Date().toISOString().slice(0,10),type:'Convocation',destinataires:'',mode:'',details:'',response:''});persist();renderContradictoire();};
function renderContradictoire(){if(!$("contradictoireList"))return;state.contradictoire=state.contradictoire||[];$("contradictoireList").innerHTML=state.contradictoire.length?state.contradictoire.map((e,i)=>`<article class="operation"><div class="operation-head"><strong>${i+1}. ${escapeHtml(e.type||'Événement')}</strong><button class="delete" data-del-contr="${e.id}">×</button></div><div class="operation-grid"><label>Date<input type="date" data-contr="date" data-cid="${e.id}" value="${escapeHtml(e.date||'')}"></label><label>Type<select data-contr="type" data-cid="${e.id}"><option ${e.type==='Convocation'?'selected':''}>Convocation</option><option ${e.type==='Présence'?'selected':''}>Présence</option><option ${e.type==='Pièce communiquée'?'selected':''}>Pièce communiquée</option><option ${e.type==='Dire reçu'?'selected':''}>Dire reçu</option><option ${e.type==='Réponse au dire'?'selected':''}>Réponse au dire</option><option ${e.type==='Autre'?'selected':''}>Autre</option></select></label><label>Destinataires / personnes<input data-contr="destinataires" data-cid="${e.id}" value="${escapeHtml(e.destinataires||'')}"></label><label>Mode / support<input data-contr="mode" data-cid="${e.id}" value="${escapeHtml(e.mode||'')}" placeholder="LRAR, e-mail, réunion…"></label><label class="wide">Détails / pièce / observations<textarea class="editor mini" data-contr="details" data-cid="${e.id}">${escapeHtml(e.details||'')}</textarea></label><label class="wide">Réponse / suite donnée<textarea class="editor mini" data-contr="response" data-cid="${e.id}">${escapeHtml(e.response||'')}</textarea></label></div></article>`).join(''):'<div class="empty-zone">Aucun événement contradictoire enregistré.</div>';document.querySelectorAll('[data-contr]').forEach(el=>{const save=()=>{const e=state.contradictoire.find(x=>x.id===el.dataset.cid);e[el.dataset.contr]=el.value;touch();};el.oninput=save;el.onchange=save;});document.querySelectorAll('[data-del-contr]').forEach(el=>el.onclick=()=>{if(!confirm('Supprimer cet événement du registre ?'))return;state.contradictoire=state.contradictoire.filter(x=>x.id!==el.dataset.delContr);persist();renderContradictoire();});}

// Photos
$("addPhotoBtn").onclick=()=>$("photoInput").click();
$("photoInput").onchange=async()=>{for(const file of [...$("photoInput").files]){if(!file.type.startsWith("image/"))continue;const id=uid();await dbPut({id,kind:"photo",name:file.name,type:file.type,blob:file,updatedAt:new Date().toISOString()});state.photoMeta.push({id,number:state.photoMeta.length+1,name:file.name,caption:"",category:"Constatations",placement:"unplaced",createdAt:new Date().toISOString()});}$("photoInput").value="";persist();await renderPhotos();};
$("photoFilter").onchange=()=>renderPhotos();
$("renumberPhotos").onclick=()=>{state.photoMeta.forEach((p,i)=>p.number=i+1);persist();renderPhotos();};
async function renderPhotos(){
  objectUrls.forEach(URL.revokeObjectURL);objectUrls=[];
  const cats=[...new Set(state.photoMeta.map(p=>p.category).filter(Boolean))].sort();
  const current=$("photoFilter").value;
  $("photoFilter").innerHTML='<option value="">Toutes les photos</option>'+cats.map(c=>`<option value="${escapeHtml(c)}" ${current===c?'selected':''}>${escapeHtml(c)}</option>`).join("");
  const filter=$("photoFilter").value;
  const list=state.photoMeta.filter(p=>!filter||p.category===filter).sort((a,b)=>a.number-b.number);
  if(!list.length){$("photoGrid").className="photo-grid empty-zone";$("photoGrid").innerHTML="Aucune photo importée pour ce classement.";return;}
  $("photoGrid").className="photo-grid";
  const cards=[];
  const placementOptions=()=>{
    const base=[
      ["unplaced","Non placée dans le rapport"],
      ["cadre","Cadre de la mission"],
      ["vigilances","Points de vigilance et vérifications"],
      ["operations","Déroulement des opérations"],
      ["annexes","Annexes et pièces"]
    ];
    state.missions.forEach((m,i)=>base.push([`mission:${m.id}`,`Réponse mission ${i+1}`]));
    return base;
  };
  for(const p of list){const rec=await dbGet(p.id);let src="";if(rec?.blob){src=URL.createObjectURL(rec.blob);objectUrls.push(src);}const placement=p.placement||"unplaced";const opts=placementOptions().map(([v,l])=>`<option value="${escapeHtml(v)}" ${placement===v?'selected':''}>${escapeHtml(l)}</option>`).join("");cards.push(`<article class="photo-card"><div class="photo-thumb">${src?`<img src="${src}" alt="Photo ${p.number}">`:'<span>Fichier indisponible</span>'}</div><div class="photo-fields"><strong>Photo ${p.number}</strong><small>${escapeHtml(p.name)}</small><input data-photo-cat="${p.id}" value="${escapeHtml(p.category)}" placeholder="Classement"><textarea data-photo-caption="${p.id}" class="editor mini" placeholder="Légende de la photo">${escapeHtml(p.caption)}</textarea><label class="photo-placement-label">Emplacement dans le rapport<select data-photo-placement="${p.id}">${opts}</select></label><button data-del-photo="${p.id}" class="danger-light">Supprimer</button></div></article>`);}
  $("photoGrid").innerHTML=cards.join("");
  document.querySelectorAll("[data-photo-cat]").forEach(el=>el.oninput=()=>{state.photoMeta.find(x=>x.id===el.dataset.photoCat).category=el.value;touch();});
  document.querySelectorAll("[data-photo-caption]").forEach(el=>el.oninput=()=>{state.photoMeta.find(x=>x.id===el.dataset.photoCaption).caption=el.value;touch();});
  document.querySelectorAll("[data-photo-placement]").forEach(el=>el.onchange=()=>{state.photoMeta.find(x=>x.id===el.dataset.photoPlacement).placement=el.value;persist();renderPreview();});
  document.querySelectorAll("[data-del-photo]").forEach(el=>el.onclick=async()=>{if(!confirm("Supprimer cette photo du dossier local ?"))return;await dbDelete(el.dataset.delPhoto);state.photoMeta=state.photoMeta.filter(x=>x.id!==el.dataset.delPhoto);state.photoMeta.forEach((p,i)=>p.number=i+1);persist();renderPhotos();});
}

// Annexes
$("addAnnexBtn").onclick=()=>$("annexInput").click();
$("annexInput").onchange=async()=>{for(const file of [...$("annexInput").files]){const id=uid();await dbPut({id,kind:"annexe",name:file.name,type:file.type,blob:file,updatedAt:new Date().toISOString()});state.annexMeta.push({id,number:state.annexMeta.length+1,name:file.name,category:"Pièce",description:"",createdAt:new Date().toISOString()});}$("annexInput").value="";persist();renderAnnexes();};
function renderAnnexes(){
  if(!state.annexMeta.length){$("annexList").className="annex-list empty-zone";$("annexList").innerHTML="Aucune annexe importée.";return;}
  $("annexList").className="annex-list";
  $("annexList").innerHTML=state.annexMeta.map((a,i)=>`<div class="annex-row"><span class="annex-no">A${String(i+1).padStart(2,"0")}</span><div class="annex-main"><strong>${escapeHtml(a.name)}</strong><small>${fmtDateTime(a.createdAt)}</small></div><input data-annex-cat="${a.id}" value="${escapeHtml(a.category)}" placeholder="Classement"><input data-annex-desc="${a.id}" value="${escapeHtml(a.description)}" placeholder="Description / origine"><button data-open-annex="${a.id}">Ouvrir</button><button class="delete" data-del-annex="${a.id}">×</button></div>`).join("");
  document.querySelectorAll("[data-annex-cat]").forEach(el=>el.oninput=()=>{state.annexMeta.find(x=>x.id===el.dataset.annexCat).category=el.value;touch();});
  document.querySelectorAll("[data-annex-desc]").forEach(el=>el.oninput=()=>{state.annexMeta.find(x=>x.id===el.dataset.annexDesc).description=el.value;touch();});
  document.querySelectorAll("[data-open-annex]").forEach(el=>el.onclick=async()=>{const r=await dbGet(el.dataset.openAnnex);if(!r?.blob)return alert("Fichier local introuvable.");const u=URL.createObjectURL(r.blob);window.open(u,"_blank");setTimeout(()=>URL.revokeObjectURL(u),60000);});
  document.querySelectorAll("[data-del-annex]").forEach(el=>el.onclick=async()=>{if(!confirm("Supprimer cette annexe du dossier local ?"))return;await dbDelete(el.dataset.delAnnex);state.annexMeta=state.annexMeta.filter(x=>x.id!==el.dataset.delAnnex);persist();renderAnnexes();});
}

// Opérations
$("addOperation").onclick=()=>{state.operations.unshift({id:uid(),date:new Date().toISOString().slice(0,10),type:"Réunion / visite",title:"Nouvelle opération",notes:"",createdAt:new Date().toISOString()});persist();renderOperations();};
function renderOperations(){
  if(!state.operations.length){$("operationList").innerHTML='<div class="empty-zone">Aucune opération enregistrée.</div>';return;}
  $("operationList").innerHTML=state.operations.map(o=>`<div class="operation-row"><input type="date" data-op-date="${o.id}" value="${o.date}"><select data-op-type="${o.id}"><option ${o.type==="Réunion / visite"?'selected':''}>Réunion / visite</option><option ${o.type==="Courrier / courriel"?'selected':''}>Courrier / courriel</option><option ${o.type==="Pièce reçue"?'selected':''}>Pièce reçue</option><option ${o.type==="Note technique"?'selected':''}>Note technique</option><option ${o.type==="Jalon"?'selected':''}>Jalon</option></select><input data-op-title="${o.id}" value="${escapeHtml(o.title)}" placeholder="Objet"><textarea data-op-notes="${o.id}" class="editor mini" placeholder="Compte rendu factuel / observations">${escapeHtml(o.notes)}</textarea><button class="delete" data-del-op="${o.id}">×</button></div>`).join("");
  document.querySelectorAll("[data-op-date]").forEach(el=>el.onchange=()=>{state.operations.find(x=>x.id===el.dataset.opDate).date=el.value;persist();});
  document.querySelectorAll("[data-op-type]").forEach(el=>el.onchange=()=>{state.operations.find(x=>x.id===el.dataset.opType).type=el.value;persist();});
  document.querySelectorAll("[data-op-title]").forEach(el=>el.oninput=()=>{state.operations.find(x=>x.id===el.dataset.opTitle).title=el.value;touch();});
  document.querySelectorAll("[data-op-notes]").forEach(el=>el.oninput=()=>{state.operations.find(x=>x.id===el.dataset.opNotes).notes=el.value;touch();});
  document.querySelectorAll("[data-del-op]").forEach(el=>el.onclick=()=>{state.operations=state.operations.filter(x=>x.id!==el.dataset.delOp);persist();renderOperations();});
}

// Tâches
$("addTask").onclick=()=>{const title=prompt("Nouvelle tâche :");if(!title)return;state.tasks.push({id:uid(),title,type:"Suggestion",source:"Ajout manuel",due:"",confirmed:false,done:false});persist();renderTasks();};
function renderTasks(){
  $("taskList").innerHTML=state.tasks.map(t=>`<div class="task ${t.done?'done':''}"><button class="tick" data-toggle-task="${t.id}">${t.done?'✓':''}</button><div class="task-title"><span class="type ${t.type.toLowerCase()}">${t.type}</span><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.source)}</small></div><input type="date" data-task-date="${t.id}" value="${t.due}"><label><input type="checkbox" data-task-confirm="${t.id}" ${t.confirmed?'checked':''}> Confirmée</label><button class="delete" data-del-task="${t.id}">×</button></div>`).join("");
  const n=state.tasks.filter(t=>t.due&&t.confirmed).length;$("taskCount").textContent=`${n} échéance${n>1?'s':''} confirmée${n>1?'s':''}`;
  document.querySelectorAll("[data-toggle-task]").forEach(el=>el.onclick=()=>{const t=state.tasks.find(x=>x.id===el.dataset.toggleTask);t.done=!t.done;persist();renderTasks();});
  document.querySelectorAll("[data-task-date]").forEach(el=>el.onchange=()=>{const t=state.tasks.find(x=>x.id===el.dataset.taskDate);t.due=el.value;t.confirmed=false;persist();renderTasks();});
  document.querySelectorAll("[data-task-confirm]").forEach(el=>el.onchange=()=>{const t=state.tasks.find(x=>x.id===el.dataset.taskConfirm);if(el.checked&&!t.due){alert("Renseigne d’abord une date.");return renderTasks();}t.confirmed=el.checked;persist();renderTasks();});
  document.querySelectorAll("[data-del-task]").forEach(el=>el.onclick=()=>{state.tasks=state.tasks.filter(x=>x.id!==el.dataset.delTask);persist();renderTasks();});
}
function icsEscape(v=""){return String(v).replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
$("icsBtn").onclick=()=>{const events=state.tasks.filter(t=>t.confirmed&&t.due).map(t=>`BEGIN:VEVENT\r\nUID:${t.id}@expert.local\r\nDTSTART;VALUE=DATE:${t.due.replaceAll("-","")}\r\nSUMMARY:${icsEscape(t.title)}\r\nDESCRIPTION:${icsEscape(t.source)}\r\nBEGIN:VALARM\r\nTRIGGER:-P7D\r\nACTION:DISPLAY\r\nDESCRIPTION:Rappel expertise\r\nEND:VALARM\r\nEND:VEVENT`);if(!events.length)return alert("Aucune échéance datée et confirmée.");download("echeances-expertise.ics",`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Assistant Expert Judiciaire V2.5//FR\r\n${events.join("\r\n")}\r\nEND:VCALENDAR`,`text/calendar;charset=utf-8`);};

// Aperçu rapport
$("refreshPreview").onclick=()=>renderPreview();
$("wordExportBtn").onclick=()=>exportReportDocx();

// --- V2.5 : export Word DOCX autonome, sans bibliothèque externe ---
// Le DOCX est généré localement à partir des données du dossier et des photos placées dans le rapport.
function xmlEscape(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));}
function safeFileName(v="rapport-expertise"){return String(v||"rapport-expertise").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)||"rapport-expertise";}
function wRun(text,opt={}){
  const props=[opt.bold?"<w:b/>":"",opt.italic?"<w:i/>":"",opt.size?`<w:sz w:val="${opt.size}"/><w:szCs w:val="${opt.size}"/>`:"",opt.color?`<w:color w:val="${opt.color}"/>`:""].join("");
  return `<w:r>${props?`<w:rPr>${props}</w:rPr>`:""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}
function wParagraph(text="",opt={}){
  const align=opt.align?`<w:jc w:val="${opt.align}"/>`:"";
  const space=opt.after!=null?`<w:spacing w:after="${opt.after}"/>`:"";
  const pageBreak=opt.pageBreak?"<w:pageBreakBefore/>":"";
  const style=opt.style?`<w:pStyle w:val="${opt.style}"/>`:"";
  const ppr=(align||space||pageBreak||style)?`<w:pPr>${style}${align}${space}${pageBreak}</w:pPr>`:"";
  const lines=String(text??"").split(/\r?\n/);
  const runs=lines.map((line,i)=>`${i?"<w:r><w:br/></w:r>":""}${wRun(line,opt)}`).join("");
  return `<w:p>${ppr}${runs||wRun("",opt)}</w:p>`;
}
function wBullet(text){return wParagraph(`• ${text}`,{after:80});}
function wPageBreak(){return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';}
function wImage(relId,name,cx,cy){
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="60"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${relId.replace(/\D/g,'')||1}" name="${xmlEscape(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${xmlEscape(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^0xffffffff)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
function concatBytes(parts){const total=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(total);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
function makeZip(entries){
  const enc=new TextEncoder(),local=[],central=[];let offset=0;
  for(const e of entries){
    const name=enc.encode(e.name),data=e.data instanceof Uint8Array?e.data:enc.encode(String(e.data));const crc=crc32(data);
    const lh=concatBytes([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(33),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    local.push(lh);
    const ch=concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(33),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    central.push(ch);offset+=lh.length;
  }
  const cd=concatBytes(central),body=concatBytes(local),end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(cd.length),u32(body.length),u16(0)]);
  return concatBytes([body,cd,end]);
}
async function imageBlobForDocx(blob){
  try{
    const bmp=await createImageBitmap(blob),maxW=540,maxH=420,scale=Math.min(1,maxW/bmp.width,maxH/bmp.height),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(bmp,0,0,w,h);bmp.close?.();
    const out=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Conversion image impossible.')),'image/png',0.92));
    return {bytes:new Uint8Array(await out.arrayBuffer()),width:w,height:h,ext:'png',contentType:'image/png'};
  }catch(e){console.warn('Photo ignorée dans Word :',e);return null;}
}
async function collectDocxPhotos(){
  normalizePhotoPlacements(state);const byPlacement={},images=[],rels=[];let n=1;
  for(const p of state.photoMeta.slice().sort((a,b)=>a.number-b.number)){
    if(!p.placement||p.placement==='unplaced')continue;const rec=await dbGet(p.id);if(!rec?.blob)continue;const img=await imageBlobForDocx(rec.blob);if(!img)continue;
    const relId=`rIdImg${n}`,file=`image${n}.${img.ext}`;images.push({name:`word/media/${file}`,data:img.bytes,contentType:img.contentType,ext:img.ext});rels.push({id:relId,target:`media/${file}`});
    if(!byPlacement[p.placement])byPlacement[p.placement]=[];byPlacement[p.placement].push({p,img,relId});n++;
  }return {byPlacement,images,rels};
}
function docxPhotoBlocks(items=[]){
  const EMU=914400,maxCx=Math.round(6.0*EMU),maxCy=Math.round(4.5*EMU);let out='';
  for(const {p,img,relId} of items){let cx=maxCx,cy=Math.round(cx*img.height/img.width);if(cy>maxCy){cy=maxCy;cx=Math.round(cy*img.width/img.height);}out+=wImage(relId,`Photo ${p.number}`,cx,cy)+wParagraph(`Photo ${p.number}${p.caption?` — ${p.caption}`:p.name?` — ${p.name}`:''}`,{italic:true,align:'center',size:20,after:180});}
  return out;
}
async function exportReportDocx(){
  if(!state?.dossier?.id)return alert('Aucun dossier ouvert.');
  if(!state.dossier.missionsValidated)return alert('Export Word bloqué : compare d’abord les missions au dispositif original puis clique sur « Valider la liste des missions ».');
  const btn=$("wordExportBtn"),old=btn.textContent;btn.disabled=true;btn.textContent='Génération Word…';
  try{
    persist('Export Word');const {byPlacement,images,rels}=await collectDocxPhotos();let body='';
    normalizeDossierMeta(state);const meta=state.dossier.reportMeta;body+=wParagraph('DOCUMENT DE TRAVAIL — V2.5.1',{align:'center',size:18,color:'B08A3E',after:600});
    body+=wParagraph(meta.reportType||'RAPPORT DÉFINITIF',{align:'center',bold:true,size:34,color:'173A59',after:260});
    body+=wParagraph(state.dossier.title||'Dossier d’expertise',{align:'center',size:26,after:1000});
    body+=wParagraph('Sommaire',{bold:true,size:28,color:'173A59',after:220});body+=wParagraph('1. Les parties',{after:120})+wParagraph('2. Mission de l’expert',{after:120})+wParagraph('3. Historique des opérations',{after:120})+wParagraph('4. Développements – chefs de mission',{after:120})+wParagraph('Annexes / pièces / dires',{after:120});body+=wPageBreak();body+=wParagraph('1. Les parties',{style:'Heading1',after:180})+wParagraph('Demandeur(s) :\n'+(meta.demandeurs||'À compléter.'),{after:120})+wParagraph('Défendeur(s) :\n'+(meta.defendeurs||'À compléter.'),{after:180});body+=wParagraph('2. Mission de l’expert',{style:'Heading1',after:180});state.missions.forEach((m,i)=>body+=wParagraph(`${i+1}. ${m.text||''}${m.sourcePage?' (ordonnance p.'+m.sourcePage+')':''}`,{after:120}));body+=wParagraph('3. Historique des opérations',{style:'Heading1',after:180});const hist=reportHistoryItems();if(!hist.length)body+=wParagraph('Aucune opération enregistrée.',{italic:true});else hist.forEach(x=>body+=wBullet(`${x.date||'Date à définir'} — ${x.text}`));body+=docxPhotoBlocks(byPlacement.operations);body+=wParagraph('4. Développements – chefs de mission',{style:'Heading1',after:180});
    state.missions.forEach((m,i)=>{body+=wParagraph(`${i+1}. ${m.text||''}`,{style:'Heading2',after:120});const iv=m.intervention||blankIntervention();if(iv.role!=='Expert'||iv.identity||iv.object)body+=wParagraph(`Concours / intervenant : ${iv.role||'Expert'}${iv.identity?' — '+iv.identity:''}${iv.specialty?' ('+iv.specialty+')':''}${iv.object?'\n'+iv.object:''}`,{italic:true,after:100});body+=wParagraph(m.response||'Réponse à rédiger.',{italic:!m.response,after:180})+docxPhotoBlocks(byPlacement[`mission:${m.id}`]);});
    body+=wParagraph('Annexes / pièces / dires',{style:'Heading1',after:180});if(!state.annexMeta.length)body+=wParagraph('Aucune annexe.',{italic:true});else state.annexMeta.forEach((a,i)=>body+=wBullet(`Annexe A${String(i+1).padStart(2,'0')} — ${a.name||''}${a.description?' — '+a.description:''}`));body+=docxPhotoBlocks(byPlacement.annexes);
    body+=wParagraph('Aperçu de préparation uniquement. La forme, les visas, le contradictoire, la discussion technique, les dires et les conclusions devront être finalisés par l’expert.',{italic:true,size:18,color:'665F54',after:0});
    const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="180"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="173A59"/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="173A59"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`;
    const relXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map(r=>`<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`).join('')}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const types=[...new Set(images.map(x=>x.ext))].map(ext=>`<Default Extension="${ext}" ContentType="image/png"/>`).join('');
    const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${types}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
    const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const entries=[{name:'[Content_Types].xml',data:contentTypes},{name:'_rels/.rels',data:rootRels},{name:'word/document.xml',data:documentXml},{name:'word/styles.xml',data:styles},{name:'word/_rels/document.xml.rels',data:relXml},...images];
    const zip=makeZip(entries),blob=new Blob([zip],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeFileName(state.dossier.title||'rapport-expertise')}.docx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){console.error(e);alert(`Export Word impossible : ${e.message||e}`);}finally{btn.disabled=false;btn.textContent=old;}
}
function nl2br(v){return escapeHtml(v).replace(/\n/g,"<br>");}
async function buildPreviewPhotoMap(){
  previewObjectUrls.forEach(URL.revokeObjectURL);previewObjectUrls=[];
  normalizePhotoPlacements(state);
  const map={};
  for(const p of state.photoMeta.slice().sort((a,b)=>a.number-b.number)){
    if(!p.placement||p.placement==="unplaced")continue;
    const rec=await dbGet(p.id);
    let src="";
    if(rec?.blob){src=URL.createObjectURL(rec.blob);previewObjectUrls.push(src);}
    if(!map[p.placement])map[p.placement]=[];
    map[p.placement].push({p,src});
  }
  return map;
}
function previewPhotosHtml(items=[]){
  if(!items.length)return "";
  return `<div class="report-photo-group">${items.map(({p,src})=>`<figure class="report-photo">${src?`<img src="${src}" alt="Photo ${p.number}">`:'<div class="report-photo-missing">Photo indisponible</div>'}<figcaption><strong>Photo ${p.number}</strong>${p.caption?` — ${escapeHtml(p.caption)}`:p.name?` — ${escapeHtml(p.name)}`:""}</figcaption></figure>`).join("")}</div>`;
}
function reportHistoryItems(){
  const rows=[];
  for(const e of (state.contradictoire||[]))rows.push({date:e.date||'',text:`${e.type||'Événement'}${e.destinataires?' — '+e.destinataires:''}${e.mode?' — '+e.mode:''}${e.details?' — '+e.details:''}${e.response?' — Suite / réponse : '+e.response:''}`});
  for(const o of (state.operations||[]))rows.push({date:o.date||'',text:`${o.type||'Opération'} — ${o.title||''}${o.notes?' — '+o.notes:''}`});
  return rows.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
}
function reportPartiesHtml(){normalizeDossierMeta(state);const m=state.dossier.reportMeta;return `<p><strong>Demandeur(s)</strong><br>${m.demandeurs?nl2br(m.demandeurs):'<em>À compléter.</em>'}</p><p><strong>Défendeur(s)</strong><br>${m.defendeurs?nl2br(m.defendeurs):'<em>À compléter.</em>'}</p>`;}
async function renderPreview(){
  const photoMap=await buildPreviewPhotoMap();normalizeDossierMeta(state);const meta=state.dossier.reportMeta;
  const answers=state.missions.map((m,i)=>{const iv=m.intervention||blankIntervention();const concours=(iv.role!=="Expert"||iv.identity||iv.object)?`<div class="preview-intervention"><strong>Concours / intervenant :</strong> ${escapeHtml(iv.role)}${iv.identity?" — "+escapeHtml(iv.identity):""}${iv.specialty?" ("+escapeHtml(iv.specialty)+")":""}${iv.object?`<br>${escapeHtml(iv.object)}`:""}</div>`:"";return `<section><h3>${i+1}. ${escapeHtml(m.text)}${m.sourcePage?` <small>— ordonnance p.${m.sourcePage}</small>`:''}</h3>${concours}<p>${m.response?nl2br(m.response):'<em>Développement / réponse à rédiger.</em>'}</p>${previewPhotosHtml(photoMap[`mission:${m.id}`])}</section>`}).join("");
  const history=reportHistoryItems().map(x=>`<li><b>${escapeHtml(x.date||'Date à définir')}</b> — ${escapeHtml(x.text)}</li>`).join('')||'<li><em>Aucune opération enregistrée.</em></li>';
  const annexes=state.annexMeta.map((a,i)=>`<li>Annexe A${String(i+1).padStart(2,"0")} — ${escapeHtml(a.name)}${a.description?` — ${escapeHtml(a.description)}`:""}</li>`).join("")||"<li><em>Aucune annexe.</em></li>";
  $("reportPreview").innerHTML=`<section class="report-cover report-cover-v251"><div class="cover-meta"><strong>${escapeHtml(meta.juridiction||'JURIDICTION À COMPLÉTER')}</strong><span>${escapeHtml(meta.affaire||state.dossier.title||'Affaire à compléter')}</span><span>${meta.rg?'RG '+escapeHtml(meta.rg):'RG à compléter'}</span></div><div class="cover-main"><h1>${escapeHtml(meta.reportType||'RAPPORT DÉFINITIF')}</h1></div><div class="cover-footer">${escapeHtml(meta.expert||'Expert judiciaire — identité à compléter')}${meta.reportDate?' · '+escapeHtml(meta.reportDate):''}</div></section>
  <section class="report-toc-page"><h2>SOMMAIRE</h2><div class="toc-line"><span>1. LES PARTIES</span></div><div class="toc-line"><span>2. MISSION DE L’EXPERT</span></div><div class="toc-line"><span>3. HISTORIQUE DES OPÉRATIONS</span></div><div class="toc-line"><span>4. DÉVELOPPEMENTS – CHEFS DE MISSION</span></div><div class="toc-line"><span>ANNEXES / PIÈCES / DIRES</span></div></section>
  <div class="report-body"><h2>1. Les parties</h2>${reportPartiesHtml()}<h2>2. Mission de l’expert</h2>${state.missions.map((m,i)=>`<p><strong>${i+1}.</strong> ${escapeHtml(m.text)}${m.sourcePage?` <small>(ordonnance p.${m.sourcePage})</small>`:''}</p>`).join('')}<h2>3. Historique des opérations</h2><ol>${history}</ol>${previewPhotosHtml(photoMap.operations)}<h2>4. Développements – chefs de mission</h2>${answers}<h2>Annexes / pièces / dires</h2><ol>${annexes}</ol>${previewPhotosHtml(photoMap.annexes)}<div class="preview-note">Document de travail construit à partir des données validées par l’expert. L’ordonnance originale demeure la référence.</div></div>`;
}

function renderSummary(){normalizeDossierMeta(state);const facts=state.dossier.extractedFacts||[];const meta=state.dossier.reportMeta;const el=$("factsGrid");if(el)el.innerHTML=facts.length?facts.map(f=>`<article class="fact-card"><span>${escapeHtml(f.label)}</span><strong>${escapeHtml(f.value)}</strong><small>${f.page?`Ordonnance p.${f.page} · `:''}À contrôler sur l’original</small></article>`).join(''):'<div class="empty-zone">Aucune information structurée extraite avec une fiabilité suffisante.</div>';const ctl=$("controlsList");if(ctl)ctl.innerHTML=(state.vigilances||'').split('\n').filter(Boolean).map(x=>`<li>${escapeHtml(x.replace(/^•\s*/,''))}</li>`).join('');for(const input of document.querySelectorAll('[data-report-meta]'))input.value=meta[input.dataset.reportMeta]||'';bindReportMeta();}
function renderOcrDiagnostic(){
  const box=$("ocrDiagnostic");if(!box)return;const rows=state?.dossier?.ocrDiagnostic||[];
  if(!rows.length){box.innerHTML='<div class="empty-zone">Aucun diagnostic PDF/OCR enregistré pour ce dossier.</div>';return;}
  box.innerHTML=rows.map(p=>`<details class="ocr-page"><summary>Page ${p.page} · ${escapeHtml(p.source||'lecture')} · confiance ${escapeHtml(p.confidence||'indéterminée')}${p.ocrConfidence!=null?` (${Math.round(p.ocrConfidence)}%)`:''}</summary><pre>${escapeHtml(p.text||'')}</pre></details>`).join('');
}
function downloadOcrDiagnostic(){
  const rows=state?.dossier?.ocrDiagnostic||[];if(!rows.length)return alert("Aucun texte PDF/OCR enregistré pour ce dossier.");
  const head=`ASSISTANT EXPERT JUDICIAIRE — Version moteur V2.5.4\n${state.dossier.ordonnanceName||state.dossier.title||''}\n\n`;
  const body=rows.map(p=>`===== PAGE ${p.page} | source=${p.source||''} | confiance=${p.confidence||''}${p.ocrConfidence!=null?` | OCR=${p.ocrConfidence}%`:''} =====\n${p.text||''}`).join('\n\n');
  const blob=new Blob([head+body],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeFileName(state.dossier.title||'ordonnance')}-diagnostic-v254.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderAll(){
  normalizeDossierMeta(state);renderSummary();renderOcrDiagnostic();
  if($("dispositifVerbatim")) $("dispositifVerbatim").textContent=state.dossier.dispositifVerbatim||"Dispositif non disponible : consulter le PDF original.";
  if($("missionCheck")){const mc=state.dossier.missionCheck;$("missionCheck").textContent=!mc?"Aucun contrôle automatique disponible — comparer manuellement au dispositif.":mc.complete?`Contrôle automatique : ${mc.extractedCount} élément(s) structuré(s) extrait(s). Validation par l’expert obligatoire.`:`⚠ Extraction potentiellement incomplète : ${mc.extractedCount} extrait(s) / ${mc.candidateCount||"nombre indéterminé"} élément(s) repéré(s). Comparaison au dispositif obligatoire.`;}
  if($("missionValidationState"))$("missionValidationState").textContent=state.dossier.missionsValidated?`✓ Liste validée par l’expert le ${fmtDateTime(state.dossier.missionsValidatedAt)}`:"⚠ Liste non validée : export Word bloqué."; 
  if($("resumeSource")){
    const a=state.dossier.analysis;
    $("resumeSource").textContent=a?.error
      ? "Lecture locale incomplète — texte de travail à compléter et valider par l’expert."
      : a?.mode==="pdfjs-ocr"
        ? `PDF scanné · OCR local effectué${a.pages?` · ${a.pages} page${a.pages>1?"s":""}`:""}. Préremplissage à contrôler et valider par l’expert.`
        : a?.mode==="pdfjs-hybride" ? `Lecture hybride page par page · PDF.js + OCR local ciblé${a.pages?` · ${a.pages} page${a.pages>1?"s":""}`:""}. Préremplissage à contrôler.`
        : a?.mode==="pdfjs-text"
          ? `Couche texte lue avec PDF.js${a.pages?` · ${a.pages} page${a.pages>1?"s":""}`:""}. Préremplissage à contrôler et valider par l’expert.`
        : "Texte de travail à relire et valider par l’expert.";
  }
  renderMission();renderResponses();renderAnnexes();renderContradictoire();renderOperations();renderTasks();renderPreview();renderPhotos();
}

async function requestPersistentStorage(){try{if(navigator.storage?.persist){const granted=await navigator.storage.persist();const el=$("storageState");if(el)el.textContent=granted?"Stockage persistant accordé par le navigateur.":"Stockage persistant non garanti : conserve des sauvegardes régulières.";}}catch(e){console.warn("Stockage persistant",e);}}
requestPersistentStorage();

// Etat accueil / multi-dossiers V2.5
const initialIndex=migrateLegacy(); if(initialIndex.currentId)state=loadDossier(initialIndex.currentId); if(!state)state=blankState(); currentId=state.dossier.id;
renderDossierList();
async function initPwaV25(){
  if(!("serviceWorker" in navigator)||!location.protocol.startsWith("http"))return;
  try{await navigator.serviceWorker.register("service-worker.js");await navigator.serviceWorker.ready;}catch(err){console.warn("PWA V2.5",err);}
}
initPwaV25();

if($("downloadOcrDiagnostic"))$("downloadOcrDiagnostic").onclick=downloadOcrDiagnostic;
