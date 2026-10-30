(function(root){
  'use strict';
  const W=typeof module==='object'&&module.exports?require('./workspace.js'):root.GTWorkspace;
  const I=typeof module==='object'&&module.exports?require('./instrumentation.js'):root.GTInstrumentation;
  const C=typeof module==='object'&&module.exports?require('./calculations.js'):root.GTCalculations;
  const VERSION=2,PRODUCER='0.15.0-pages-test',MAX_BYTES=40*1024*1024,MAX_FILE_BYTES=57*1024*1024,ITERATIONS=600000;
  const kinds=['team','update','receipt','backup'];
  const clone=W.clone;
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const plain=o=>o&&typeof o==='object'&&!Array.isArray(o);
  const text=(v,max=20000)=>typeof v==='string'&&v.length<=max;
  const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:%+() /-]{0,250}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
  const integer=v=>Number.isSafeInteger(v)&&v>=1;
  const rating=v=>v==='NA'||(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1);
  const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
  const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const same=(a,b)=>W.canonical(a)===W.canonical(b);
  function safe(value,depth=0){check(depth<60,'Package nesting is too deep.');if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){check(!['constructor','prototype','__proto__'].includes(key),'Unsafe package property.');safe(item,depth+1);}}
  function unique(rows,key,label){check(Array.isArray(rows),label+' must be a list.');const seen=new Set();for(const row of rows){check(plain(row)&&id(row[key])&&!seen.has(row[key]),'Missing or duplicate '+label+' ID.');seen.add(row[key]);}}
  function only(o,keys){check(plain(o)&&Object.keys(o).every(key=>keys.includes(key)),'Unexpected package fields.');}
  const b64=bytes=>{let result='';for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return root.btoa(result);};
  function unb64(value,limit=MAX_BYTES+16){check(typeof value==='string'&&value.length<=Math.ceil(limit/3)*4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'Invalid or oversized base64 data.');const raw=root.atob(value);check(raw.length<=limit,'Decoded data is too large.');return Uint8Array.from(raw,c=>c.charCodeAt(0));}
  async function byteHash(bytes){return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  const hash=object=>W.digest(W.canonical(object));
  function photoBytes(photo){
    check(plain(photo)&&id(photo.id)&&text(photo.caption||'',2000),'Invalid photo identity/caption.');
    const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(photo.data||'');check(match,'Attachments must be embedded JPEG, PNG or WebP images.');
    const bytes=unb64(match[2],2*1024*1024);
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
    const webp=String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
    check((match[1]==='jpeg'&&jpeg)||(match[1]==='png'&&png)||(match[1]==='webp'&&webp),'Photo content does not match its declared image type.');
    if(photo.takenAt)check(iso(photo.takenAt),'Invalid photo date.');
    return bytes;
  }
  async function attach(photo){const bytes=photoBytes(photo);return {id:photo.id,caption:photo.caption||'',data:photo.data,takenAt:photo.takenAt||new Date().toISOString(),bytes:bytes.length,sha256:await byteHash(bytes)};}
  function scope(record){return {instrumentationBinding:record.instrumentationBinding?{mode:record.instrumentationBinding.mode,stageInternalId:record.instrumentationBinding.stageInternalId}:null,from:record.from,to:record.to,type:record.type,gtType:record.gtType||'',governing:record.governing||'',params:record.params||{},stages:record.stages.map(s=>({id:s.id,internalId:s.internalId||record.internalId+':'+s.id,name:s.name,weight:s.weight}))};}
  function authority(data){return data.authorityId||(data.workspace?.mode==='master'?data.workspace.id:null);}
  function header(data,kind,body){check(kind==='backup'||authority(data),'Reopen current team data from the RE before using controlled packages.');return {protocolVersion:VERSION,kind,packageId:W.uuid(),createdAt:new Date().toISOString(),producerVersion:PRODUCER,projectId:data.projectId,authorityId:authority(data)||'unassigned',baselineId:data.baseline?.id||'unassigned',calculationVersion:data.calculationVersion,datasetVersion:data.datasetVersion,sender:{name:data.meta.user?.name||'',role:data.meta.user?.role||'',workspaceId:data.workspace.id},body};}
  function identity(pkg,data){check(pkg.projectId===data.projectId,'Package belongs to another project.');check(pkg.baselineId===(data.baseline?.id||'unassigned'),'Package belongs to another baseline.');check(pkg.authorityId===(authority(data)||'unassigned'),'Package belongs to another master workspace.');check(pkg.calculationVersion===data.calculationVersion,'Calculation versions do not match.');}
  async function validate(pkg){
    check(plain(pkg),'Not a controlled tracker package.');safe(pkg);
    check(new TextEncoder().encode(JSON.stringify(pkg)).length<=MAX_BYTES,'Package exceeds the 40 MiB payload limit.');
    only(pkg,['protocolVersion','kind','packageId','createdAt','producerVersion','projectId','authorityId','baselineId','calculationVersion','datasetVersion','sender','body']);
    check([1,VERSION].includes(pkg.protocolVersion)&&kinds.includes(pkg.kind),'Unsupported package protocol or type.');check(pkg.kind!=='update'||pkg.protocolVersion===VERSION,'Legacy update protocol: refresh team data and rebase/resubmit with the current application.');
    for(const key of ['packageId','projectId','authorityId','baselineId'])check(id(pkg[key]),'Missing or invalid '+key+'.');
    check(iso(pkg.createdAt)&&text(pkg.producerVersion,80)&&integer(pkg.datasetVersion),'Invalid package timestamp/version.');
    check(pkg.calculationVersion===W.CALCULATION,'Unsupported calculation version.');
    check(plain(pkg.sender)&&id(pkg.sender.workspaceId)&&text(pkg.sender.name,200)&&text(pkg.sender.role,40),'Missing sender identity.');
    only(pkg.sender,['name','role','workspaceId']);
    if(pkg.kind==='team'||pkg.kind==='backup'){
      only(pkg.body,['dataset']);const d=W.validate(pkg.body.dataset);
      identity(pkg,d);check(d.datasetVersion===pkg.datasetVersion,'Dataset/package revisions disagree.');
      check(pkg.kind==='team'?d.kind==='gt-team-data'&&d.workspace.mode==='field':d.kind==='gt-local-backup','Wrong dataset kind in package.');
      if(pkg.kind==='team')check(!d.baselineSnapshot&&!d.meta.user&&!d.audit.length&&!d.inbox.length&&!d.outbox.length&&!d.processed.length&&!d.decisionQueue.length&&!d.exchange&&!d.reportArchive&&!d.reportOutputs&&!d.emergencyIssues,'Team package contains private workspace workflow data.');
      if(pkg.kind==='backup'&&d.reportArchive?.length){const reporting=root.GTReporting||(typeof module==='object'&&module.exports?require('./reporting.js'):null);check(reporting,'Reporting validation is unavailable.');for(const report of d.reportArchive){check(report.dataset.projectId===d.projectId&&authority(report.dataset)===authority(d),'Archived report belongs to another project or master.');await reporting.verify(report);}}
      if(pkg.kind==='backup'&&d.emergencyIssues?.length){unique(d.emergencyIssues,'id','emergency issue');for(const issue of d.emergencyIssues){check(issue.version===1&&issue.reference?.projectId===d.projectId&&authority(issue.reference)===authority(d)&&await hash(issue.reference)===issue.referenceHash,'Invalid emergency issue reference.');W.validate(issue.reference);}}
    }else if(pkg.kind==='update'){
      only(pkg.body,['items']);const items=pkg.body.items;unique(items,'uid','submission item');check(items.length>0&&items.length<=100,'An update must contain 1 to 100 items.');check(pkg.sender.name.trim(),'Update sender name is required.');
      for(const it of items){
        only(it,['uid','segmentId','segmentInternalId','observedOn','baseDatasetVersion','baseRecordRevision','baseScope','stages','text','instruments','photos','supersedesItemId']);
        check(id(it.segmentId)&&id(it.segmentInternalId)&&integer(it.baseRecordRevision)&&integer(it.baseDatasetVersion)&&it.baseDatasetVersion<=pkg.datasetVersion&&day(it.observedOn)&&it.observedOn<=W.projectDate(),'Invalid submission identity, revision or observation date.');
        if(it.supersedesItemId)check(id(it.supersedesItemId)&&it.supersedesItemId!==it.uid,'Invalid revised submission reference.');
        check(plain(it.baseScope)&&Array.isArray(it.baseScope.stages),'Missing base treatment scope.');unique(it.baseScope.stages,'id','base stage');
        for(const s of it.baseScope.stages)check(text(s.name,1000)&&typeof s.weight==='number'&&Number.isFinite(s.weight)&&s.weight>=0&&id(s.internalId),'Invalid base stage.');
        unique(it.stages,'internalId','changed stage');
        for(const s of it.stages){only(s,['id','internalId','name','base','value']);check(id(s.id)&&text(s.name,1000)&&rating(s.base)&&rating(s.value),'Invalid stage change.');check(it.baseScope.stages.some(base=>base.internalId===s.internalId&&base.id===s.id&&base.name===s.name),'Changed stage is absent from the base scope.');}
        check(plain(it.text)&&Object.keys(it.text).every(key=>['activity','next','issue'].includes(key)),'Only activity, next action and issues can be proposed.');
        for(const change of Object.values(it.text)){only(change,['base','value']);check(text(change.base)&&text(change.value),'Invalid text change.');}
        unique(it.instruments,'internalId','instrument change');
        for(const i of it.instruments){only(i,['id','internalId','base','value','baseControl']);check(plain(i.baseControl)&&I.INSTALLATION.includes(i.baseControl.installationState)&&I.CONDITION.includes(i.baseControl.condition)&&integer(i.baseControl.controlRevision),'Instrument control baseline is missing; refresh and rebase.');check(id(i.id)&&text(i.base,200)&&['Installed','Drilled','Replaced','Not installed','Not drilled','Damaged','To verify','Not Required'].includes(i.value),'Invalid instrument status change.');}
        unique(it.photos,'id','photo');check(it.photos.length<=6,'Maximum six photos per submission item.');
        for(const photo of it.photos){only(photo,['id','caption','data','takenAt','bytes','sha256']);const bytes=photoBytes(photo);check(photo.bytes===bytes.length&&photo.sha256===await byteHash(bytes),'Photo integrity check failed.');}
        check(it.stages.length||Object.keys(it.text).length||it.instruments.length||it.photos.length,'Empty submission item.');
      }
    }else{
      only(pkg.body,['recipientWorkspaceId','decisions']);check(id(pkg.body.recipientWorkspaceId),'Missing receipt recipient.');unique(pkg.body.decisions,'decisionId','decision');check(pkg.body.decisions.length>0&&pkg.body.decisions.length<=1000,'Invalid receipt size.');
      for(const d of pkg.body.decisions){only(d,['decisionId','submissionId','submissionHash','itemId','itemHash','status','note','reviewer','decidedAt','resultDatasetVersion','recipientWorkspaceId']);check(id(d.submissionId)&&id(d.itemId)&&/^[0-9a-f]{64}$/.test(d.submissionHash)&&/^[0-9a-f]{64}$/.test(d.itemHash),'Invalid receipt references.');check(['accepted','rejected','revision-requested'].includes(d.status)&&text(d.note,2000)&&text(d.reviewer,200)&&d.reviewer.trim()&&iso(d.decidedAt)&&integer(d.resultDatasetVersion)&&d.resultDatasetVersion<=pkg.datasetVersion&&d.recipientWorkspaceId===pkg.body.recipientWorkspaceId,'Invalid decision receipt.');}
    }
    return pkg;
  }
  async function key(password,salt){const material=await root.crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return root.crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  function cryptHeader(salt,iv){return {format:'gt-encrypted-package',version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,cipher:'AES-256-GCM',salt,iv};}
  async function seal(pkg,password){
    check(typeof password==='string'&&password.length>=12&&password.length<=1024,'Use a passphrase of at least 12 characters (maximum 1024).');await validate(pkg);
    const salt=root.crypto.getRandomValues(new Uint8Array(16)),iv=root.crypto.getRandomValues(new Uint8Array(12));
    const h=cryptHeader(b64(salt),b64(iv)),aad=new TextEncoder().encode(JSON.stringify(h));
    const encrypted=await root.crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},await key(password,salt),new TextEncoder().encode(JSON.stringify(pkg)));
    return JSON.stringify({...h,ciphertext:b64(new Uint8Array(encrypted))});
  }
  async function open(serialized,password){
    check(typeof serialized==='string'&&serialized.length<=MAX_FILE_BYTES,'Package file is too large.');
    check(typeof password==='string'&&password.length>0&&password.length<=1024,'Enter the package passphrase.');
    let box;try{box=JSON.parse(serialized);}catch{throw new Error('Invalid encrypted package file.');}
    only(box,['format','version','kdf','iterations','cipher','salt','iv','ciphertext']);
    check(box.format==='gt-encrypted-package'&&box.version===1&&box.kdf==='PBKDF2-SHA256'&&box.iterations===ITERATIONS&&box.cipher==='AES-256-GCM','Unsupported encryption envelope.');
    const salt=unb64(box.salt,16),iv=unb64(box.iv,12),ciphertext=unb64(box.ciphertext);check(salt.length===16&&iv.length===12&&ciphertext.length>=16,'Invalid encryption parameters.');
    let decoded;
    try{decoded=await root.crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(JSON.stringify(cryptHeader(box.salt,box.iv))),tagLength:128},await key(password,salt),ciphertext);}
    catch{throw new Error('Cannot decrypt: incorrect passphrase or damaged package.');}
    let pkg;try{pkg=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));}catch{throw new Error('Invalid decrypted package.');}
    return validate(pkg);
  }
  function ledger(data){data.exchange??={imports:[],exports:[],decisions:[],receipts:[]};for(const k of ['imports','exports','decisions','receipts'])data.exchange[k]??=[];return data.exchange;}
  function ensureMaster(data){check(data.workspace.mode==='master'&&data.baseline?.approvedAt,'An accepted master workspace is required.');}
  function currentRecord(data,it){return data.records.find(r=>r.internalId===it.segmentInternalId);}
  function makeDraft(data,record){return {id:W.uuid(),projectId:data.projectId,segmentId:record.id,segmentInternalId:record.internalId,baseDatasetVersion:data.datasetVersion,baseRecordRevision:record.revision,state:'draft',createdAt:new Date().toISOString(),observedOn:W.projectDate(),baseScope:clone(scope(record)),base:{lastUpdated:record.lastUpdated||'',stages:record.stages.map(s=>({id:s.id,internalId:s.internalId||record.internalId+':'+s.id,name:s.name,rating:s.rating})),activity:record.activity||'',next:record.next||'',issue:record.issue||'',instruments:data.instruments.filter(i=>i.segment===record.id).map(i=>({id:i.id,internalId:i.internalId,status:i.status,installationState:i.installationState,condition:i.condition,controlRevision:i.controlRevision}))},stages:record.stages.map(s=>({name:s.name,rating:s.rating})),activity:record.activity||'',next:record.next||'',issue:record.issue||'',instruments:{},photos:[]};}
  async function submission(data){
    check(data.workspace.mode==='field','Create field observations in a field workspace.');const drafts=data.outbox.filter(d=>d.state==='ready');check(drafts.length,'No updates are ready to send.');
    const items=[];
    for(const draft of drafts){
      check(draft.baseScope&&integer(draft.baseRecordRevision)&&id(draft.segmentInternalId),'An older draft needs comparison and rebasing before submission.');
      check(draft.projectId===data.projectId,'Draft belongs to another project.');
      const r=data.records.find(r=>r.internalId===draft.segmentInternalId);check(r,'Draft segment no longer exists.');check(same(scope(r),draft.baseScope),'Treatment scope changed. Compare and rebase this draft first.');
      check(Array.isArray(draft.stages)&&draft.stages.length===draft.base.stages.length,'Draft stages no longer match the base.');
      const changes=draft.stages.flatMap((s,i)=>{const base=draft.base.stages[i];return s.rating===base.rating?[]:[{id:base.id,internalId:base.internalId,name:base.name,base:base.rating,value:s.rating}];});
      check(!changes.some(s=>r.instrumentationBinding?.mode==='derived'&&s.internalId===r.instrumentationBinding.stageInternalId),'A linked instrumentation rating is derived. Reset the older manual proposal to its approved value, or ask the RE to select manual control.');
      const texts={};for(const field of ['activity','next','issue'])if((draft[field]||'')!==(draft.base[field]||''))texts[field]={base:draft.base[field]||'',value:draft[field]||''};
      const instruments=Object.entries(draft.instruments||{}).filter(([,v])=>v).map(([id,value])=>{const base=draft.base.instruments.find(i=>i.id===id);check(base,'Missing instrument baseline; rebase this draft.');check(integer(base.controlRevision),'Refresh team data and explicitly rebase older drafts before submission.');return {id,internalId:base.internalId,base:base.status,value,baseControl:{installationState:base.installationState,condition:base.condition,controlRevision:base.controlRevision}};}).filter(i=>i.base!==i.value);
      items.push({uid:draft.id,segmentId:draft.segmentId,segmentInternalId:draft.segmentInternalId,observedOn:draft.observedOn,baseDatasetVersion:draft.baseDatasetVersion,baseRecordRevision:draft.baseRecordRevision,baseScope:clone(draft.baseScope),stages:changes,text:texts,instruments,photos:await Promise.all((draft.photos||[]).map(attach)),...(draft.supersedesItemId?{supersedesItemId:draft.supersedesItemId}:{})});
    }
    const pkg=header(data,'update',{items});await validate(pkg);return pkg;
  }
  async function team(data){const dataset=W.team(data);dataset.authorityId=authority(data);delete dataset.exchange;const pkg=header(data,'team',{dataset});await validate(pkg);return pkg;}
  async function backup(data){const dataset=W.backup(data);dataset.authorityId=authority(data);const pkg=header(dataset,'backup',{dataset});await validate(pkg);return pkg;}
  async function receipt(data,recipient){ensureMaster(data);const decisions=ledger(clone(data)).decisions.filter(d=>d.recipientWorkspaceId===recipient);check(decisions.length,'No decisions for this field workspace.');const pkg=header(data,'receipt',{recipientWorkspaceId:recipient,decisions:clone(decisions)});await validate(pkg);return pkg;}
  function markExported(data,pkg,pkgHash,expectedDrafts=null){
    const next=clone(data),ex=ledger(next);identity(pkg,next);check(pkg.kind==='update','Not an update package.');
    if(ex.exports.some(e=>e.packageId===pkg.packageId)){check(ex.exports.find(e=>e.packageId===pkg.packageId).hash===pkgHash,'Export ID collision.');return next;}
    for(const item of pkg.body.items){const d=next.outbox.find(d=>d.id===item.uid);check(d?.state==='ready','A selected draft changed; rebuild the submission.');if(expectedDrafts)check(same(d,expectedDrafts.find(v=>v.id===d.id)),'Draft changed during encryption. Rebuild the submission.');d.state='sent';d.sentAt=pkg.createdAt;d.packetId=pkg.packageId;d.sentVia='encrypted-file';}
    ex.exports.push({packageId:pkg.packageId,hash:pkgHash,package:clone(pkg)});next.audit.push({date:new Date().toISOString(),action:'encrypted update package prepared',packageId:pkg.packageId,user:pkg.sender.name});return next;
  }
  function ingest(data,pkg,pkgHash){
    ensureMaster(data);identity(pkg,data);check(pkg.kind==='update','Choose an update package.');const next=clone(data),ex=ledger(next);
    const prior=ex.imports.find(e=>e.packageId===pkg.packageId);if(prior){check(prior.hash===pkgHash,'Package ID collision: content differs from an earlier import.');return {data:next,duplicates:pkg.body.items.length,added:0};}
    let added=0,duplicates=0;
    for(const item of pkg.body.items){const old=next.inbox.find(e=>e.uid===item.uid);if(old){check(same(old.item,item)&&old.from.workspaceId===pkg.sender.workspaceId,'Submission ID collision: an item was changed or reused.');duplicates++;continue;}
      check(!next.processed.includes(item.uid),'This item ID was already processed by an older workflow.');
      if(item.supersedesItemId){const old=next.inbox.find(e=>e.uid===item.supersedesItemId);check(old&&['rejected','revision-requested'].includes(old.state)&&old.from.workspaceId===pkg.sender.workspaceId&&old.item.segmentInternalId===item.segmentInternalId,'Revised item does not match a rejected/requested-revision submission.');}
      check(currentRecord(next,item),'Submission refers to an unknown internal segment.');
      next.inbox.push({controlled:true,protocolVersion:pkg.protocolVersion,uid:item.uid,packetId:pkg.packageId,packageHash:pkgHash,from:clone(pkg.sender),createdAt:pkg.createdAt,baseDatasetVersion:pkg.datasetVersion,item:clone(item),state:'pending'});added++;
    }
    ex.imports.push({packageId:pkg.packageId,hash:pkgHash,kind:pkg.kind,at:new Date().toISOString()});next.audit.push({date:new Date().toISOString(),action:'controlled update imported',packageId:pkg.packageId,items:added,user:data.meta.user?.name||''});return {data:next,added,duplicates};
  }
  function diff(data,entry){
    const it=entry.item,r=currentRecord(data,it),rows=[],conflicts=[],blocking=[];
    if(entry.controlled&&entry.protocolVersion!==VERSION)return {rows,conflicts,blocking:['Legacy pending item: request a new submission using the current application and refreshed team data.'],stale:true};
    if(!entry.controlled)return {rows,conflicts,blocking:['Legacy packet: use a new controlled submission.'],stale:true};
    if(!r)return {rows,conflicts,blocking:['Segment no longer exists.'],stale:true};
    if(!same(scope(r),it.baseScope))blocking.push('Treatment scope, design or stage template changed. Request a revised submission.');
    const add=(label,base,current,value)=>{const conflict=!same(current,base)&&!same(current,value);rows.push({label,base,current,value,conflict});if(conflict)conflicts.push(label);};
    for(const s of it.stages){const current=r.stages.find(st=>(st.internalId||r.internalId+':'+st.id)===s.internalId);if(!current)blocking.push('Stage removed: '+s.name);else add(s.name,s.base,current.rating,s.value);}
    for(const [field,change] of Object.entries(it.text))add(field,change.base,r[field]||'',change.value);
    for(const i of it.instruments){const current=data.instruments.find(ins=>ins.internalId===i.internalId);if(!current||current.segment!==r.id)blocking.push('Instrument missing or moved: '+i.id);else {add(i.id,i.base,current.status,i.value);if(I.needsMaster(current,i.value))blocking.push('Installation reversal or applicability change for '+i.id+' requires a master edit and reason.');if(i.baseControl){const base={installationState:i.baseControl.installationState,condition:i.baseControl.condition},now={installationState:current.installationState,condition:current.condition};if(!same(base,now))add(i.id+' controls',base,now,I.statusProposal(current,i.value));}}}
    for(const photo of it.photos){const prior=(r.photos||[]).find(p=>p.id===photo.id);if(prior&&prior.data!==photo.data)blocking.push('Photo ID has different existing evidence: '+photo.id);}
    if(r.instrumentationBinding?.mode==='derived'){if(it.stages.some(s=>s.internalId===r.instrumentationBinding.stageInternalId))blocking.push('Linked instrumentation completion cannot be changed as a manual stage proposal.');const predicted=I.preview(data,r,Object.fromEntries(it.instruments.map(i=>[i.id,i.value]))),before=r.stages.find(s=>s.internalId===r.instrumentationBinding.stageInternalId),after=predicted.stages.find(s=>s.internalId===r.instrumentationBinding.stageInternalId);if(before.rating!==after.rating)add(before.name+' (derived installation)',before.rating,before.rating,after.rating);}
    return {record:r,rows,conflicts,blocking,stale:it.baseDatasetVersion!==data.datasetVersion||it.baseRecordRevision!==r.revision};
  }
  function decide(data,uid,status,{note='',acknowledge=false,reviewer=data.meta.user?.name||'',decisionId=W.uuid(),itemHash}={}){
    ensureMaster(data);check(['accepted','rejected','revision-requested'].includes(status),'Invalid review decision.');check(text(reviewer,200)&&reviewer.trim(),'Enter the reviewer name in Workspace/Entry.');check(text(note,2000),'Review comment is too long.');
    const next=clone(data),entry=next.inbox.find(e=>e.uid===uid);check(entry?.controlled,'Controlled submission item not found.');
    if(entry.state!=='pending')return next;
    const comparison=diff(next,entry);check(status==='accepted'||note.trim(),'Give a reason for rejection or requested revision.');
    if(status==='accepted'){
      check(!comparison.blocking.length,comparison.blocking.join(' '));check(!comparison.conflicts.length||(acknowledge&&note.trim()),'Acknowledge conflicting values and give a reason before accepting.');
      const r=comparison.record,it=entry.item;
      for(const s of it.stages)r.stages.find(st=>(st.internalId||r.internalId+':'+st.id)===s.internalId).rating=s.value;
      for(const [field,change] of Object.entries(it.text))r[field]=change.value;
      let installationChanged=false;for(const i of it.instruments){const current=next.instruments.find(ins=>ins.internalId===i.internalId);installationChanged=I.applyStatus(current,i.value)||installationChanged;current.appUpdated=true;}
      if(installationChanged)I.recalculate(next,r.id);
      r.photos??=[];for(const photo of it.photos)if(!r.photos.some(p=>p.id===photo.id))r.photos.push({...clone(photo),date:it.observedOn,by:entry.from.name,submissionId:entry.packetId});
      r.observations??=[];r.observations.push({itemId:it.uid,submissionId:entry.packetId,observedOn:it.observedOn,submittedAt:entry.createdAt,reviewedAt:new Date().toISOString(),by:entry.from.name,changes:clone({stages:it.stages,text:it.text,instruments:it.instruments}),photoIds:it.photos.map(p=>p.id)});
      const progress=C.progress(r);if(progress!==null){if(progress>=.9995)r.status='Completed';else if(r.status==='Completed')r.status=progress>0?'In Progress':'Not Started';else if(progress>0&&['Not Started','Pre-construction'].includes(r.status))r.status='In Progress';}
      r.lastUpdated=r.lastUpdated&&r.lastUpdated>it.observedOn?r.lastUpdated:it.observedOn;r.updatedBy=entry.from.name;r.updatedAt=new Date().toISOString();r.appUpdated=true;
    }
    entry.state=status;entry.decidedAt=new Date().toISOString();entry.reviewNote=note;
    if(!next.processed.includes(uid))next.processed.push(uid);
    const predicted=W.prepareSave(next,data).datasetVersion;
    const decision={decisionId,submissionId:entry.packetId,submissionHash:entry.packageHash,itemId:uid,itemHash,status,note,reviewer:reviewer.trim(),decidedAt:entry.decidedAt,resultDatasetVersion:predicted,recipientWorkspaceId:entry.from.workspaceId};
    check(/^[0-9a-f]{64}$/.test(itemHash||''),'Missing item fingerprint.');
    ledger(next).decisions.push(decision);entry.receipt=clone(decision);next.audit.push({date:entry.decidedAt,action:'controlled update '+status,segmentId:entry.item.segmentId,segmentInternalId:entry.item.segmentInternalId,itemId:uid,packageId:entry.packetId,user:reviewer.trim(),note,conflictOverride:comparison.conflicts.length>0&&status==='accepted'});
    return next;
  }
  function applyReceipt(data,pkg,pkgHash){
    identity(pkg,data);check(data.workspace.mode==='field'&&pkg.kind==='receipt','Open receipts in a field workspace.');check(pkg.body.recipientWorkspaceId===data.workspace.id,'Receipt belongs to another field workspace.');
    const next=clone(data),ex=ledger(next);const prior=ex.imports.find(e=>e.packageId===pkg.packageId);if(prior){check(prior.hash===pkgHash,'Receipt package ID collision.');return next;}
    for(const decision of pkg.body.decisions){
      const exported=ex.exports.find(e=>e.packageId===decision.submissionId);check(exported&&exported.hash===decision.submissionHash,'Receipt does not match a submission exported by this workspace.');
      const item=exported.package.body.items.find(it=>it.uid===decision.itemId);check(item,'Receipt references an unknown item.');
      const old=ex.receipts.find(d=>d.decisionId===decision.decisionId);if(old){check(same(old,decision),'Decision ID collision.');continue;}
      check(!ex.receipts.some(d=>d.itemId===decision.itemId),'A different final decision already exists for this item.');
      ex.receipts.push(clone(decision));const draft=next.outbox.find(d=>d.id===decision.itemId);if(draft)draft.review={status:decision.status,note:decision.note,reviewer:decision.reviewer,decidedAt:decision.decidedAt};
    }
    ex.imports.push({packageId:pkg.packageId,hash:pkgHash,kind:'receipt',at:new Date().toISOString()});next.audit.push({date:new Date().toISOString(),action:'review receipt imported',packageId:pkg.packageId,user:data.meta.user?.name||''});return next;
  }
  async function verifyReceiptReferences(data,pkg){for(const d of pkg.body.decisions){const source=ledger(clone(data)).exports.find(e=>e.packageId===d.submissionId);const item=source?.package.body.items.find(it=>it.uid===d.itemId);check(item&&await hash(item)===d.itemHash,'Receipt item fingerprint does not match the original submission.');}}
  const reference=d=>W.canonical([d.records,d.instruments,d.rfits,d.memos,d.actions||[],d.templates,d.snapshots,d.map,d.meta.cutoff]);
  function refresh(data,pkg,pkgHash){
    check(data.workspace.mode==='field'&&pkg.kind==='team','Only field workspaces can refresh team reference data.');identity(pkg,data);check(pkg.datasetVersion>=data.datasetVersion,'Older team data cannot replace newer reference data.');const source=W.migrate(pkg.body.dataset);
    check(pkg.datasetVersion>data.datasetVersion||reference(source)===reference(data),'Same revision contains different reference records. Ask the RE to issue a new revision.');
    const next=clone(data),ex=ledger(next),prior=ex.imports.find(e=>e.packageId===pkg.packageId);
    if(prior){check(prior.hash===pkgHash,'Team package ID collision.');return next;}
    for(const key of ['records','instruments','rfits','memos','actions','templates','snapshots','map'])next[key]=clone(source[key]??(key==='actions'?[]:null));
    next.meta={...clone(source.meta),user:clone(data.meta.user||{})};next.datasetVersion=pkg.datasetVersion;
    ex.imports.push({packageId:pkg.packageId,hash:pkgHash,kind:'team',at:new Date().toISOString()});next.audit.push({date:new Date().toISOString(),action:'team references refreshed; local drafts and history retained',packageId:pkg.packageId,user:data.meta.user?.name||''});return next;
  }
  function rebase(data,draftId){const next=clone(data),old=next.outbox.find(d=>d.id===draftId);check(old&&old.state!=='sent','Only unsent drafts can be rebased.');const r=next.records.find(r=>r.internalId===old.segmentInternalId)||next.records.find(r=>r.id===old.segmentId);check(r,'Segment no longer exists.');const fresh=makeDraft(next,r);fresh.id=old.id;fresh.observedOn=old.observedOn;fresh.photos=clone(old.photos||[]);fresh.instruments=Object.fromEntries(Object.entries(old.instruments||{}).filter(([id])=>fresh.base.instruments.some(i=>i.id===id)));for(const field of ['activity','next','issue'])fresh[field]=old[field]||'';fresh.stages=fresh.stages.map(s=>({...s,rating:(old.stages||[]).find(v=>v.name===s.name)?.rating??s.rating}));next.outbox[next.outbox.indexOf(old)]=fresh;next.audit.push({date:new Date().toISOString(),action:'draft explicitly rebased for comparison',itemId:draftId,user:data.meta.user?.name||''});return next;}
  const api={VERSION,PRODUCER,MAX_BYTES,MAX_FILE_BYTES,ITERATIONS,validate,seal,open,hash,identity,scope,authority,makeDraft,submission,team,backup,receipt,ledger,markExported,ingest,diff,decide,applyReceipt,verifyReceiptReferences,refresh,rebase};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.GTPackages=api;
})(typeof window==='object'?window:globalThis);
