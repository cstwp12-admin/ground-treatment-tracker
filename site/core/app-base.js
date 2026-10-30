"use strict";
const BRAND="Project Tools",VERSION="0.15.0-pages-test";
const STAGES={
  "R&R":[["Setting-out, OGL survey & MP test",.05],["Removal depth confirmed",.05],["Excavation & disposal of USM",.20],["Formation joint inspection / depth verified",.05],["Separator / basal geotextile laid",.10],["Instrumentation installed",.05],["Backfill suitable material to OGL",.20],["Embankment fill to formation / subgrade",.20],["Surcharge placed",.05],["Rest period complete & surcharge removed",.05]],
  "PVD":[["Setting-out, MP test, CBH & shop drawing approval",.05],["Working platform",.10],["Separator geotextile",.05],["Sand / drainage blanket & horizontal drains",.10],["PVD installation after trial approval",.20],["Basal reinforcement",.05],["Instrumentation installed",.05],["Embankment fill to design level",.15],["Surcharge placed",.10],["Rest period / settlement criteria / removal",.15]],
  "Piled Embankment":[["Setting-out & slab-coordinate shop drawing",.05],["USM excavation & working platform",.10],["Test piles & load test accepted",.10],["Working piles installed",.35],["Pile cut-off & head preparation",.05],["Lean concrete blinding",.05],["RC pile embankment slab cast",.20],["Fill / RS wall over slab",.10]]
};
STAGES["Surcharge (PVD omitted)"]=STAGES.PVD;STAGES["R&R + SC"]=STAGES["R&R"];
const RATINGS=[[0,"0% · Not started"],[.25,"25% · Started"],[.5,"50% · About half"],[.75,"75% · Mostly done"],[1,"100% · Complete / accepted"],["NA","N/A · Not required"]];
const STATUSES=["Not Started","Pre-construction","In Progress","On Hold","Suspended","Under Review","Completed","Omitted","Not Required"];
const EXCLUDED=["Omitted","Under Review","Not Required"];
const STATUS_COLOR={"In Progress":"#c2410c","Pre-construction":"#c9a227","On Hold":"#a13e38","Suspended":"#a13e38","Under Review":"#495982","Completed":"#237032","Not Started":"#9aa7b0","Omitted":"#8a959e","Not Required":"#8a959e"};
const LANE=["#2b6cb0","#c05621","#2f855a","#805ad5","#b7791f","#4a6fa5"],LANE_ORDER=["R&R","PVD","Surcharge (PVD omitted)","Piled Embankment"];
const RAMP=["#bcd6dd","#8bbac7","#5a9bb0","#2d7a92","#0f4f63"];
const LANE_D=["#6aa8e6","#ea9156","#54c490","#ab94f2","#dcaa4a","#7e9fd6"],RAMP_D=["#35566a","#3b7d98","#4aa3c2","#7ccbe3","#c4eefa"];
let lightMode=false,printing0=false,theme=(()=>{try{return localStorage.getItem("gt-theme")||"auto"}catch(e){return "auto"}})();
const prefDark=()=>{try{return matchMedia("(prefers-color-scheme: dark)").matches}catch(e){return false}};
const isDark=()=>!lightMode&&!printing0&&(theme==="dark"||(theme==="auto"&&prefDark()));
const rampC=()=>isDark()?RAMP_D:RAMP;
function applyTheme(){document.documentElement.setAttribute("data-theme",isDark()?"dark":"light");const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=isDark()?"#0c171d":"#0b3b4f"}
const ZC=["#c2410c","#28758a","#57844a","#845c99","#a1722a","#4a6fa5"];
const EMBED=(()=>{try{const el=document.getElementById("briefing-data");return el?JSON.parse(el.textContent):null}catch(e){return null}})();
const viewer=!!EMBED||/[?&]view=sor\b/.test(location.search);

/* ---------- storage ---------- */
// Storage, serialization and legacy migration are installed by core/workspace-ui.js.
let loadSaved,payload,persist;

/* ---------- state ---------- */
function blankState(){return{records:[],snapshots:[],audit:[],meta:{},instruments:[],rfits:[],memos:[],map:null,templates:null,outbox:[],inbox:[],processed:[],decisionQueue:[],lastExportAt:""}}
let state=blankState(),page="Briefing",selected="",selectedTab="Progress",filterZone="All zones",search="",ready=false,notice="",busy=false,editBase="",colorBy="treat",mapView=null,regTab="RFIT",regSearch="",regOpen=false,instType="All",instStatus="All",instSearch="",instGt=true,prevPage="Segments";
const app=document.getElementById("app");
const todayISO=()=>GTWorkspace.projectDate();
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
const fmt=n=>new Intl.NumberFormat().format(Math.round(n));
function chain(n){const v=Math.max(0,Math.round(Number(n)||0));return "CH "+Math.floor(v/1000)+"+"+String(v%1000).padStart(3,"0")}
const pct=n=>n==null?"—":Math.round(n*100)+"%";
const pct1=n=>n==null?"—":(n*100).toFixed(1)+"%";
function mv(x){if(x==null||!isFinite(x))return "n/a";const v=Math.round(x*1000)/10;return (v>0?"+":"")+v.toFixed(1)+" pp"}
function fmtDate(iso){if(!iso)return "—";const d=new Date(String(iso).slice(0,10)+"T00:00:00");return isNaN(d)?esc(iso):d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
const monthLabel=iso=>{const d=new Date(String(iso).slice(0,10)+"T00:00:00");return isNaN(d)?"":d.toLocaleDateString("en-GB",{month:"long",year:"numeric"})};
const cutoff=()=>state.meta.cutoff||todayISO();
const projectName=()=>state.meta.projectName||(state.meta.projectLine?String(state.meta.projectLine).split("|")[0].trim():"");
const byId=id=>state.records.find(r=>r.id===id)||state.records.find(r=>r.previousIds?.includes(id));
const rl=v=>v==null?"—":v==="NA"?"N/A":Math.round(Number(v)*100)+"%";
const sameRating=(a,b)=>String(a)===String(b)||(a!=="NA"&&b!=="NA"&&Math.abs(Number(a)-Number(b))<1e-9);
let entrySeg='',entryQuery='',entryZone='All zones',revTab='pending';
const uid=()=>GTWorkspace.uuid();
const RVALS=[0,.25,.5,.75,1,'NA'];
const INST_OPTS=['Installed','Drilled','Replaced','Not installed','Not drilled','Damaged','To verify'];

function tplStages(type){const T=state.templates&&state.templates[type];if(T&&T.length)return T.map(s=>({name:s.name,weight:s.weight}));return (STAGES[type]||STAGES["R&R"]).map(s=>({name:s[0],weight:s[1]}))}
function stageTemplate(type){return tplStages(type).map((s,i)=>({id:"s"+(i+1),name:s.name,weight:s.weight,rating:0,...(((["R&R","R&R + SC"].includes(type)&&i===5||["PVD","Surcharge (PVD omitted)"].includes(type)&&i===6)&&s.name===STAGES[type]?.[i]?.[0])?{purpose:"instrumentation-installation"}:{})}))}
function normalizeRecord(r){
  r.internalId=r.internalId||GTWorkspace.uuid();r.revision=r.revision||1;
  r.from=Number(r.from)||0;r.to=Number(r.to)||0;r.zone=r.zone||"Zone 1";r.status=r.status||"Not Started";r.type=r.type||"R&R";
  for(const k of["activity","next","issue"])if(r[k]==null)r[k]="";
  if(!Array.isArray(r.stages)||!r.stages.length)r.stages=tplStages(r.type).map((s,i)=>({id:"s"+(i+1),name:s.name,weight:s.weight,rating:(r.ratings||[])[i]??0}));
  else r.stages=r.stages.map((s,i)=>Array.isArray(s)?{id:"s"+(i+1),name:s[0],weight:s[1],rating:(r.ratings||[])[i]??0}:{...s,id:s.id||"s"+(i+1),name:String(s.name||"Stage "+(i+1)),weight:Number(s.weight)||0,rating:s.rating==null?((r.ratings||[])[i]??0):s.rating});
  delete r.ratings;return r;
}
function loadViewState(o){const base=blankState();state={...base,...o};state.meta=state.meta||{};state.records=(state.records||[]).map(r=>normalizeRecord({...r}));for(const k of["snapshots","audit","instruments","rfits","memos","outbox","inbox","processed","decisionQueue"])if(!Array.isArray(state[k]))state[k]=[];selected=state.records[0]?state.records[0].id:"";GEO=null}

/* ---------- calculations ---------- */
function progress(r){return GTCalculations.progress(r)}
const len=r=>GTCalculations.length(r);
function wavg(rs,get){return GTCalculations.weightedAverage(rs,get)}
const rollupLength=rs=>wavg(rs,progress);
const totalLength=rs=>rs.reduce((s,r)=>s+len(r),0);
const activeLength=rs=>rs.filter(r=>progress(r)!=null).reduce((s,r)=>s+len(r),0);
function prevSnap(){const ms=cutoff().slice(0,7)+"-01";const c=state.snapshots.filter(s=>s.segments&&String(s.date).slice(0,10)<ms).sort((a,b)=>String(a.date)<String(b.date)?-1:1);return c.length?c[c.length-1]:null}
function moveSeg(r){const s=prevSnap(),c=progress(r);if(!s||c==null||s.segments[r.id]==null)return null;return c-s.segments[r.id]}
function moveGroup(rs){const s=prevSnap();if(!s)return null;const both=rs.filter(r=>progress(r)!=null&&s.segments[r.id]!=null);if(!both.length)return null;return wavg(both,progress)-wavg(both,r=>s.segments[r.id])}
function zones(){return [...new Set(state.records.map(r=>r.zone))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))}
const zc=z=>ZC[Math.max(0,zones().indexOf(z))%ZC.length];
const cats=()=>[...new Set(state.records.map(r=>r.type))];
const laneTypes=()=>{const t=cats();return [...LANE_ORDER.filter(x=>t.includes(x)),...t.filter(x=>!LANE_ORDER.includes(x))]};
const laneCol=t=>(isDark()?LANE_D:LANE)[Math.max(0,laneTypes().indexOf(t))%LANE.length];
const isOpenRfit=x=>/^open/i.test(x.status||"");
const isOpenMemo=x=>/open|partly/i.test(x.status||"")&&!/closed|superseded/i.test(x.status||"");
function instrCat(st){st=String(st||"");return /^(installed|replaced|drilled)/i.test(st)?"done":/damaged|not installed|not drilled/i.test(st)?"missing":/not required/i.test(st)?"na":"verify"}
function instrSummary(list){const o={};for(const i of list){const t=i.type||"?";o[t]=o[t]||{total:0,done:0,verify:0,missing:0,na:0};o[t].total++;o[t][instrumentCategory(i)]++}return o}
function instrTotals(list){const t={total:0,done:0,verify:0,missing:0,na:0};for(const i of list){t.total++;t[instrumentCategory(i)]++}return t}
const gtInstr=()=>state.instruments.filter(i=>/^GT-/i.test(i.segment));
function segInstr(id){return state.instruments.filter(i=>i.segment===id)}
function segRfits(id){return state.rfits.filter(x=>(x.segments||[]).includes(id))}
function segMemos(id){return state.memos.filter(x=>(x.segments||[]).includes(id))}

/* ---------- alignment geometry ---------- */
let GEO=null;
/* ---------- alignment map ---------- */
let basemap='none',mapFull=false;
function geo(){
  const m=state.map;if(!m||!m.pts||m.pts.length<2)return null;if(GEO&&GEO.src===m)return GEO;
  const lat0=m.pts[0][2],lon0=m.pts[0][1],k=Math.cos(lat0*Math.PI/180);
  const proj=(lon,lat)=>({x:(lon-lon0)*111320*k,y:-(lat-lat0)*110574});
  const P=m.pts.map(([ch,lon,lat])=>({ch,...proj(lon,lat)}));
  const xs=P.map(p=>p.x),ys=P.map(p=>p.y);
  GEO={src:m,P,lat0,lon0,k,marks:(m.marks||[]).map(b=>({name:b.name,...proj(b.lon,b.lat)})),minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),first:P[0].ch,last:P[P.length-1].ch};return GEO;
}
const unproj=(x,y)=>{const G=geo();return{lon:G.lon0+x/(111320*G.k),lat:G.lat0-y/110574}};
const proj2=(lon,lat)=>{const G=geo();return{x:(lon-G.lon0)*111320*G.k,y:-(lat-G.lat0)*110574}};
function tilesSvg(){return "";}
function segColor(r,mode){
  if(mode==="treat")return laneCol(r.type);
  if(mode==="status")return STATUS_COLOR[r.status]||"#8a959e";if(mode==="zone")return zc(r.zone);
  const p=progress(r);if(p==null)return isDark()?"#4a5d69":"#c9d1d7";const R=rampC();return R[Math.min(4,Math.floor(p*5-1e-9<0?0:p*5-1e-9))]}
