(function(root){
  'use strict';
  const W=typeof module==='object'&&module.exports?require('./workspace.js'):root.GTWorkspace;
  const I=typeof module==='object'&&module.exports?require('./instrumentation.js'):root.GTInstrumentation;
  const keys={instruments:'id',rfits:'no',memos:'ref',actions:'id'};
  const allowed={instruments:['id','segment','type','status','installationState','condition','controlReason','chainage','offset','latestDate','remarks'],rfits:['no','subject','issued','responded','status','segments','chainage','reference','response','effect','followUp','owner','due'],memos:['ref','subject','date','fromTo','status','segments','chainage','content','effect','followUp','owner','due'],actions:['id','subject','status','segments','owner','due','closedOn','followUp']};
  function check(ok,message){if(!ok)throw Error(message);}
  function day(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
  function master(data){check(data.workspace?.mode==='master','Register and scope changes belong in the master workspace.');check(data.meta.user?.name?.trim(),'Enter your name in Workspace before saving.');}
  function audit(data,action,detail){data.audit.push({date:new Date().toISOString(),action,user:data.meta.user.name,...detail});}
  function saveRegister(input,kind,values,internalId=null,expected=null){
    const data=W.clone(input);master(data);check(keys[kind],'Unknown register.');data[kind]??=[];
    const old=internalId?data[kind].find(r=>r.internalId===internalId):null;check(!internalId||old,'The register item no longer exists.');
    if(old&&expected!==null)check(W.canonical(old)===expected,'This item changed while the editor was open. Reopen it before saving.');
    check(Object.keys(values).every(k=>allowed[kind].includes(k)),'Unsupported register field.');
    const item={...old,...W.clone(values)},key=keys[kind];item[key]=String(item[key]||'').trim();
    check(/^[\w][\w .+/:()\-]{0,159}$/.test(item[key]),'Enter a reference using letters, numbers, spaces or . + / : ( ) - .');
    check(!data[kind].some(r=>r.internalId!==internalId&&r[key]===item[key]),'That reference already exists.');
    for(const [k,v] of Object.entries(values)){if(typeof v==='string')check(v.length<=10000,'A register field is too long.');if(['issued','responded','date','latestDate','due','closedOn'].includes(k)&&v)check(day(v),'Enter a valid '+k+' date.');}
    if(kind==='instruments'){
      check(item.type?.trim()&&item.status?.trim(),'Enter instrument type and status.');
      check(data.records.some(r=>r.id===item.segment)||old?.segment===item.segment,'Select a valid segment.');
      if(item.chainage!=null&&item.chainage!=='')check(Number.isFinite(Number(item.chainage))&&Number(item.chainage)>=0,'Enter a valid chainage in metres.');
      item.chainage=item.chainage==null||item.chainage===''?'':Number(item.chainage);
      check(!old||item.id===old.id||!data.outbox.some(d=>d.instruments?.[old.id])&&!data.inbox.some(e=>e.state==='pending'&&e.item?.instruments?.some(i=>i.id===old.id)),'Resolve outstanding instrument submissions before renaming its reference.');
      I.masterControls(item,values,old);
    }else{
      check(item.subject?.trim(),'Enter a subject.');check(Array.isArray(item.segments)&&item.segments.every(id=>data.records.some(r=>r.id===id)),'Select valid associated segments.');
      item.segments=[...new Set(item.segments)];item.segmentsText=item.segments.join(', ');
      if(kind==='actions')check(item.owner?.trim()&&item.due,'Assign an owner and due date.');
      if(item.issued&&item.responded)check(item.responded>=item.issued,'Response date cannot precede issue date.');
    }
    item.internalId=old?.internalId||W.uuid();item.revision=(old?.revision||0)+1;item.updatedAt=new Date().toISOString();item.updatedBy=data.meta.user.name;
    if(old)data[kind][data[kind].indexOf(old)]=item;else data[kind].push(item);
    if(kind==='instruments'&&(!old||old.installationState!==item.installationState||old.segment!==item.segment))for(const segment of new Set([old?.segment,item.segment]))I.recalculate(data,segment);
    audit(data,(old?'updated ':'created ')+kind,{reference:item[key],recordInternalId:item.internalId,before:old||null,after:W.clone(item)});return W.validate(data);
  }
  function saveSegment(input,values,internalId=null,expected=null){
    const data=W.clone(input);master(data);const old=internalId?data.records.find(r=>r.internalId===internalId):null;
    check(!internalId||old,'The segment no longer exists.');if(old&&expected)check(W.canonical(old)===expected,'The segment changed while editing. Reopen it before saving.');
    const fields=['id','zone','from','to','type','status','scopeNote','instrumentationBinding','activity','next','issue','stages','lastUpdated','commenced','completed','surchargePlaced','plannedRemoval','loadTestDate','loadTestResult','slabCast','pilesDone','pilesReq','newPhotos'];
    check(Object.keys(values).every(k=>fields.includes(k)),'Unsupported segment field.');
    const prior=old?W.clone(old):null,record={...old,...W.clone(values)};record.id=String(record.id||'').trim();
    check(/^[A-Za-z0-9][A-Za-z0-9.+_\-]{0,79}$/.test(record.id),'Enter a valid segment code.');check(record.zone?.trim()&&record.type?.trim(),'Enter a zone and treatment.');
    check(!data.records.some(r=>r.internalId!==internalId&&(r.id===record.id||r.previousIds?.includes(record.id))),'That segment code already exists or was previously used.');
    for(const field of ['lastUpdated','commenced','completed','surchargePlaced','plannedRemoval','loadTestDate','slabCast'])if(record[field])check(day(record[field]),'Enter a valid '+field+' date.');
    check(!record.lastUpdated||record.lastUpdated<=W.projectDate(),'Observation date cannot be in the future.');
    if(record.commenced&&record.completed)check(record.completed>=record.commenced,'Completion cannot precede commencement.');
    for(const field of ['pilesDone','pilesReq'])if(record[field]!==''&&record[field]!=null)check(Number.isInteger(Number(record[field]))&&Number(record[field])>=0,'Pile counts must be non-negative whole numbers.');
    if(record.pilesDone!==''&&record.pilesReq!==''&&record.pilesDone!=null&&record.pilesReq!=null)check(Number(record.pilesDone)<=Number(record.pilesReq),'Completed piles cannot exceed required piles.');
    check(record.stages?.length&&record.stages.every(s=>s.name?.trim()),'Name every construction stage.');
    const sum=record.stages.reduce((n,s)=>n+Number(s.weight),0);check(Number.isFinite(sum)&&sum>0&&record.stages.every(s=>Number(s.weight)>=0),'Enter positive stage weights.');
    record.internalId=old?.internalId||W.uuid();record.revision=old?.revision||1;
    check(record.from!==''&&record.to!=='','Enter both chainages.');record.from=Number(record.from);record.to=Number(record.to);check(record.from>=0,'Starting chainage cannot be negative.');
    record.stages=record.stages.map(s=>({...s,id:s.id||W.uuid(),internalId:s.internalId||W.uuid(),weight:Number(s.weight)/sum}));
    record.instrumentationBinding=old?I.binding({...record,instrumentationBinding:old.instrumentationBinding},values.instrumentationBinding||old.instrumentationBinding,record.scopeNote):I.binding(record,values.instrumentationBinding||I.initialBinding(record),record.scopeNote);
    if(old&&record.instrumentationBinding.mode==='derived'&&old.instrumentationBinding.mode==='derived'&&record.instrumentationBinding.stageInternalId===old.instrumentationBinding.stageInternalId){const id=record.instrumentationBinding.stageInternalId;check(record.stages.find(s=>s.internalId===id).rating===old.stages.find(s=>s.internalId===id).rating,'Switch to manual stage control before overriding a linked instrumentation rating.');}
    const scope=r=>W.canonical([r.from,r.to,r.type,r.stages.map(s=>[s.internalId,s.name,s.weight])]);
    if(old&&scope(old)!==scope(record))check(record.scopeNote?.trim(),'Record the instruction or reason for changing treatment, chainage or stages.');
    if(old&&old.id!==record.id){W.renameSegment(data,old.id,record.id);record.previousIds=[...old.previousIds];}
    const added=record.newPhotos||[];check(Array.isArray(added)&&added.length<=6,'Add at most six photographs per save.');
    record.photos=[...(old?.photos||[])];for(const p of added){check(p.id&&!record.photos.some(v=>v.id===p.id)&&typeof p.caption==='string'&&p.caption.trim()&&day(p.date)&&p.date<=W.projectDate(),'Give each new photo a caption and valid date.');check(typeof p.data==='string'&&p.data.length<2800000,'Photo exceeds the 2 MiB evidence limit.');record.photos.push({...p,takenAt:p.date+'T12:00:00+08:00',by:data.meta.user.name});}delete record.newPhotos;
    record.updatedBy=data.meta.user.name;record.updatedAt=new Date().toISOString();record.appUpdated=true;
    if(old)data.records[data.records.findIndex(r=>r.internalId===internalId)]=record;else data.records.push(record);
    const summary=r=>{if(!r)return null;const {photos,...fields}=r;return {...fields,photoReferences:(photos||[]).map(({data,...p})=>p)};};
    audit(data,old?'master segment updated':'segment created',{segmentId:record.id,segmentInternalId:record.internalId,before:summary(prior),after:summary(record)});
    return W.validate(data);
  }
  function coverage(data,asAt=W.projectDate(),days=7){const active=data.records.filter(r=>!['Omitted','Not Required','Under Review'].includes(r.status));const floor=new Date(asAt+'T00:00:00Z');floor.setUTCDate(floor.getUTCDate()-Math.max(0,days-1));const since=floor.toISOString().slice(0,10);const recent=active.filter(r=>r.lastUpdated&&r.lastUpdated.slice(0,10)>=since&&r.lastUpdated.slice(0,10)<=asAt);return {active,recent,stale:active.filter(r=>!recent.includes(r)),since,asAt};}
  const api={saveRegister,saveSegment,coverage,day,keys,allowed};if(typeof module==='object'&&module.exports)module.exports=api;else root.GTOperations=api;
})(typeof window==='object'?window:globalThis);