function mapLegend(mode){
  let items;
  if(mode==="treat")items=laneTypes().map(t=>[laneCol(t),t]);
  else if(mode==="status")items=Object.entries(STATUS_COLOR).filter(([k])=>state.records.some(r=>r.status===k)).map(([k,c])=>[c,k]);
  else if(mode==="zone")items=zones().map(z=>[zc(z),z]);
  else items=[...rampC().map((c,i)=>[c,i===0?"0–20%":i===4?"80–100%":(i*20)+"–"+((i+1)*20)+"%"]),[isDark()?"#4a5d69":"#c9d1d7","Not counted"]];
  return `<div class="maplegend">${items.map(([c,t])=>`<span><i style="background:${c}"></i>${esc(t)}</span>`).join("")}${mode==="treat"?`<span><i class="pale"></i>Remaining along the segment</span>`:""}<span><i class="sq"></i>Bridge</span></div>`;
}
function mapSvg(o){
  const G=geo();if(!G)return "";const vb=o.view,fs=vb.w/(o.small?38:68),mode=o.colorBy||"treat",f=p=>p.x.toFixed(1)+" "+p.y.toFixed(1);
  const labelsOn=o.labels!==false&&(o.labels||vb.w<3400);
  let s=`<svg class="map${o.interactive?" interactive":""}" ${o.interactive?"data-map=\"1\"":""} viewBox="${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Alignment map with ground treatment segments">`;
  if(o.basemap&&basemap!=="none")s+=tilesSvg(vb,o.pxw);
  const line=`M${G.P.map(f).join(" L")}`;
  s+=`<path class="road-case" d="${line}"/><path class="road" d="${line}"/><path class="road-mid" d="${line}"/>`;
  if(!o.small){
    const step=vb.w<3500?100:vb.w<9000?500:1000;
    for(let ch=Math.ceil(G.first/step)*step;ch<=G.last;ch+=step){const p=xyAt(ch),km=ch%1000===0,lab=km||(step<=500&&ch%500===0)||(step===100&&ch%100===0&&vb.w<1400);
      s+=`<circle class="tick${km?" km":""}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(vb.w/(km?330:600)).toFixed(1)}"/>`;
      if(lab&&vb.w<30000)s+=`<text class="kmlbl${km?" km":""}" x="${(p.x+fs*.7).toFixed(1)}" y="${(p.y+fs*1.05).toFixed(1)}" font-size="${(fs*(km?.85:.7)).toFixed(1)}">${km?ch/1000+"+000":chS(ch)}</text>`}
  }
  const list=(o.only?state.records.filter(r=>o.only.includes(r.id)):state.records).filter(r=>!(r.to<G.first||r.from>G.last)).sort((a,b)=>a.from-b.from);
  const lbl=[];
  list.forEach((r,idx)=>{
    const d=pathBetween(r.from,r.to),sel=r.id===o.selected,p=progress(r),col=segColor(r,mode);
    if(sel)s+=`<path class="seg-sel" d="${d}"/>`;
    s+=`<path class="seg-halo" d="${d}"/>`;
    if(mode==="treat"&&p!=null){
      s+=`<path class="seg pale" d="${d}" stroke="${col}"/>`;
      if(p>0.004)s+=`<path class="seg" d="${pathBetween(r.from,r.from+(r.to-r.from)*p)}" stroke="${col}"/>`;
    }else s+=`<path class="seg${p==null?" nc":""}" d="${d}" stroke="${col}"${p==null?" stroke-dasharray=\"2 5\"":""}/>`;
    if(o.interactive)s+=`<path class="hit" d="${d}" data-segment="${esc(r.id)}" data-tip="${esc(r.id)}"/>`;
    if((labelsOn&&!o.small)||sel||(o.small&&o.labels))lbl.push({r,idx,p});
  });
  for(const {r,idx,p} of lbl){
    const mid=(r.from+r.to)/2,a=xyAt(mid-6),b=xyAt(mid+6),m=xyAt(mid);let nx=-(b.y-a.y),ny=(b.x-a.x);const nl=Math.hypot(nx,ny)||1;nx/=nl;ny/=nl;if(ny>0){nx=-nx;ny=-ny}
    const sign=idx%2?1:-1,off=fs*2.1,lx=m.x+nx*off*sign,ly=m.y+ny*off*sign,txt=r.id+(p==null?"":" "+Math.round(p*100)+"%"),w=txt.length*fs*.56+fs*.9;
    s+=`<path class="leader" d="M${m.x.toFixed(1)} ${m.y.toFixed(1)} L${lx.toFixed(1)} ${ly.toFixed(1)}"/><g class="lblchip"><rect x="${(lx-w/2).toFixed(1)}" y="${(ly-fs*.9).toFixed(1)}" width="${w.toFixed(1)}" height="${(fs*1.5).toFixed(1)}" rx="${(fs*.3).toFixed(1)}"/><text x="${lx.toFixed(1)}" y="${(ly+fs*.25).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}">${esc(txt)}</text></g>`;
  }
  if(!o.small&&!o.noZones&&vb.w>3400){
    for(const z of zones()){const rs=state.records.filter(r=>r.zone===z&&!(r.to<G.first||r.from>G.last));if(!rs.length)continue;const mid=(Math.min(...rs.map(r=>r.from))+Math.max(...rs.map(r=>r.to)))/2,m=xyAt(mid),txt=z+"  "+pct1(rollupLength(state.records.filter(r=>r.zone===z))),w=txt.length*fs*.56+fs;
      s+=`<g class="zonechip"><rect x="${(m.x-w/2-fs*2.6).toFixed(1)}" y="${(m.y-fs*3.1).toFixed(1)}" width="${w.toFixed(1)}" height="${(fs*1.7).toFixed(1)}" rx="${(fs*.3).toFixed(1)}" style="fill:${zc(z)}"/><text x="${(m.x-fs*2.6).toFixed(1)}" y="${(m.y-fs*1.95).toFixed(1)}" text-anchor="middle" font-size="${(fs*.95).toFixed(1)}">${esc(txt)}</text></g>`}
  }
  if(!o.small||vb.w<9000)for(const b of G.marks){const nm=b.name.replace(/\s*\d\/\d$/,"");s+=`<g class="brg"><rect x="${(b.x-fs*.45).toFixed(1)}" y="${(b.y-fs*.45).toFixed(1)}" width="${(fs*.9).toFixed(1)}" height="${(fs*.9).toFixed(1)}"/></g><text class="brglbl" x="${(b.x+fs*.8).toFixed(1)}" y="${(b.y+fs*.35).toFixed(1)}" font-size="${(fs*.85).toFixed(1)}">${esc(nm)}</text>`}
  return s+"</svg>";
}
function mapOverlay(){const T=TILES[basemap];return `<div class="mapov"><div class="north" aria-label="North is up"><svg viewBox="0 0 24 30" width="22" height="28"><path d="M12 1 L20 24 L12 19 L4 24 Z"/></svg><span>N</span></div><div class="scalebar"><i data-scale></i><span data-scale-t></span></div>${T&&basemap!=="none"?`<div class="attr">${esc(T.attr)}</div>`:""}<div class="maptip" hidden></div></div>`}
function updateScale(){
  const box=app.querySelector("[data-mapbox]"),svg=box&&box.querySelector("svg.map");if(!svg||!mapView)return;
  const r=svg.getBoundingClientRect(),sc=Math.max(mapView.w/r.width,mapView.h/r.height),want=sc*110,steps=[5,10,20,50,100,200,500,1000,2000,5000,10000,20000],L=steps.find(x=>x>=want*.6)||steps[steps.length-1],i=box.querySelector("[data-scale]"),t=box.querySelector("[data-scale-t]");
  if(i){i.style.width=(L/sc)+"px";t.textContent=L>=1000?(L/1000)+" km":L+" m"}
}
function mapBoxHtml(){return mapSvg({view:mapView,selected,colorBy,interactive:true,basemap:true,pxw:app.querySelector("[data-mapbox]")?.clientWidth||900})+mapOverlay()}
function mapControls(){return `<div class="mapctl"><div class="ctlgrp"><label class="field inline">Colour by<select class="control" data-input="colorBy">${[["treat","Treatment type"],["progress","Progress"],["status","Status"],["zone","Zone"]].map(([v,l])=>`<option value="${v}" ${colorBy===v?"selected":""}>${l}</option>`).join("")}</select></label><span class="ui-pill">Local alignment · offline</span></div><div class="btnrow"><button class="btn small" data-map="in" aria-label="Zoom in">＋</button><button class="btn small" data-map="out" aria-label="Zoom out">－</button><button class="btn small" data-map="fit">Fit all</button>${zones().map(z=>`<button class="btn small" data-map-zone="${esc(z)}">${esc(z.replace("Zone ","Z"))}</button>`).join("")}${selected?`<button class="btn small" data-map="sel">Selected</button>`:""}<button class="btn small" data-map="full">${mapFull?"Close":"Full screen"}</button></div></div>`}
function mapEmpty(){return `<div class="empty">No alignment loaded. ${viewer?"":"Use <strong>Data → Load alignment (KML)</strong> to draw the road alignment and segments on a map. "}The chainage strip is shown instead.</div>${chainageMap(state.records)}`}
function miniMap(r){const G=geo();if(!G)return "";const view=fitBox([xyAt(r.from),xyAt(r.to)],.9,1800);return `<div class="mapbox mini">${mapSvg({view,selected:r.id,colorBy:"treat",small:true,labels:false})}</div>`}
function mapPage(){
  const G=geo();
  if(!mapView&&G)mapView=fitAll();
  const r=byId(selected);
  return `${head("Alignment","Map",G?"Drag to pan, scroll or use the buttons to zoom, point at a segment for details, click to select.":"No alignment loaded","")}<div class="layout"><section class="card mapwrap${mapFull?" fullscreen":""}">${G?`${mapControls()}<div class="mapbox big" data-mapbox>${mapBoxHtml()}</div>${mapLegend(colorBy)}`:mapEmpty()}</section>${mapFull?"":segmentDetails(r)}</div>`;
}
function redrawMap(){const box=app.querySelector("[data-mapbox]");if(box){box.innerHTML=mapBoxHtml();updateScale()}}
function zoomMap(f,cx,cy){const svg=app.querySelector("svg[data-map]");if(!svg||!mapView)return;const r=svg.getBoundingClientRect(),sc=Math.max(mapView.w/r.width,mapView.h/r.height),offX=(r.width-mapView.w/sc)/2,offY=(r.height-mapView.h/sc)/2;const px=mapView.x+((cx==null?r.left+r.width/2:cx)-r.left-offX)*sc,py=mapView.y+((cy==null?r.top+r.height/2:cy)-r.top-offY)*sc;const w=mapView.w*f;if(w<120||w>60000)return;mapView={x:px-(px-mapView.x)*f,y:py-(py-mapView.y)*f,w,h:mapView.h*f};redrawMap()}
function showTip(e){
  const box=app.querySelector("[data-mapbox]"),tip=box&&box.querySelector(".maptip");if(!tip)return;
  const hit=e.target.closest&&e.target.closest(".hit");if(!hit||drag){tip.hidden=true;return}
  const r=byId(hit.dataset.segment);if(!r){tip.hidden=true;return}
  const m=moveSeg(r),br=box.getBoundingClientRect();
  tip.innerHTML=`<strong>${esc(r.id)}</strong> ${status(r.status)}<div>${chain(r.from)} – ${chain(r.to)}, ${fmt(len(r))} m</div><div>${esc(r.type)}, <b>${pct(progress(r))}</b>${m!=null&&Math.abs(m)>.0005?" ("+mv(m)+")":""}</div>${r.activity?`<div class="muted">${esc(short(r.activity,110))}</div>`:""}`;
  tip.hidden=false;let x=e.clientX-br.left+14,y=e.clientY-br.top+14;const tw=tip.offsetWidth,th=tip.offsetHeight;if(x+tw>br.width-6)x=e.clientX-br.left-tw-14;if(y+th>br.height-6)y=e.clientY-br.top-th-14;tip.style.left=Math.max(4,x)+"px";tip.style.top=Math.max(4,y)+"px";
}

function xyAt(ch){const G=geo(),P=G.P;if(ch<=P[0].ch)return P[0];if(ch>=P[P.length-1].ch)return P[P.length-1];let lo=0,hi=P.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(P[mid].ch<=ch)lo=mid;else hi=mid}const a=P[lo],b=P[hi],t=(ch-a.ch)/((b.ch-a.ch)||1);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}}
function pathBetween(a,b){const G=geo(),pts=[xyAt(a)];for(const p of G.P)if(p.ch>a&&p.ch<b)pts.push(p);pts.push(xyAt(b));const f=p=>p.x.toFixed(1)+" "+p.y.toFixed(1);if(pts.length===2&&Math.abs(pts[0].x-pts[1].x)+Math.abs(pts[0].y-pts[1].y)<0.05)return "M"+f(pts[0])+" h0.05";return "M"+f(pts[0])+" L"+pts.slice(1).map(f).join(" L")}
const RATIO=1.3;
function fitBox(points,padFrac=.12,minW=500){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of points){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)}let w=Math.max(x1-x0,minW),h=Math.max(y1-y0,minW/RATIO);w*=1+padFrac*2;h*=1+padFrac*2;if(w/h<RATIO)w=h*RATIO;else h=w/RATIO;const cx=(x0+x1)/2,cy=(y0+y1)/2;return{x:cx-w/2,y:cy-h/2,w,h}}
function recPoints(rs){const out=[];for(const r of rs){out.push(xyAt(r.from),xyAt(r.to))}return out}
function fitAll(){const G=geo();return G?fitBox(G.P,.06):null}
/* ---------- small renderers ---------- */
function head(kicker,title,sub,action=""){return `<div class="heading"><div><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="head-actions">${action}</div></div>`}
function status(s){return `<span class="status status-${esc(String(s).toLowerCase().replace(/[^a-z]+/g,"-"))}">${esc(s)}</span>`}
const role=()=>(state.meta.user&&state.meta.user.role)||"RE";
const pendingCount=()=>state.inbox.filter(x=>x.state==="pending").length;
const outCount=()=>state.outbox.filter(x=>x.state!=="sent").length;
function chip(label,cls){return `<span class="status status-${cls}">${esc(label)}</span>`}
function bar(p,cls=""){return `<div class="bar ${cls}"><i style="width:${Math.round((p||0)*100)}%"></i></div>`}
function mvHtml(x){if(x==null||!isFinite(x))return `<span class="muted">n/a</span>`;const v=Math.round(x*1000)/10;if(v>0)return `<span class="up">▲ +${v.toFixed(1)} pp</span>`;if(v<0)return `<span class="dn">▼ ${v.toFixed(1)} pp</span>`;return `<span class="muted">no change</span>`}
const chS=n=>Math.floor(Math.round(n)/1000)+"+"+String(Math.round(n)%1000).padStart(3,"0");
const revLabel=()=>{const t=(state.meta.title||"")+" "+(state.meta.source||"");const m=t.match(/Rev\.?\s*(\d+)/i);return m?"Rev. "+m[1]:"—"};
function stageRows(r){return `<table class="table stages"><thead><tr><th>Construction stage</th><th>Weight</th><th>Done</th></tr></thead><tbody>${r.stages.map(s=>{const v=s.rating;return `<tr><td>${esc(s.name)}</td><td>${s.rating==="NA"?"—":Math.round((Number(s.weight)||0)*100)+"%"}</td><td><span class="rate ${v==="NA"?"na":""}">${rl(v)}</span>${v==="NA"?"":bar(Number(v))}</td></tr>`}).join("")}</tbody></table>`}
function segTable(list,withMove){if(!list.length)return `<div class="empty">No segments match. Try a different search or zone.</div>`;return `<div class="table-wrap"><table class="table"><thead><tr><th>Segment</th><th>Zone / chainage</th><th>Treatment</th><th>Progress</th>${withMove?"<th>Move</th>":""}<th>Status</th></tr></thead><tbody>${list.map(r=>`<tr tabindex="0" data-segment="${esc(r.id)}" class="${r.id===selected?"selected":""}"><td><strong>${esc(r.id)}</strong></td><td>${esc(r.zone)}<small>${chain(r.from)} – ${chain(r.to)}</small></td><td><i class="sw" style="background:${laneCol(r.type)}"></i>${esc(r.type)}${r.gtType&&r.gtType!==r.type&&r.gtType.length<24?`<small>${esc(r.gtType)}</small>`:""}</td><td><strong>${pct(progress(r))}</strong>${bar(progress(r))}</td>${withMove?`<td>${mvHtml(moveSeg(r))}</td>`:""}<td>${status(r.status)}</td></tr>`).join("")}</tbody></table></div>`}
function zoneRows(){return `<div class="rowhead"><span>Zone</span><span>Progress</span><span></span><span>vs previous</span></div>${zones().map(z=>{const rs=state.records.filter(r=>r.zone===z),p=rollupLength(rs),m=moveGroup(rs);return `<button class="rowbar" type="button" data-zone="${esc(z)}"><span class="lbl"><strong>${esc(z)}</strong><small>${rs.length} segments · ${fmt(activeLength(rs))} m active</small></span><span class="pct">${pct1(p)}</span>${bar(p,"long")}<span class="mvc">${mvHtml(m)}</span></button>`}).join("")}`}
function typeRows(){const rs=state.records;return `<div class="rowhead"><span>Treatment</span><span>Progress</span><span></span><span>vs previous</span></div>${laneTypes().map(t=>{const g=rs.filter(r=>r.type===t);return `<div class="rowbar"><span class="lbl"><strong><i class="sw" style="background:${laneCol(t)}"></i>${esc(t)}</strong><small>${g.length} segments · ${fmt(activeLength(g))} m active</small></span><span class="pct">${pct1(rollupLength(g))}</span>${bar(rollupLength(g),"long")}<span class="mvc">${mvHtml(moveGroup(g))}</span></div>`}).join("")}`}
function chainageMap(records){if(!records.length)return "";const min=Math.min(...records.map(r=>r.from)),max=Math.max(...records.map(r=>r.to)),span=Math.max(1,max-min);return `<div class="chainage-map">${records.map(r=>{const left=((r.from-min)/span)*100,width=((r.to-r.from)/span)*100;return `<button class="chainage-segment" type="button" data-segment="${esc(r.id)}" style="left:${left}%;width:${Math.max(width,.6)}%;background:${laneCol(r.type)}" title="${esc(r.id+" · "+r.zone+" · "+chain(r.from)+"–"+chain(r.to))}"></button>`}).join("")}<div class="chainage-axis"><span>${chain(min)}</span><span>${chain(max)}</span></div></div><div class="chainage-key">${laneTypes().map(t=>`<span><i class="zone-dot" style="background:${laneCol(t)}"></i>${esc(t)}</span>`).join("")}</div>`}
function watchList(n=8){const rank=r=>r.status==="On Hold"||r.status==="Suspended"?0:r.status==="Under Review"?1:2;return state.records.filter(r=>rank(r)<2||(r.issue&&r.issue.trim()&&r.status!=="Omitted")).sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id,undefined,{numeric:true})).slice(0,n)}
const short=(s,n=150)=>{s=String(s||"");return s.length>n?s.slice(0,n-1).trimEnd()+"…":s};
const firstSentence=(s,n=120)=>{s=String(s||"").trim();const m=s.match(/^.*?\.(\s|$)/);return short(m&&m[0].length>20?m[0].trim():s,n)};
function movers(n=8){return state.records.map(r=>({r,m:moveSeg(r)})).filter(x=>x.m!=null&&x.m>0.0005).sort((a,b)=>b.m-a.m).slice(0,n)}

/* ---------- layered diagram: one lane per treatment type, one panel per zone ---------- */
let diagZone="All zones";
function layerSvg(zone,zi,o={}){
  const rs=state.records.filter(r=>r.zone===zone).sort((a,b)=>a.from-b.from||a.to-b.to);if(!rs.length)return "";
  const types=laneTypes().filter(t=>rs.some(r=>r.type===t));
  const LW=158,PAD=14,TOP=80,LH=94,GAP=18,BH=26;
  let x=LW+PAD;const cols=[];
  rs.forEach((r,i)=>{const gap=i&&r.from>rs[i-1].to+0.5;if(gap)x+=GAP;const w=Math.round(86+Math.min(len(r),500)*.14);cols.push({r,x,w,start:i===0||gap});x+=w});
  cols.forEach((c,i)=>{c.end=i===cols.length-1||cols[i+1].start});
  const W=Math.max(x+PAD,o.W||0),H=TOP+types.length*LH+10;
  const p=rollupLength(rs),mz=moveGroup(rs),ps=prevSnap();
  let s=`<svg class="lane" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(zone)}: layered diagram of ground treatment by type. Each row is one treatment type; each box is a segment in chainage order.">`;
  s+=`<defs>${types.map((t,i)=>`<pattern id="h${zi}_${i}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="7" fill="${laneCol(t)}" opacity=".38"/></pattern>`).join("")}</defs>`;
  s+=`<rect class="lbg0" width="${W}" height="${H}"/>`;
  s+=`<text x="14" y="22" class="t-head" font-size="17">${esc(zone)}</text>`;
  s+=`<text x="${14+ (zone.length*10+14)}" y="22" class="t-head" font-size="17">${pct1(p)}</text>`;
  s+=`<text x="14" y="38" class="mute" font-size="11.5">${chS(rs[0].from)} to ${chS(rs[rs.length-1].to)} · ${rs.length} segments · ${fmt(totalLength(rs))} m${ps&&mz!=null?" · "+(mz>0.0005?"▲ +":mz<-0.0005?"▼ ":"")+(Math.round(mz*1000)/10).toFixed(1)+" pp vs "+fmtDate(ps.date):""}</text>`;
  // ruler
  const ry=TOP-12;
  s+=`<line x1="${LW}" x2="${W-PAD}" y1="${ry}" y2="${ry}" class="lax" stroke-width="1.2"/>`;
  cols.forEach((c,i)=>{
    s+=`<line x1="${c.x}" x2="${c.x}" y1="${ry-4}" y2="${H-8}" class="${c.start?"lg1":"lg2"}" stroke-width="1" ${c.start?"":"stroke-dasharray=\"2 4\""}/>`;
    s+=`<text x="${c.x+3}" y="${ry-7}" font-size="10.5" class="mute">${chS(c.r.from)}</text>`;
    if(c.end){s+=`<line x1="${c.x+c.w}" x2="${c.x+c.w}" y1="${ry-4}" y2="${H-8}" class="lg1" stroke-width="1"/><text x="${c.x+c.w-3}" y="${ry-7}" font-size="10.5" class="mute" text-anchor="end">${chS(c.r.to)}</text>`}
    if(c.end&&i<cols.length-1){const gx=c.x+c.w+GAP/2;s+=`<path d="M${gx-3} ${ry+5} L${gx+1} ${ry-5} M${gx+1} ${ry+5} L${gx+5} ${ry-5}" class="lax" stroke-width="1.2" fill="none"/>`}
  });
  // lanes
  types.forEach((t,ti)=>{
    const y0=TOP+ti*LH,col=laneCol(t),lr=rs.filter(r=>r.type===t);
    s+=`<rect x="0" y="${y0}" width="${W}" height="${LH}" class="${ti%2?"lbg0":"lbg1"}"/><rect x="0" y="${y0}" width="6" height="${LH}" fill="${col}"/>`;
    const nm=t.replace(/\s*\(/,"\u0001(").split("\u0001");
    nm.forEach((line,li)=>{s+=`<text x="16" y="${y0+30+li*16}" class="t-head" font-size="13.5">${esc(line)}</text>`});
    s+=`<text x="16" y="${y0+30+nm.length*16+2}" class="mute" font-size="11.5">${lr.length} seg · ${pct1(rollupLength(lr))}</text>`;
    cols.filter(c=>c.r.type===t).forEach(c=>{
      const r=c.r,pp=progress(r),mvv=moveSeg(r),bx=c.x+4,bw=c.w-8,by=y0+30,sel=r.id===selected&&!o.print;
      const tip=`${r.id} · ${chain(r.from)}–${chain(r.to)} · ${fmt(len(r))} m · ${r.type} · ${r.status} · ${pct(pp)}${mvv!=null&&Math.abs(mvv)>0.0005?" ("+mv(mvv)+")":""}${r.activity?" — "+short(r.activity,140):""}`;
      s+=`<g class="segg${sel?" sel":""}" data-segment="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(tip)}"><title>${esc(tip)}</title>`;
      s+=`<rect x="${c.x}" y="${y0+2}" width="${c.w}" height="${LH-4}" fill="transparent"/>`;
      s+=`<text x="${bx}" y="${y0+22}" class="t-head" font-size="13">${esc(r.id)}</text>`;
      if(pp==null){
        s+=`<rect class="outline lbg0" x="${bx}" y="${by}" width="${bw}" height="${BH}" stroke="${col}" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${bx+bw/2}" y="${by+BH/2+4}" font-size="11" text-anchor="middle" class="mute">${esc(r.status)}</text>`;
      }else{
        s+=`<text x="${bx+bw}" y="${y0+22}" class="t-head" font-size="13" text-anchor="end">${pct(pp)}</text>`;
        s+=`<rect x="${bx}" y="${by}" width="${bw}" height="${BH}" fill="url(#h${zi}_${types.indexOf(t)})"/>`;
        if(pp>0)s+=`<rect x="${bx}" y="${by}" width="${(bw*pp).toFixed(1)}" height="${BH}" fill="${col}"/>`;
        s+=`<rect class="outline" x="${bx}" y="${by}" width="${bw}" height="${BH}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
      }
      let ly=by+BH+15;
      s+=`<text x="${bx}" y="${ly}" font-size="11.5" class="mute">${fmt(len(r))} m</text>`;
      if(mvv!=null&&mvv>0.0005)s+=`<text x="${bx+bw}" y="${ly}" font-size="11.5" text-anchor="end">▲ ${(mvv*100).toFixed(1)}</text>`;
      else if(mvv!=null&&mvv<-0.0005)s+=`<text x="${bx+bw}" y="${ly}" font-size="11.5" text-anchor="end">▼ ${(-mvv*100).toFixed(1)}</text>`;
      if(r.status==="On Hold"||r.status==="Suspended")s+=`<text x="${bx}" y="${ly+14}" font-size="11.5" class="lhold">■ ${esc(r.status)}</text>`;
      s+=`</g>`;
    });
  });
  return s+`</svg>`;
}
function layerLegend(){return `<div class="lane-legend"><span><i class="done"></i>Work done</span><span><i class="rem"></i>Remaining</span><span><i class="nc"></i>Not counted (omitted, not required or under review)</span><span>▲ points moved since the previous month</span><span class="muted">Schematic: segments in chainage order, widths not to scale. // marks a gap in chainage.</span></div>`}
function layerW(zone){const rs=state.records.filter(r=>r.zone===zone).sort((a,b)=>a.from-b.from);let x=172;rs.forEach((r,i)=>{if(i&&r.from>rs[i-1].to+0.5)x+=18;x+=Math.round(86+Math.min(len(r),500)*.14)});return x+14}
function fitLanes(){const boxes=[...app.querySelectorAll(".lanes")];if(!boxes.length||boxes[0].closest(".rp"))return;const svgs=boxes.map(b=>b.querySelector("svg.lane")).filter(Boolean),maxW=Math.max(...svgs.map(v=>+v.getAttribute("width"))),avail=boxes[0].clientWidth-2,sc=Math.max(.6,Math.min(1,avail/maxW));svgs.forEach(v=>{v.style.width=Math.round(maxW*sc)+"px";v.style.height="auto"})}
GTUI.windowOn('resize','app-base:resize:1',()=>{clearTimeout(fitLanes.t);fitLanes.t=setTimeout(fitLanes,120)});
function layerDiagram(o={}){
  const zs=zones().filter(z=>o.all||diagZone==="All zones"||z===diagZone);
  o={...o,W:Math.max(0,...zs.map(layerW))};
  if(!state.records.length)return `<div class="empty">No segments loaded.</div>`;
  return zs.map((z,i)=>`<div class="lanes">${layerSvg(z,i,o)}</div>`).join("")+layerLegend();
}
function zonePick(){return `<div class="zonepick" role="group" aria-label="Zone filter">${["All zones",...zones()].map(z=>`<button type="button" data-diagzone="${esc(z)}" class="${diagZone===z?"active":""}">${esc(z)}</button>`).join("")}</div>`}

/* ---------- briefing (dashboard) ---------- */
function titleBlock(){const pn=projectName();return `<div class="tb"><div><span>Project</span><strong>${esc(pn||"Ground treatment")}</strong></div><div><span>Reporting period</span><strong>${esc(state.meta.reportingMonth||monthLabel(cutoff())||"—")}</strong></div><div><span>Progress as at</span><strong>${fmtDate(cutoff())}</strong></div><div><span>Dataset revision</span><strong>${esc(state.datasetVersion)}</strong></div></div>`}
function briefingBody(printing){
  const rs=state.records,cut=cutoff(),ov=rollupLength(rs),mvAll=moveGroup(rs),ps=prevSnap();
  const stat={};rs.forEach(r=>stat[r.status]=(stat[r.status]||0)+1);
  const it=instrTotals(gtInstr());
  const statLine=["In Progress","Pre-construction","On Hold","Suspended","Under Review","Completed","Omitted","Not Required","Not Started"].filter(s=>stat[s]).map(s=>`${stat[s]} ${s.toLowerCase()}`).join(", ");
  const wl=watchList(8),mvs=movers(8);
  const openR=state.rfits.filter(isOpenRfit),openM=state.memos.filter(isOpenMemo);
  const G=geo();
  return `${titleBlock()}
  <div class="kstrip"><div class="k"><span>Overall progress</span><strong>${pct1(ov)}</strong><small>${ps?mvHtml(mvAll)+" since "+fmtDate(ps.date):"No earlier month on record"}</small></div><div class="k"><span>Active length</span><strong>${fmt(activeLength(rs))} m</strong><small>of ${fmt(totalLength(rs))} m in ${rs.length} segments</small></div><div class="k txt"><span>Segment status</span><strong>${esc(statLine||"—")}</strong></div><div class="k"><span>Instruments in GT segments</span><strong>${it.done} / ${it.total}</strong><small>installed or drilled</small></div><div class="k"><span>Open items</span><strong>${state.rfits.length?openR.length:"—"}</strong><small>${state.rfits.length?"RFIT":"no RFIT register"}${state.memos.length?", "+openM.length+" memo":""}</small></div></div>
  <section class="card"><div class="section-head"><div><h2>Ground treatment by type</h2><p>One row per treatment type, segments in chainage order. Filled part shows work done.</p></div>${printing?"":`<div>${zonePick()}</div>`}</div>${layerDiagram({all:printing})}</section>
  <div class="grid twocol"><section class="card"><div class="section-head"><div><h2>Progress by zone</h2><p>Length-weighted progress of active segments.</p></div></div>${zoneRows()}</section>
  <section class="card"><div class="section-head"><div><h2>Progress by treatment</h2><p>Same method, grouped by treatment type.</p></div></div>${typeRows()}</section></div>
  <div class="grid twocol"><section class="card"><div class="section-head"><div><h2>Moved since ${ps?fmtDate(ps.date):"the previous month"}</h2><p>Largest gains by segment.</p></div></div>${mvs.length?mvs.map(({r,m})=>`<button class="mover" type="button" data-segment="${esc(r.id)}"><strong>${esc(r.id)}</strong><span>${esc(firstSentence(r.activity,110))}</span><em>+${(m*100).toFixed(1)} pp</em></button>`).join(""):`<div class="empty">${ps?"No segment has moved.":"Import a workbook with a history column, or save a month-end snapshot, to see movement."}</div>`}</section>
  <section class="card"><div class="section-head"><div><h2>Needs attention</h2><p>On hold, under review, or with an open issue.</p></div></div>${wl.length?wl.map(r=>`<button class="issue" type="button" data-segment="${esc(r.id)}"><strong>${esc(r.id)}</strong><span>${status(r.status)} ${esc(short(r.issue||r.activity,130))}</span><span>›</span></button>`).join(""):`<div class="empty">Nothing flagged.</div>`}</section></div>
  ${state.rfits.length?`<section class="card"><div class="section-head"><div><h2>Open RFITs</h2><p>${openR.length} of ${state.rfits.length} still open.</p></div>${printing?"":`<button class="linkbtn" data-page="Registers">Registers</button>`}</div>${openR.length?openR.map(x=>`<div class="issue static"><strong>${esc(x.no.replace(/^JKR-RFIT-/,"RFIT-"))}</strong><span>${esc(short(x.subject,110))}<small class="muted"> · ${esc(x.segmentsText)}</small></span><span></span></div>`).join(""):`<div class="empty">No open RFITs.</div>`}</section>`:""}
  ${printing?"":`<section class="card"><div class="section-head"><div><h2>Where the works are</h2><p>${G?"Segments along the alignment, coloured by progress.":"Segments along the chainage."}</p></div><button class="linkbtn" data-page="Map">Open map</button></div>${G?`<div class="mapbox" data-page="Map">${mapSvg({view:fitAll(),colorBy:"progress",small:true})}</div>${mapLegend("progress")}`:chainageMap(rs)}</section>`}`;
}
function diagramPage(){
  const r=byId(selected);
  return `${head("Layered diagram","Treatment layers by zone",`Rows are treatment types, boxes are segments. Select a box to see its record.`,`<button class="btn" data-action="print">Print / Save PDF</button>`)}<section class="card"><div class="section-head"><div><h2>Segments by treatment type</h2><p>Progress as at ${fmtDate(cutoff())}.</p></div>${zonePick()}</div>${layerDiagram({})}</section><div class="detail-wrap">${segmentDetails(r)}</div>`;
}

function renderSegmentDetails(r,extra=""){
  if(!r)return `<aside class="card detail"><div class="empty">Select a segment.</div></aside>`;
  let body="";
  if(selectedTab==="Progress")body=`<div class="progressline"><span>Overall for this segment</span><strong>${pct(progress(r))}</strong></div>${bar(progress(r),"large")}<p class="small">${mvHtml(moveSeg(r))} vs previous month. Estimate only.</p>${stageRows(r)}`;
  else if(selectedTab==="Activity")body=`<div class="detail-copy"><h3>Current activity</h3><p>${esc(r.activity||"Not recorded")}</p><h3>Next activity / hold point</h3><p>${esc(r.next||"Not recorded")}</p></div>`;
  else body=`<div class="detail-copy"><h3>Open issues / constraints</h3><p>${esc(r.issue||"No issue recorded")}</p></div>`;
  return `<aside class="card detail"><div class="detail-top"><div><div class="kicker">${esc(r.zone)}, ${esc(r.type)}</div><h2>${esc(r.id)}</h2><p>${chain(r.from)} – ${chain(r.to)}, ${fmt(len(r))} m</p></div>${status(r.status)}</div><div class="tabs">${["Progress","Activity","Issues"].map(t=>`<button type="button" data-tab="${t}" class="${selectedTab===t?"active":""}">${t}</button>`).join("")}</div>${body}<button class="btn full" data-page="Sheet">One-page sheet</button>${viewer||state.workspace?.mode!=="master"?"":`<button class="btn primary full" data-page="Update">Edit this segment record</button>`}${extra}</aside>`;
}
function datesBlock(r){const rows=[["Work commenced",r.commenced],["Work completed",r.completed],["Surcharge placed",r.surchargePlaced],["Planned surcharge removal",r.plannedRemoval],["Load test",r.loadTestDate?fmtDate(r.loadTestDate)+(r.loadTestResult?" · "+r.loadTestResult:""):r.loadTestResult],["Slab cast",r.slabCast],["Working piles",r.pilesDone!=null||r.pilesReq!=null?`${r.pilesDone??"—"} of ${r.pilesReq??"—"}`:null],["Last updated",r.lastUpdated?fmtDate(r.lastUpdated)+(r.updatedBy?" · "+r.updatedBy:""):null]];return rows.filter(x=>x[1]!=null&&x[1]!=="").map(([k,v])=>`<div class="stat"><span>${esc(k)}</span><strong>${/^\d{4}-\d{2}-\d{2}/.test(String(v))?fmtDate(v):esc(v)}</strong></div>`).join("")}
/* ---------- report ---------- */
let rptSheets=true;
function withLight(fn){const k=lightMode;lightMode=true;try{return fn()}finally{lightMode=k}}
function datesRows(r){return [["Work commenced",r.commenced],["Work completed",r.completed],["Surcharge placed",r.surchargePlaced],["Planned surcharge removal",r.plannedRemoval],["Load test",r.loadTestDate?fmtDate(r.loadTestDate)+(r.loadTestResult?", "+r.loadTestResult:""):r.loadTestResult],["Slab cast",r.slabCast],["Working piles",r.pilesDone!=null||r.pilesReq!=null?`${r.pilesDone??"—"} of ${r.pilesReq??"—"}`:null]].filter(x=>x[1]!=null&&x[1]!=="")}
function sheetHtml(r){return withLight(()=>{
  const m=rptMeta(),ins=segInstr(r.id),sum=instrSummary(ins),rf=segRfits(r.id),mm=segMemos(r.id),prm=Object.entries(r.params||{}).filter(([k,v])=>v!=null&&v!==""),P=progress(r),mvv=moveSeg(r);
  const act=r.stages.filter(s=>s.rating!=="NA"),W=act.reduce((a,s)=>a+(Number(s.weight)||0),0)||1;
  const facts=[...datesRows(r),...(r.design?[["Original design",short(r.design,90)]]:[]),...(r.governing?[["Governing document",short(r.governing,90)]]:[])];
  let n=0;const H=t=>`<h3><span class="sn">${++n}</span>${esc(t)}</h3>`;
  return `<article class="sp rp-page"><header class="rh"><strong>Segment progress sheet</strong><span>${esc(projectName())}, as at ${fmtDate(cutoff())}</span></header>
  <div class="sp-title"><div><div class="sp-id">${esc(r.id)}</div><div class="sp-sub">${chain(r.from)} – ${chain(r.to)}, ${fmt(len(r))} m</div></div><div class="sp-prog"><div class="sp-pct">${pct(P)}</div>${bar(P,"large")}<div class="sp-mv">${mvHtml(mvv)} vs previous month</div></div></div>
  <div class="tb4"><div><span>Zone</span><strong>${esc(r.zone)}</strong></div><div><span>Treatment</span><strong><i class="sw" style="background:${laneCol(r.type)}"></i>${esc(r.type)}</strong></div><div><span>Status</span><strong>${status(r.status)}</strong></div><div><span>Last updated</span><strong>${r.lastUpdated?fmtDate(r.lastUpdated):"—"}</strong><small>${esc(r.updatedBy||"")}</small></div></div>
  ${r.gtType&&r.gtType!==r.type?`<p class="sp-scope"><b>Current scope.</b> ${esc(short(r.gtType,200))}</p>`:""}
  ${H("Location and design basis")}<div class="sp-grid"><div>${geo()?miniMap(r):`<div class="empty">No alignment loaded.</div>`}</div><div><table class="kv"><tbody>${prm.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(short(v,80))}</td></tr>`).join("")}${facts.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${/^\d{4}-\d{2}-\d{2}/.test(String(v))?fmtDate(v):esc(v)}</td></tr>`).join("")}</tbody></table></div></div>
  ${H("Construction progress")}<table class="table stg"><thead><tr><th class="no">No.</th><th>Construction stage</th><th class="r">Weight</th><th>Complete</th><th class="r">Adds</th></tr></thead><tbody>${r.stages.map((s,i)=>{const na=s.rating==="NA",w=na?0:(Number(s.weight)||0)/W;return `<tr><td class="no">${i+1}</td><td>${esc(s.name)}</td><td class="r">${na?"–":Math.round(w*100)+"%"}</td><td><span class="rate ${na?"na":""}">${rl(s.rating)}</span>${na?"":bar(Number(s.rating))}</td><td class="r">${na?"–":(w*Number(s.rating)*100).toFixed(1)}</td></tr>`}).join("")}</tbody><tfoot><tr><td></td><td><strong>Segment progress</strong></td><td class="r">100%</td><td></td><td class="r"><strong>${P==null?"—":(P*100).toFixed(1)}</strong></td></tr></tfoot></table>
  ${H("Activity and remarks")}<table class="kv wide"><tbody><tr><th>Current activity</th><td>${esc(r.activity||"Not recorded")}</td></tr><tr><th>Next activity or hold point</th><td>${esc(r.next||"Not recorded")}</td></tr><tr><th>Issues or constraints</th><td>${esc(r.issue||"None recorded")}</td></tr></tbody></table>
  ${Object.keys(sum).length?`${H("Instrumentation")}<table class="table"><thead><tr><th>Type</th><th class="r">Scheduled</th><th class="r">Installed or drilled</th><th class="r">To verify</th><th class="r">Not installed</th></tr></thead><tbody>${Object.entries(sum).map(([t,v])=>`<tr><td>${esc(t)}</td><td class="r">${v.total}</td><td class="r">${v.done}</td><td class="r">${v.verify}</td><td class="r">${v.missing}</td></tr>`).join("")}</tbody></table>`:""}
  ${rf.length||mm.length?`${H("Related RFITs and memos")}<table class="table"><tbody>${rf.slice().sort((x,y)=>(isOpenRfit(y)?1:0)-(isOpenRfit(x)?1:0)).slice(0,2).map(x=>`<tr><td><strong>${esc(x.no.replace(/^JKR-RFIT-/,"RFIT-"))}</strong></td><td>${esc(short(x.subject,100))}</td><td>${status(x.status||"—")}</td></tr>`).join("")}${mm.slice().sort((x,y)=>(isOpenMemo(y)?1:0)-(isOpenMemo(x)?1:0)).slice(0,2).map(x=>`<tr><td><strong>${esc(x.ref.replace(/^S1425-/,"").replace(/-PAJ-SM$/,""))}</strong></td><td>${esc(short(x.subject,100))}</td><td>${status(x.status||"—")}</td></tr>`).join("")}</tbody></table>${rf.length>2||mm.length>2?`<p class="small">Open items shown first. ${Math.max(0,rf.length-2)+Math.max(0,mm.length-2)} more in Registers.</p>`:""}`:""}
  ${(r.photos||[]).length?`${H("Site photos")}<div class="sp-photos">${r.photos.slice(-4).map(p=>`<figure><img src="${p.data}" alt="${esc(p.caption||"Site photo")}"><figcaption>${esc(p.caption||"")}${p.date?" "+fmtDate(p.date):""}</figcaption></figure>`).join("")}</div>`:""}
  <div class="sp-sign"><div><span>Updated by</span><strong>${esc(r.updatedBy||" ")}</strong></div><div><span>Checked by</span><strong>${esc(m.checkedBy||" ")}</strong></div><div><span>Date</span><strong>${fmtDate(cutoff())}</strong></div></div>
  <footer class="sp-foot">Progress is an estimate from site observation, not a measurement, payment certification or acceptance. Developed by WPN.</footer></article>`})}
function sheetPage(){
  const r=byId(selected)||state.records[0];if(!r)return "";
  const i=state.records.indexOf(r),prev=state.records[i-1],next=state.records[i+1];
  return `<div class="rp-noprint">${head("Segment progress sheet",r.id,`${chain(r.from)} – ${chain(r.to)}`,`<button class="btn" data-page="${esc(prevPage)}">Back</button>${prev?`<button class="btn" data-sheet="${esc(prev.id)}">${esc(prev.id)}</button>`:""}${next?`<button class="btn" data-sheet="${esc(next.id)}">${esc(next.id)}</button>`:""}<button class="btn primary" data-action="print">Print / Save PDF</button>`)}</div><div class="rp">${sheetHtml(r)}</div>`;
}

function rptMeta(){const m=state.meta.report||{};return{title:m.title||"Ground Treatment Progress Report",preparedBy:m.preparedBy||"",checkedBy:m.checkedBy||"",distribution:m.distribution||"",docNo:m.docNo||""}}
function rpPage(title,inner,cls=""){const m=rptMeta();return `<section class="rp-page ${cls}"><header class="rh"><strong>${esc(m.title)}</strong><span>${esc(projectName())} · as at ${fmtDate(cutoff())}</span></header>${title?`<h2>${esc(title)}</h2>`:""}${inner}<footer class="rp-foot"><span>${esc(m.title)} · ${esc(projectName())}</span><span>Developed by WPN</span></footer></section>`}
function reportCover(){
  const m=rptMeta(),rs=state.records,ov=rollupLength(rs),mvAll=moveGroup(rs),ps=prevSnap();
  return `<section class="rp-page cover"><div class="rule"></div><p class="ui-report-draft">WORKING PREVIEW · NOT ISSUED</p><div class="kicker">${esc(projectName()||"Ground treatment")}</div><h1>${esc(m.title)}</h1><p class="sub2">${esc(state.meta.reportingMonth||monthLabel(cutoff()))}</p>
  <div class="heroline"><div><div class="big">${pct1(ov)}</div><small>overall progress, stage-weighted and length-weighted</small></div><div><div class="num" style="font-size:26px;font-weight:600">${ps&&mvAll!=null?(mvAll>0.0005?"▲ +":mvAll<-0.0005?"▼ ":"")+(Math.round(mvAll*1000)/10).toFixed(1)+" pp":"n/a"}</div><small>${ps?"since "+fmtDate(ps.date):"no earlier month on record"}</small></div><div><div class="num" style="font-size:26px;font-weight:600">${fmt(activeLength(rs))} m</div><small>active length of ${fmt(totalLength(rs))} m</small></div></div>
  <div class="tblock"><div class="w2"><span>Project</span><strong>${esc(projectName()||"—")}</strong></div><div><span>Progress as at</span><strong>${fmtDate(cutoff())}</strong></div><div><span>Dataset revision</span><strong>${esc(state.datasetVersion)}</strong></div>
  <div class="w2"><span>Document</span><strong>${esc(m.title)}${m.docNo?" · "+esc(m.docNo):""}</strong></div><div class="w2"><span>Distribution</span><strong>${esc(m.distribution||"—")}</strong></div>
  <div><span>Prepared by</span><strong>${esc(m.preparedBy||" ")}</strong></div><div><span>Checked by</span><strong>${esc(m.checkedBy||" ")}</strong></div><div class="w2"><span>Basis</span><strong>Estimate from site observation. Not a measurement, payment certification or acceptance.</strong></div></div>
  <footer class="rp-foot"><span>${esc(m.title)} · ${esc(projectName())}</span><span>Developed by WPN</span></footer></section>`;
}
function reportSummary(){
  const rs=state.records,ov=rollupLength(rs),mvAll=moveGroup(rs),ps=prevSnap(),act=rs.filter(r=>progress(r)!=null),ex=rs.length-act.length,mvs=movers(5),wl=watchList(8);
  const openR=state.rfits.filter(isOpenRfit);
  const lines=[`Overall ground treatment progress is <b>${pct1(ov)}</b> as at ${fmtDate(cutoff())}${ps&&mvAll!=null?`, ${mvAll>0.0005?"up":mvAll<-0.0005?"down":"unchanged"}${Math.abs(mvAll)>0.0005?" "+Math.abs(Math.round(mvAll*1000)/10).toFixed(1)+" pp":""} on ${fmtDate(ps.date)}`:""}.`,
    `${act.length} of ${rs.length} segments (${fmt(activeLength(rs))} m of ${fmt(totalLength(rs))} m) are counted in the progress figure${ex?`; ${ex} are omitted, not required or under review`:""}.`];
  if(state.rfits.length)lines.push(`${openR.length} of ${state.rfits.length} RFITs are open.`);
  return rpPage("Summary",`<ul class="hl">${lines.map(l=>`<li>${l}</li>`).join("")}</ul>
  <h3>Progress by treatment</h3>${typeRows()}<h3>Progress by zone</h3>${zoneRows().replace(/<button class="rowbar" type="button" data-zone="[^"]*">/g,'<div class="rowbar">').replace(/<\/button>/g,"</div>")}
  <h3>Moved since ${ps?fmtDate(ps.date):"the previous month"}</h3>${mvs.length?`<table class="table"><thead><tr><th>Segment</th><th>Activity</th><th class="r">Was</th><th class="r">Now</th><th class="r">Change</th></tr></thead><tbody>${mvs.map(({r,m})=>`<tr><td><strong>${esc(r.id)}</strong><small>${chain(r.from)} – ${chain(r.to)}</small></td><td>${esc(firstSentence(r.activity,120))}</td><td class="r">${pct((progress(r)||0)-m)}</td><td class="r"><strong>${pct(progress(r))}</strong></td><td class="r">+${(m*100).toFixed(1)} pp</td></tr>`).join("")}</tbody></table>`:`<p class="small">${ps?"No segment moved in this period.":"No earlier month on record, so movement cannot be shown."}</p>`}`);
}
function reportRegister(){
  const rs=state.records;
  return rpPage("Segment register",`<table class="table"><thead><tr><th>Segment</th><th>Chainage</th><th class="r">Length</th><th>Treatment</th><th class="r">Progress</th><th class="r">Change</th><th>Status</th></tr></thead><tbody>${rs.map(r=>{const m=moveSeg(r);return `<tr><td><strong>${esc(r.id)}</strong><small>${esc(r.zone)}</small></td><td>${chain(r.from)} – ${chain(r.to)}</td><td class="r">${fmt(len(r))} m</td><td><i class="sw" style="background:${laneCol(r.type)}"></i>${esc(r.type)}</td><td class="r"><strong>${pct(progress(r))}</strong></td><td class="r">${m!=null&&Math.abs(m)>0.0005?(m>0?"+":"")+(Math.round(m*1000)/10).toFixed(1)+" pp":"–"}</td><td>${status(r.status)}</td></tr><tr><td></td><td colspan="6" class="small" style="border-bottom:1px solid var(--rule)">${esc(short(r.activity||"No activity recorded",230))}</td></tr>`}).join("")}</tbody></table>`,"flow");
}
function renderReportOpenItems(){
  const wl=state.records.filter(r=>(r.issue&&r.issue.trim()&&r.status!=="Omitted")||["On Hold","Suspended","Under Review"].includes(r.status));
  const openR=state.rfits.filter(isOpenRfit),openM=state.memos.filter(isOpenMemo),isum=instrSummary(gtInstr());
  return rpPage("Issues, hold points and open items",`<h3>Segments needing attention</h3>${wl.length?`<table class="table"><thead><tr><th>Segment</th><th>Status</th><th>Issue or constraint</th><th>Next activity or hold point</th></tr></thead><tbody>${wl.map(r=>`<tr><td><strong>${esc(r.id)}</strong></td><td>${status(r.status)}</td><td>${esc(short(r.issue||"—",260))}</td><td>${esc(short(r.next||"—",160))}</td></tr>`).join("")}</tbody></table>`:`<p class="small">None flagged.</p>`}
  ${openR.length?`<h3>Open RFITs (${openR.length})</h3><table class="table"><tbody>${openR.map(x=>`<tr><td><strong>${esc(x.no.replace(/^JKR-RFIT-/,"RFIT-"))}</strong></td><td>${esc(short(x.subject,150))}<small>${esc(x.segmentsText||"")}</small></td></tr>`).join("")}</tbody></table>`:""}
  ${openM.length?`<h3>Site memos with open actions (${openM.length})</h3><table class="table"><tbody>${openM.map(x=>`<tr><td><strong>${esc(x.ref.replace(/^S1425-/,"").replace(/-PAJ-SM$/,""))}</strong></td><td>${esc(short(x.subject,150))}<small>${esc(x.segmentsText||"")}</small></td></tr>`).join("")}</tbody></table>`:""}
  ${Object.keys(isum).length?`<h3>Instrumentation in GT segments</h3><table class="table"><thead><tr><th>Type</th><th class="r">Scheduled</th><th class="r">Installed or drilled</th><th class="r">To verify</th><th class="r">Not installed</th></tr></thead><tbody>${Object.entries(isum).map(([t,v])=>`<tr><td>${esc(t)}</td><td class="r">${v.total}</td><td class="r">${v.done}</td><td class="r">${v.verify}</td><td class="r">${v.missing}</td></tr>`).join("")}</tbody></table>`:""}`,"flow");
}
function reportBody(){
  const G=geo();
  let h=reportCover()+reportSummary();
  h+=rpPage("Layered diagram",`<p class="lead">Each row is a treatment type; each box is a ground treatment segment in chainage order. The filled part shows work done.</p>${layerLegend()}${layerDiagram({all:true,print:true}).replace(layerLegend(),"")}`,"flow wide");
  h+=reportRegister()+reportIssues();
  if(G)h+=rpPage("Alignment",`${`<div class="mapbox">${mapSvg({view:fitAll(),colorBy:"progress",small:true})}</div>${mapLegend("progress")}`}`);
  return h;
}
function renderLiveReportPage(){
  const m=rptMeta();
  return `<div class="rp-noprint">${head("Progress report","Progress report","Working preview from the current reference dataset. Close periods in the master workspace for issued reports.",`<button class="btn" data-page="Briefing">Back</button><button class="btn primary" data-action="print">Print / Save PDF</button>`)}<section class="card"><div class="filters wrap"><label class="check"><input type="checkbox" data-input="rptSheets" ${rptSheets?"checked":""}> Include one-page segment sheets (appendix)</label>${viewer?"":`<span class="muted small">Title, distribution and sign-off names are set in Workspace.</span>`}</div></section></div>
  <div class="rp">${reportBody()}</div>${rptSheets?`<div class="rp-appx">${state.records.map(r=>sheetHtml(r)).join("")}</div>`:""}`;
}

/* ---------- registers ---------- */
function regDetails(items,fields){return items.length?items.map(x=>`<details class="reg"><summary><strong>${esc(fields.id(x))}</strong><span>${esc(short(x.subject,120))}</span>${status(x.status||"—")}</summary><div class="reg-body">${fields.rows(x).filter(r=>r[1]).map(([k,v])=>`<div><b>${esc(k)}</b><p>${esc(v)}</p></div>`).join("")}</div></details>`).join(""):`<div class="empty">Nothing matches.</div>`}
function draftOf(id){return state.outbox.find(d=>d.segmentId===id&&d.state!=="sent")}
function draftRecord(r,d){const proposed={...r,stages:r.stages.map((s,i)=>({...s,rating:r.instrumentationBinding?.mode==='derived'&&r.instrumentationBinding.stageInternalId===s.internalId?s.rating:d.stages[i]?d.stages[i].rating:s.rating}))};return GTInstrumentation.preview(state,proposed,d.instruments);}
function draftChanges(d,r){
  const out=[];
  d.stages.forEach((s,i)=>{const b=d.base.stages[i];if(b&&!sameRating(b.rating,s.rating))out.push(`${short(s.name,44)}: ${rl(b.rating)} → ${rl(s.rating)}`)});
  for(const [k,l] of [["activity","Current activity"],["next","Next activity"],["issue","Issues"]])if(String(d[k]||"").trim()!==String(d.base[k]||"").trim())out.push(l+" updated");
  const ni=Object.keys(d.instruments||{}).length;if(ni)out.push(ni+" instrument status"+(ni>1?"es":""));
  if(d.photos.length)out.push(d.photos.length+" photo"+(d.photos.length>1?"s":""));
  return out;
}
function whoCard(){const u=state.meta.user||{};return `<section class="card"><div class="who"><label class="field">Your name<input class="control" data-user="name" value="${esc(u.name||"")}" placeholder="Name or initials" autocomplete="name"></label><label class="field">Your role<select class="control" data-user="role">${[["ARE","ARE"],["IOW","IOW"],["RE","RE / reviewer"],["Other","Other"]].map(([v,l])=>`<option value="${v}" ${role()===v?"selected":""}>${l}</option>`).join("")}</select></label><p class="small">Name and role are sent with every update.</p></div></section>`}
function entryPicker(){
  const q=entryQuery.toLowerCase();
  const rs=state.records.filter(r=>(entryZone==="All zones"||r.zone===entryZone)&&(`${r.id} ${r.zone} ${r.type} ${chain(r.from)}`).toLowerCase().includes(q));
  const byZone=zones().filter(z=>rs.some(r=>r.zone===z));
  return `${head("Field entry","Update progress","Pick the segment you inspected. Your update is saved on this phone and sent to the reviewer as a file.",`<button class="btn" data-page="Outbox">Outbox${outCount()?" ("+outCount()+")":""}</button>`)}${whoCard()}<section class="card"><div class="filters wrap"><label class="field">Search<input class="control" data-input="entryQuery" value="${esc(entryQuery)}" placeholder="GT-07 or CH 63+900"></label><label class="field">Zone<select class="control" data-input="entryZone"><option>All zones</option>${zones().map(z=>`<option ${entryZone===z?"selected":""}>${esc(z)}</option>`).join("")}</select></label></div>${byZone.map(z=>`<h3 style="margin:14px 0 0;font-size:15px">${esc(z)}</h3><div class="segpick">${rs.filter(r=>r.zone===z).map(r=>{const d=draftOf(r.id);return `<button type="button" data-entry="${esc(r.id)}" class="${d?"has-draft":""}"><strong><i class="dot" style="background:${laneCol(r.type)}"></i>${esc(r.id)}</strong><small>${chain(r.from)} – ${chain(r.to)} · ${esc(r.type)}</small><small>${pct(progress(r))} now${r.lastUpdated?" · updated "+fmtDate(r.lastUpdated):""}${d?" · draft":""}</small></button>`}).join("")}</div>`).join("")||`<div class="empty">No segments match.</div>`}</section>`;
}

function slider(ctx,i,s,b){
  const na=s.rating==="NA",v=na?0:Math.round(Number(s.rating)*100),was=b&&b.rating!=="NA"&&b.rating!=null?Math.round(Number(b.rating)*100):null,k=ctx+"|"+i;
  return `<div class="sl${na?" na":""}" data-slw="${k}"><div class="sl-track"><input type="range" min="0" max="100" step="1" value="${v}" data-sl="${k}" aria-label="${esc(s.name)}, percent complete">${was!=null?`<span class="sl-was" style="left:calc(${was}% + ${(8-was*.16).toFixed(2)}px)" title="On record: ${was}%"></span>`:""}</div><div class="sl-num"><input type="number" inputmode="numeric" min="0" max="100" step="1" value="${na?"":v}" placeholder="–" data-sln="${k}" aria-label="${esc(s.name)}, percent complete, typed"><span>%</span></div><div class="sl-quick">${[0,25,50,75,100].map(q=>`<button type="button" class="${!na&&v===q?"on":""}" data-slq="${k}|${q}">${q}%</button>`).join("")}<button type="button" class="${na?"on":""}" data-slq="${k}|NA">N/A</button></div></div>`}
function setStage(ctx,i,val){
  if(ctx==="draft"){const d=draftOf(entrySeg);if(!d)return;d.stages[i].rating=val;d.state="draft";persistSoon();liveDraft()}
  else{const r=byId(selected);if(!r)return;setRatingOn(r,i,val);r.appUpdated=true;persistSoon()}
}
function syncSl(ctx,i,val){
  const w=app.querySelector(`[data-slw="${ctx}|${i}"]`);if(!w)return;const na=val==="NA",n=na?0:Math.round(val*100);
  w.classList.toggle("na",na);const rg=w.querySelector("[data-sl]"),nu=w.querySelector("[data-sln]");if(rg&&document.activeElement!==rg)rg.value=n;if(nu&&document.activeElement!==nu)nu.value=na?"":n;
  w.querySelectorAll("[data-slq]").forEach(b=>{const q=b.dataset.slq.split("|")[2];b.classList.toggle("on",na?q==="NA":Number(q)===n&&q!=="NA")})}
function liveDraft(){
  const r=byId(entrySeg),d=draftOf(entrySeg);if(!r||!d)return;const dr=draftRecord(r,d),pn=progress(dr),ch=draftChanges(d,r),q=x=>app.querySelector(x);
  const a=q('[data-live="pn"]');if(a)a.textContent=pct1(pn);const b=q('[data-live="bar"] i');if(b)b.style.width=Math.round((pn||0)*100)+"%";
  d.stages.forEach((st,i)=>{const t=q(`[data-tag="${i}"]`),bs=d.base.stages[i];if(t)t.innerHTML=bs&&!sameRating(bs.rating,st.rating)?`<span class="changed-tag">changed</span>`:""});
  const m=q('[data-live="sum"]');if(m)m.textContent=ch.length?ch.join("; "):"No changes yet.";const sv=q("[data-action='entry-save']");if(sv)sv.disabled=!ch.length}
function renderObservationForm(r){
  const d=ensureDraft(r),dr=draftRecord(r,d),pn=progress(dr),p0=progress(r),ch=draftChanges(d,r);
  const ins=segInstr(r.id);
  return `${head(`${r.zone} · ${r.type}`,r.id,`${chain(r.from)} – ${chain(r.to)} · ${fmt(len(r))} m`,`<button class="btn" data-action="entry-back">All segments</button>`)}
  <section class="card"><div class="progressline"><span>Progress after your update <span class="small">(was ${pct(p0)})</span></span><strong data-live="pn">${pct1(pn)}</strong></div><div data-live="bar">${bar(pn,"large")}</div>
  <label class="field" style="max-width:240px;margin-top:8px">Observed on<input class="control" type="date" data-draft="observedOn" value="${esc(d.observedOn)}" max="${todayISO()}"></label></section>
  <section class="card"><div class="section-head"><div><h2>What has been completed?</h2><p>Drag the slider or type a percentage for each stage, in steps of 1%. The orange mark shows the value on record.</p></div></div>
  ${d.stages.map((s,i)=>{const b=d.base.stages[i],st=r.stages[i],chg=b&&!sameRating(b.rating,s.rating);return `<div class="estage"><div class="sname"><span>${esc(s.name)}<span data-tag="${i}">${chg?`<span class="changed-tag">changed</span>`:""}</span></span><small>${s.rating==="NA"?"":Math.round((Number(st&&st.weight)||0)*100)+"% of segment"}</small></div>${instrumentStageControl(r,d,i,b)}</div>`}).join("")}</section>
  ${ins.length?`<section class="card"><details><summary class="section-head" style="cursor:pointer"><div><h2>Instruments (${ins.length})</h2><p>Only set the ones you checked. Leave the rest as they are.</p></div></summary>${ins.map(i=>`<div class="inst-row"><span><strong>${esc(i.id)}</strong><small class="muted"> ${esc(i.status||"")}</small></span><select class="control" data-inst="${esc(i.id)}"><option value="">No change</option>${INST_OPTS.map(o=>`<option ${(d.instruments||{})[i.id]===o?"selected":""}>${o}</option>`).join("")}</select></div>`).join("")}</details></section>`:""}
  <section class="card"><div class="section-head"><div><h2>Remarks</h2><p>One short sentence each. Write what the reviewer needs to act on.</p></div></div><div class="formgrid"><label class="field wide">Current activity<textarea class="control" rows="3" data-draft="activity">${esc(d.activity)}</textarea></label><label class="field wide">Next activity or hold point<textarea class="control" rows="2" data-draft="next">${esc(d.next)}</textarea></label><label class="field wide">Issues or constraints<textarea class="control" rows="2" data-draft="issue">${esc(d.issue)}</textarea></label></div></section>
  <section class="card"><div class="section-head"><div><h2>Photo evidence</h2><p>Up to 6 per observation. Add a caption identifying the location and date. Photos are compressed locally.</p></div><label class="btn importlabel">Add photos<input type="file" accept="image/*" multiple data-input="photo"></label></div>${d.photos.length?`<div class="photos">${d.photos.map(p=>`<div class="ph"><img src="${p.data}" alt="${esc(p.caption||"Site photo")}"><input data-photo-cap="${p.id}" value="${esc(p.caption||"")}" placeholder="Caption" aria-label="Photo caption"><label class="field">Photo date<input class="control" type="date" max="${todayISO()}" value="${esc((p.takenAt||'').slice(0,10)||d.observedOn)}" data-ui-field-photo="${esc(p.id)}"></label><button class="btn small danger" type="button" data-photo-del="${p.id}">Remove</button></div>`).join("")}</div>`:`<div class="empty">No photos yet.</div>`}</section>
  <div class="card"><div class="small" data-live="sum" style="margin-bottom:8px">${ch.length?esc(ch.join("; ")):"No changes yet."}</div><div class="stickybar"><button class="btn primary" data-action="entry-save" ${ch.length?"":"disabled"}>Prepare submission</button><button class="btn" data-action="entry-back">Keep draft</button><button class="btn danger" data-action="entry-discard">Discard</button></div></div>`;
}
function entryPage(){
  if(!state.records.length)return `${head("Field entry","Update progress","","")}<div class="empty">No segments on this device. Open Data and import the data file from the reviewer.</div>`;
  const r=byId(entrySeg);return r?entryForm(r):entryPicker();
}
function resizeImage(file,max=1280,q=.72){return new Promise((res,rej)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const s=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL("image/jpeg",q))};img.onerror=()=>{URL.revokeObjectURL(url);rej(Error("Could not read that photo."))};img.src=url})}
async function addPhotos(files){
  const d=draftOf(entrySeg);if(!d)return;
  for(const f of [...files]){if(d.photos.length>=6){notice="Six photos is the limit for one update.";break}try{GTLifecycle.photoSource(f);d.photos.push({id:uid(),name:f.name,caption:"",data:GTLifecycle.photoResult(await resizeImage(f)),takenAt:new Date().toISOString()})}catch(e){notice=e.message}}
  persist().catch(()=>{});render();
}
/* outbox: updates waiting to be sent */
function setRatingOn(r,index,value){r.stages[index].rating=value==="NA"?"NA":Number(value);const p=progress(r);if(p!=null&&p>=.9995&&!EXCLUDED.includes(r.status))r.status="Completed";else if(p!=null&&p<.9995&&r.status==="Completed")r.status=p>0?"In Progress":"Not Started";else if(p!=null&&p>0&&["Not Started","Pre-construction"].includes(r.status))r.status="In Progress"}
function exportCsv(){
  const q=v=>{v=v==null?"":String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const trk=r=>/^Piled/i.test(r.type)?"PE_Tracker":/^PVD|^Surcharge/i.test(r.type)?"PVD_Tracker":"RR_Tracker";
  const rows=state.records.filter(r=>r.appUpdated);
  const mx=Math.max(10,...rows.map(r=>r.stages.length));
  const hdr=["Segment","Tracker sheet",...Array.from({length:mx},(_,i)=>"S"+(i+1)),"Current activity","Next activity / hold point","Issues / constraints","Last updated","Updated by"];
  const lines=[hdr.map(q).join(",")];
  rows.forEach(r=>lines.push([r.id,trk(r),...Array.from({length:mx},(_,i)=>r.stages[i]?(r.stages[i].rating==="NA"?"N/A":Math.round(r.stages[i].rating*10000)/10000):""),r.activity,r.next,r.issue,r.lastUpdated,r.updatedBy].map(q).join(",")));
  const ins=state.instruments.filter(i=>i.appUpdated);
  if(ins.length){lines.push("");lines.push(["Instrument","Segment","Status"].map(q).join(","));ins.forEach(i=>lines.push([i.id,i.segment,i.status].map(q).join(",")))}
  download(new Blob(["﻿"+lines.join("\r\n")],{type:"text/csv"}),"GT-workbook-updates-"+todayISO()+".csv");
  notice="Update sheet downloaded. Columns S1 to S"+Math.min(mx,10)+" follow the stage order in each tracker sheet.";render();
}

/* ---------- render ---------- */
function backupAge(){return state.lastExportAt?Math.floor((Date.now()-new Date(state.lastExportAt).getTime())/864e5):null}
const backupDue=()=>{const a=backupAge();return a===null||a>=7};
/* ---------- mutations ---------- */
let save;
function mutateLegacyField(id,key,value){
  if(key==="id"){const nid=String(value).trim();if(!nid){notice="Segment ID cannot be empty.";return id}if(nid!==id&&state.records.some(x=>x.id===nid)){notice="That segment ID already exists.";return id}state.records=state.records.map(r=>r.id===id?{...r,id:nid,userEditedScope:true}:r);state.audit.forEach(a=>{if(a.segmentId===id)a.segmentId=nid});return nid}
  if(key==="type"){retype(id,value);return id}
  const scope=["zone","from","to","scopeNote"].includes(key);
  state.records=state.records.map(r=>r.id===id?{...r,[key]:key==="from"||key==="to"?Number(value):value,...(scope?{userEditedScope:true}:{}),...(["activity","next","issue","status"].includes(key)?{appUpdated:true}:{})}:r);return id}
function retype(id,type){const r=byId(id);if(!r||r.type===type)return;const key=s=>String(s.name).trim().toLowerCase();const old=new Map(r.stages.map(s=>[key(s),s.rating]));const next=stageTemplate(type).map(s=>({...s,rating:old.has(key(s))?old.get(key(s)):0}));r.type=type;r.userEditedScope=true;r.stages=next;notice="Treatment changed to "+type+". Stages with the same name kept their ratings; new stages start at 0%. Review the stage list, then save."}
function setRating(id,index,value){const r=byId(id);if(r)setRatingOn(r,index,value)}
function applyStages(id){const r=byId(id);const total=r.stages.reduce((s,x)=>s+(Number(x.weight)||0),0);if(total<=0){notice="Enter a positive stage weight before saving.";return false}r.stages=r.stages.map(s=>({...s,weight:(Number(s.weight)||0)/total}));return true}
function mutateStages(action,index){const r=byId(selected);if(!r)return;if(action==="add")r.stages.push({id:"s"+(r.stages.length+1),name:"New construction stage",weight:0,rating:0});if(action==="remove"&&r.stages.length>1)r.stages.splice(index,1);render()}
function diffRecord(beforeJson,after){const out=[];let b;try{b=JSON.parse(beforeJson)}catch(e){return out}for(const k of["status","type","zone","from","to","activity","next","issue"])if(String(b[k]??"")!==String(after[k]??""))out.push(k+": "+short(b[k],40)+" → "+short(after[k],40));(after.stages||[]).forEach(s=>{const o=(b.stages||[]).find(x=>x.id===s.id&&x.name===s.name)||(b.stages||[]).find(x=>x.name===s.name);const ov=o?o.rating:null;if(String(ov)!==String(s.rating))out.push(short(s.name,38)+": "+rl(ov)+" → "+rl(s.rating))});return out.slice(0,14)}
function snapshot(){const segs={};state.records.forEach(r=>{const p=progress(r);if(p!=null)segs[r.id]=p});const date=cutoff();const snap={date,label:"Saved here",source:"local",progress:rollupLength(state.records),zones:zones().map(z=>({zone:z,progress:rollupLength(state.records.filter(r=>r.zone===z))})),segments:segs};state.snapshots=state.snapshots.filter(s=>!(s.source==="local"&&String(s.date).slice(0,10)===date));state.snapshots.push(snap);state.audit.push({date:new Date().toISOString(),action:"month-end snapshot for "+date,user:""});notice="Snapshot saved for "+fmtDate(date)+".";save()}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
let importJson;
function adoptData(data){const keep=state.lastExportAt,keepU=state.meta.user,keepOut=state.outbox,keepIn=state.inbox,keepProc=state.processed;applyLoaded(data);state.lastExportAt=keep;if(keepU)state.meta.user=keepU;if(!data.outbox){state.outbox=keepOut;state.inbox=keepIn;state.processed=keepProc}entrySeg=""}
function loadImporter(){return window.GTImport?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement("script");s.src="importer.js";s.onload=res;s.onerror=()=>rej(Error("Could not load importer.js. Open the app online once so it can be cached."));document.head.appendChild(s)})}


/* ---------- workbook write-back ---------- */
let wbResult=null;
function loadExporter(){return window.GTExport?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement("script");s.src="exporter.js";s.onload=res;s.onerror=()=>rej(Error("Could not load exporter.js. Open the app online once so it can be cached."));document.head.appendChild(s)})}
function wbName(name){
  const d=new Date(cutoff()+"T00:00:00"),mon=d.toLocaleDateString("en-GB",{month:"short"})+d.getFullYear();
  let n=String(name).replace(/\.xlsx$/i,"");
  if(/Rev\d+/i.test(n))n=n.replace(/Rev(\d+)/i,(m,k)=>"Rev"+(Number(k)+1));else n+="_updated";
  n=n.replace(/_[A-Za-z]{3}20\d\d/,"_"+mon);return n+".xlsx"}
function wbCard(applied){
  const r=wbResult;
  return `<section class="card"><div class="section-head"><div><h2>Update the tracker workbook</h2><p>${applied} segment${applied===1?"":"s"} changed in the app since the last workbook import.</p></div></div><p class="small">Pick your master workbook. The app writes the changed stage ratings, remarks and instrument status into a copy and downloads it as the next revision. Your original is not touched, and formatting, formulas and charts are kept.</p><div class="savebar" style="margin-top:8px"><label class="btn primary importlabel${applied?"":" disabled"}">Choose master workbook and export (.xlsx)<input type="file" accept=".xlsx" data-input="wbexport" ${applied?"":"disabled"}></label><button class="btn" data-action="csv" ${applied?"":"disabled"}>Update sheet only (.csv)</button></div>${r?`<div class="${r.warnings.length?"note warnbox":"toast"}" style="margin-top:10px"><div><strong>${esc(r.name)}</strong> downloaded.<ul class="hl" style="margin:4px 0 0">${r.summary.map(x=>`<li>${esc(x)}</li>`).join("")}${r.warnings.map(x=>`<li><b>Check:</b> ${esc(x)}</li>`).join("")}</ul></div></div>`:""}</section>`}
async function exportWorkbook(file){
  if(!file)return;
  try{
    await loadExporter();notice="Updating workbook…";render();
    const rows=state.records.filter(r=>r.appUpdated);
    const out=await GTExport.updateWorkbook(await file.arrayBuffer(),state,{progress});
    const name=wbName(file.name);
    download(new Blob([out.bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),name);
    wbResult={name,summary:out.summary,warnings:out.warnings};state.meta.lastWorkbookExport=new Date().toISOString();
    state.audit.push({date:new Date().toISOString(),action:"workbook exported: "+name+" ("+rows.length+" segments)"});
    notice="";await persist().catch(()=>{});render();
  }catch(e){wbResult=null;notice="Could not update the workbook: "+e.message;render()}
}
async function importWorkbook(file){
  if(!file)return;
  try{
    await loadImporter();notice="Reading workbook…";render();
    const d=await GTImport.readWorkbook(await file.arrayBuffer(),file.name);
    if(!state.meta.demo&&state.records.length&&!confirm("Importing "+file.name+" replaces the segment records on this device ("+d.records.length+" segments from the workbook). Local edits not exported will be lost. Continue?")){notice="Import cancelled.";render();return}
    const prevMap=state.map,keepExport=state.lastExportAt,keepAudit=state.audit,keepLocalSnaps=state.snapshots.filter(s=>s.source==="local"&&!d.snapshots.some(w=>w.date===s.date));
    state={...blankState(),records:d.records.map(normalizeRecord),templates:d.templates,instruments:d.instruments,rfits:d.rfits,memos:d.memos,snapshots:[...d.snapshots,...keepLocalSnaps],audit:keepAudit,map:prevMap,lastExportAt:keepExport,outbox:state.outbox,inbox:state.inbox,processed:state.processed,meta:{user:state.meta.user,report:state.meta.report,projectName:state.meta.demo?"":state.meta.projectName,source:d.meta.source,importedAt:new Date().toISOString(),cutoff:d.meta.cutoff||todayISO(),reportingMonth:d.meta.reportingMonth,projectLine:d.meta.projectLine,title:d.meta.title}};
    GEO=null;selected=state.records[0].id;mapView=null;
    let ok=0,bad=[];state.records.forEach((r,i)=>{const w=d.records[i].workbookProgress,p=progress(r);if((w==null&&p==null)||(w!=null&&p!=null&&Math.abs(w-p)<0.0005))ok++;else bad.push(r.id+" (workbook "+pct1(w)+", app "+pct1(p)+")")});
    const rep=[`${state.records.length} segments, ${state.instruments.length} instruments, ${state.rfits.length} RFITs, ${state.memos.length} memos read.`,`Cut-off ${fmtDate(state.meta.cutoff)}${d.meta.reportingMonth?" ("+d.meta.reportingMonth+")":""}. ${state.snapshots.length} history snapshot(s).`,`Progress check: ${ok} of ${state.records.length} segments match the workbook's Progress %.`];
    if(bad.length)rep.push("Differences: "+bad.join("; "));
    d.warnings.forEach(w=>rep.push("Warning: "+w));
    const ps=state.snapshots.find(s=>String(s.date).slice(0,10)>=state.meta.cutoff.slice(0,7)+"-01");
    if(ps){let diff=0;for(const r of state.records){const p=progress(r),h=ps.segments&&ps.segments[r.id];if(p!=null&&h!=null&&Math.abs(p-h)>0.0005)diff++}if(diff)rep.push(`Note: the workbook's ${fmtDate(ps.date)} history column differs from the live progress for ${diff} segment(s). Next month's movement will include that difference. In Progress_History, paste the live values (column D) into the month column at each close.`)}
    state.meta.importReport=rep;state.audit.push({date:new Date().toISOString(),action:"workbook import: "+file.name,user:""});
    await persist();notice="Workbook imported. "+rep[2];page="Briefing";
  }catch(e){notice=(e&&e.message)||"Could not read the workbook."}
  render();
}
async function importKml(file){
  if(!file)return;
  try{
    await loadImporter();const r=await GTImport.readKml(await file.text(),file.name);
    state.map=r.map;GEO=null;mapView=null;const c=r.check,rs=state.records;
    const outside=rs.filter(x=>x.to<c.from||x.from>c.to).length;
    state.meta.kmlReport=`${c.points} chainage points, CH ${fmt(c.from)} to ${fmt(c.to)} m; ${c.badSpacing?c.badSpacing+" point pair(s) where map distance differs from chainage by more than 10%":"spacing consistent with chainage"}${outside?"; "+outside+" segment(s) fall outside the alignment":""}.`;
    await persist();notice="Alignment loaded. "+state.meta.kmlReport;
  }catch(e){notice=(e&&e.message)||"Could not read the KML file."}
  render();
}
async function exportBriefing(){
  const data={schemaVersion:GTWorkspace.SCHEMA,instrumentation:state.instrumentation,actions:state.actions,projectId:state.projectId,datasetVersion:state.datasetVersion,baseline:state.baseline,calculationVersion:state.calculationVersion,provenance:state.provenance,workspace:state.workspace,exportedAt:new Date().toISOString(),meta:{cutoff:state.meta.cutoff,reportingMonth:state.meta.reportingMonth,projectLine:state.meta.projectLine,projectName:state.meta.projectName,title:state.meta.title,source:state.meta.source,report:state.meta.report},records:state.records,snapshots:state.snapshots,instruments:state.instruments,rfits:state.rfits,memos:state.memos,map:state.map,templates:state.templates};
  const clone=document.documentElement.cloneNode(true);
  clone.querySelector("#app").innerHTML="";
  for(const script of clone.querySelectorAll("script[src]")){const response=await fetch(script.getAttribute("src"));if(!response.ok)throw Error("Could not bundle offline briefing.");script.textContent=(await response.text()).replace(/\r\n?/g,"\n").replace(/<\/script/gi,"<\\/script");script.removeAttribute("src")}
  for(const link of clone.querySelectorAll('link[rel=stylesheet]')){const response=await fetch(link.getAttribute('href'));if(!response.ok)throw Error('Could not bundle application styles.');const style=document.createElement('style');style.textContent=await response.text();link.replaceWith(style)}
  clone.querySelectorAll("link[rel=manifest],link[rel=icon]").forEach(n=>n.remove());
  const json=document.createElement("script");json.type="application/json";json.id="briefing-data";json.textContent=JSON.stringify(data).replace(/</g,"\\u003c");
  clone.querySelector("script").before(json);
  // A self-contained briefing permits only its exact bundled script bytes.
  const policy=clone.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if(policy){const hashes=[];for(const node of clone.querySelectorAll('script:not([type="application/json"])')){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(node.textContent)));hashes.push("'sha256-"+btoa(String.fromCharCode(...bytes))+"'");}policy.setAttribute('content',"default-src 'none'; script-src "+hashes.join(' ')+"; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'");}
  const html="<!doctype html>\n"+clone.outerHTML;
  download(new Blob([html],{type:"text/html"}),"GT-Briefing-"+cutoff()+".html");
  notice="Read-only briefing exported ("+Math.round(html.length/1024)+" KB). Send that single file to the SOR.";render();
}

/* ---------- events ---------- */
let drag=null;
function pruneDrafts(){state.outbox=state.outbox.filter(d=>d.state!=="draft"||(byId(d.segmentId)&&draftChanges(d,byId(d.segmentId)).length))}
let persistSoon;
GTUI.on('click','app-base:click:1',async e=>{
  const sheetBtn=e.target.closest("[data-sheet]");if(sheetBtn){selected=sheetBtn.dataset.sheet;render();window.scrollTo(0,0);return}
  const regtab=e.target.closest("[data-regtab]");if(regtab){regTab=regtab.dataset.regtab;render();return}
  const mapBtn=e.target.closest("[data-map]:not(svg)");if(mapBtn){const a=mapBtn.dataset.map;if(a==="in")zoomMap(.7);else if(a==="out")zoomMap(1.4);else if(a==="full"){mapFull=!mapFull;render()}else if(a==="fit"){mapView=fitAll();redrawMap()}else if(a==="sel"){const r=byId(selected);if(r){mapView=fitBox([xyAt(r.from),xyAt(r.to)],.9,1500);redrawMap()}}return}
  const mapZone=e.target.closest("[data-map-zone]");if(mapZone){const rs=state.records.filter(r=>r.zone===mapZone.dataset.mapZone);if(rs.length&&geo()){mapView=fitBox(recPoints(rs),.15,800);redrawMap()}return}
  const dz=e.target.closest("[data-diagzone]");if(dz){diagZone=dz.dataset.diagzone;render();return}
  const ent=e.target.closest("[data-entry]");if(ent){entrySeg=ent.dataset.entry;render();window.scrollTo(0,0);return}
  const slq=e.target.closest("[data-slq]");if(slq){const [ctx,i,v]=slq.dataset.slq.split("|");setStage(ctx,Number(i),v==="NA"?"NA":Number(v)/100);const y=window.scrollY;render();window.scrollTo(0,y);return}
  const chip=e.target.closest("[data-chip]");if(chip){const [i,v]=chip.dataset.chip.split("|"),d=draftOf(entrySeg);if(d){d.stages[Number(i)].rating=v==="NA"?"NA":Number(v);d.state="draft";persistSoon();const y=window.scrollY;render();window.scrollTo(0,y)}return}
  const pd=e.target.closest("[data-photo-del]");if(pd){const d=draftOf(entrySeg);if(d){d.photos=d.photos.filter(p=>p.id!==pd.dataset.photoDel);persistSoon();render()}return}
  const oe=e.target.closest("[data-outedit]");if(oe){const d=state.outbox.find(x=>x.id===oe.dataset.outedit);if(d){d.state="draft";entrySeg=d.segmentId;page="Entry";render();window.scrollTo(0,0)}return}
  const od=e.target.closest("[data-outdel]");if(od){state.outbox=state.outbox.filter(x=>x.id!==od.dataset.outdel);persistSoon();render();return}
  const rv=e.target.closest("[data-rev]");if(rv){const [a,u]=rv.dataset.rev.split("|");decide(a,u);return}
  const rt=e.target.closest("[data-revtab]");if(rt){revTab=rt.dataset.revtab;render();return}
  const pageBtn=e.target.closest("[data-page]");if(pageBtn){goPage(pageBtn.dataset.page);render();window.scrollTo(0,0);return}
  const zoneBtn=e.target.closest("[data-zone]");if(zoneBtn){filterZone=zoneBtn.dataset.zone;page="Segments";render();return}
  const row=e.target.closest("[data-segment]");if(row){selected=row.dataset.segment;if(page==="Briefing")page=row.closest("svg.lane")?"Diagram":"Segments";render();return}
  const tab=e.target.closest("[data-tab]");if(tab){selectedTab=tab.dataset.tab;render();return}
  if(e.target.closest("[data-action='new-segment']")){addSegment();return}
  const remove=e.target.closest("[data-stage-remove]");if(remove){mutateStages("remove",Number(remove.dataset.stageRemove));return}
  const action=e.target.closest("[data-action]")?.dataset.action;if(!action)return;
  if(action==="dismiss"){notice="";render()}else if(action==="print"){window.print()}else if(action==="export"){exportData(false)}else if(action==="export-field"){exportData(true)}else if(action==="entry-back"){pruneDrafts();entrySeg="";render();window.scrollTo(0,0)}else if(action==="entry-save"){const d=draftOf(entrySeg);if(d){d.state="ready";d.savedAt=new Date().toISOString();notice="Saved to outbox. Send it from the Outbox page when you are ready.";entrySeg="";save();window.scrollTo(0,0)}}else if(action==="entry-discard"){if(confirm("Discard this draft?")){state.outbox=state.outbox.filter(x=>!(x.segmentId===entrySeg&&x.state!=="sent"));entrySeg="";save()}}else if(action==="send-packet"){sendPacket()}else if(action==="clear-sent"){state.outbox=state.outbox.filter(x=>x.state!=="sent");save()}else if(action==="accept-all"){acceptAll()}else if(action==="csv"){exportCsv()}else if(action==="snapshot"){snapshot()}else if(action==="add-stage"){mutateStages("add",0)}else if(action==="export-briefing"){exportBriefing()}
  else if(action==="save"){const r=byId(selected);if(!r.id||!Number.isFinite(r.from)||!Number.isFinite(r.to)||r.to<=r.from){notice="Check segment ID and ensure ending chainage is greater than starting chainage.";render();return}if(state.records.some(x=>x.id===r.id&&x!==r)){notice="That segment ID already exists.";render();return}if(!applyStages(r.id)){render();return}r.updatedAt=new Date().toISOString();const changes=diffRecord(editBase,r);state.audit.push({date:r.updatedAt,action:changes.length?"segment update":"saved, no changes",segmentId:r.id,user:r.updatedBy||"",changes});editBase=JSON.stringify(r);save()}
});
GTUI.on('keydown','app-base:keydown:2',e=>{if(e.key==="Enter"&&e.target.matches("tr[data-segment]"))e.target.click()});
GTUI.windowOn('beforeprint','app-base:beforeprint:2',()=>{if(!printing0){printing0=true;applyTheme();render()}});
GTUI.windowOn('afterprint','app-base:afterprint:3',()=>{if(printing0){printing0=false;render()}});
try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{if(theme==="auto")render()})}catch(e){}
GTUI.on('change','app-base:change:3',async e=>{
  {const k=e.target.dataset.sl||e.target.dataset.sln;if(k){if(k.startsWith("rec"))render();return}}
  if(e.target.dataset.input==="wbexport"){const f=e.target.files[0];e.target.value="";exportWorkbook(f);return}
  if(e.target.matches("[data-theme-sel]")){theme=e.target.value;try{localStorage.setItem("gt-theme",theme)}catch(_){}render();return}
  const t=e.target,inp=t.dataset.input;
  if(inp==="zone"){filterZone=t.value;render()}
  else if(inp==="xlsx"){await importWorkbook(t.files&&t.files[0]);t.value=""}
  else if(inp==="kml"){await importKml(t.files&&t.files[0]);t.value=""}
  else if(inp==="import"){await importJson(t.files&&t.files[0]);t.value=""}
  else if(inp==="cutoff"){if(t.value){state.meta.cutoff=t.value;persist().catch(()=>{})}render()}
  else if(inp==="colorBy"){colorBy=t.value;render()}
  else if(inp==="instType"){instType=t.value;render()}
  else if(inp==="instStatus"){instStatus=t.value;render()}
  else if(inp==="entryZone"){entryZone=t.value;render()}
  else if(inp==="rptSheets"){rptSheets=t.checked;render()}
  else if(inp==="packet"){await importPackets(t.files);t.value=""}
  else if(inp==="photo"){await addPhotos(t.files);t.value=""}
  else if(inp==="instGt"){instGt=t.checked;render()}
  else if(inp==="regOpen"){regOpen=t.checked;render()}
  else if(t.dataset.user){state.meta.user={...(state.meta.user||{}),[t.dataset.user]:t.value};persistSoon();render()}
  else if(t.dataset.report){state.meta.report={...(state.meta.report||{}),[t.dataset.report]:t.value};persistSoon()}
  else if(t.dataset.draft==="observedOn"){const d=draftOf(entrySeg);if(d){d.observedOn=t.value||todayISO();persistSoon()}}
  else if(t.dataset.inst){const d=draftOf(entrySeg);if(d){d.instruments=d.instruments||{};if(t.value)d.instruments[t.dataset.inst]=t.value;else delete d.instruments[t.dataset.inst];persistSoon();render()}}
  else if(t.dataset.rating!==undefined){setRating(selected,Number(t.dataset.rating),t.value);render()}
  else if(t.dataset.stageName!==undefined||t.dataset.stageWeight!==undefined){const r=byId(selected),i=Number(t.dataset.stageName??t.dataset.stageWeight);if(t.dataset.stageName!==undefined)r.stages[i].name=t.value;else r.stages[i].weight=Math.max(0,Number(t.value)||0)/100;render()}
  else if(t.dataset.field){selected=updateField(selected,t.dataset.field,t.value);render()}
});
GTUI.on('input','app-base:input:4',e=>{
  const slk=e.target.dataset.sl||e.target.dataset.sln;if(slk){const [ctx,i]=slk.split("|");if(e.target.value==="")return;const n=Math.max(0,Math.min(100,Math.round(Number(e.target.value))));if(!isFinite(n))return;setStage(ctx,Number(i),n/100);syncSl(ctx,Number(i),n/100);return}
  const inp=e.target.dataset.input;
  if(inp==="search"||inp==="regSearch"||inp==="instSearch"||inp==="entryQuery"){if(inp==="search")search=e.target.value;else if(inp==="regSearch")regSearch=e.target.value;else if(inp==="entryQuery")entryQuery=e.target.value;else instSearch=e.target.value;const pos=e.target.selectionStart;render();const next=app.querySelector(`[data-input="${inp}"]`);if(next){next.focus();next.setSelectionRange(pos,pos)}}
  else if(e.target.dataset.draft&&e.target.dataset.draft!=="observedOn"){const d=draftOf(entrySeg),r=byId(entrySeg);if(d&&r){d[e.target.dataset.draft]=e.target.value;persistSoon();const ch=draftChanges(d,r),b=app.querySelector("[data-action='entry-save']");if(b)b.disabled=!ch.length}}
  else if(e.target.dataset.photoCap){const d=draftOf(entrySeg),p=d&&d.photos.find(x=>x.id===e.target.dataset.photoCap);if(p){p.caption=e.target.value;persistSoon()}}
  else if(e.target.dataset.field&&e.target.dataset.field!=="id"&&e.target.dataset.field!=="type"){updateField(selected,e.target.dataset.field,e.target.value)}
});
GTUI.on('pointerdown','app-base:pointerdown:5',e=>{const svg=e.target.closest("svg[data-map]");if(!svg||e.target.closest(".hit"))return;drag={x:e.clientX,y:e.clientY,v:{...mapView},rect:svg.getBoundingClientRect(),moved:false};try{svg.setPointerCapture(e.pointerId)}catch(_){}});
GTUI.on('pointermove','app-base:pointermove:6',e=>{showTip(e);if(!drag)return;drag.moved=true;const svg=app.querySelector("svg[data-map]");if(!svg)return;const sc=Math.max(drag.v.w/drag.rect.width,drag.v.h/drag.rect.height);mapView={...drag.v,x:drag.v.x-(e.clientX-drag.x)*sc,y:drag.v.y-(e.clientY-drag.y)*sc};svg.setAttribute("viewBox",`${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`)});
const endDrag=()=>{const was=drag&&drag.moved;drag=null;if(was&&basemap!=="none")redrawMap()};GTUI.on('pointerup','app-base:pointerup:7',endDrag);GTUI.on('pointercancel','app-base:pointercancel:8',endDrag);
GTUI.on('wheel','app-base:wheel:9',e=>{const svg=e.target.closest("svg[data-map]");if(!svg)return;e.preventDefault();zoomMap(e.deltaY<0?.8:1.25,e.clientX,e.clientY)},{passive:false});

/* ---------- demo + start ---------- */
function demoData(){
  const mk=(id,zone,from,to,type,status,ratings,act,next,issue)=>({id,zone,from,to,type,gtType:type,status,activity:act,next,issue,stages:stageTemplate(type).map((s,i)=>({...s,rating:ratings[i]??0})),params:{},updatedBy:"Sample",lastUpdated:todayISO()});
  const rs=[
    mk("GT-01","Zone 1",1000,1250,"R&R","In Progress",[1,1,1,1,1,1,.5,0,"NA","NA"],"Backfill ongoing.","Complete embankment fill.","Instrument installation to be verified."),
    mk("GT-02","Zone 1",1250,1400,"R&R","Pre-construction",[1,1,0,0,0,0,0,0,"NA","NA"],"Not started.","Excavate USM.",""),
    mk("GT-03","Zone 1",2100,2600,"PVD","In Progress",[1,1,1,.5,0,0,0,0,0,0],"Drainage blanket in progress.","Trial PVD approval.","Shop drawing resubmission open."),
    mk("GT-04","Zone 2",3300,3330,"Piled Embankment","On Hold",[.5,1,.5,0,0,0,0,0],"Platform complete; works on hold.","Complete load test.","Pile design basis to be verified."),
    mk("GT-05","Zone 2",3900,4100,"Surcharge (PVD omitted)","In Progress",[1,1,"NA",0,"NA","NA",0,.5,0,0],"Fill to formation ongoing.","Place temporary surcharge.",""),
    mk("GT-06","Zone 2",4500,4560,"R&R","Under Review",[0,0,0,0,0,0,0,0,0,0],"Treatment requirement not confirmed.","Trial pits.","Under review."),
    mk("GT-07","Zone 2",5200,5300,"R&R","Omitted",[1,1,"NA","NA","NA",0,"NA","NA","NA","NA"],"Omitted by instruction.","None.","")
  ];
  return{...blankState(),records:rs,meta:{demo:true,projectName:"Sample project (fictional data)",cutoff:todayISO()}};
}

