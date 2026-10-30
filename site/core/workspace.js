(function (root) {
  'use strict';
  const SCHEMA = 4;
  const I=typeof module==='object'&&module.exports?require('./instrumentation.js'):root.GTInstrumentation;
  const MIGRATIONS=Object.freeze([{from:[1,2],to:3,id:'stable-identities-v3'},{from:[3],to:4,id:'instrument-controls-v4'}]);
  const CALCULATION = 'stage-length-v1';
  const arrays = ['records', 'snapshots', 'audit', 'instruments', 'rfits', 'memos', 'actions', 'outbox', 'inbox', 'processed', 'decisionQueue'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  const uuid = () => root.crypto.randomUUID();
  const projectDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function photo(photo) {
    assert(photo && typeof photo.data === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(photo.data), 'Photo must be a local JPEG, PNG or WebP image.');
  }
  function unique(rows, key, label) {
    const seen = new Set();
    for (const row of rows) { assert(row && typeof row[key] === 'string' && row[key].trim(), label+' needs an ID.'); assert(!seen.has(row[key]), 'Duplicate '+label+' ID: '+row[key]); seen.add(row[key]); }
  }
  function validate(data) {
    assert(data && typeof data === 'object' && !Array.isArray(data), 'Not a tracker data object.');
    assert([1,2,3,SCHEMA].includes(data.schemaVersion), 'Unsupported data schema. Use a compatible app version.');
    assert(Array.isArray(data.records) && data.records.length > 0, 'The package contains no segments.');
    for (const key of arrays) if (data[key] !== undefined) assert(Array.isArray(data[key]), key+' must be a list.');
    for(const key of ['reportArchive','reportOutputs','emergencyIssues'])if(data[key]!==undefined)assert(Array.isArray(data[key]),key+' must be a list.');
    if(data.reportArchive?.length){unique(data.reportArchive,'id','archived report');for(const report of data.reportArchive){assert(report.version===1&&/^[0-9a-f]{64}$/.test(report.sha256)&&report.dataset&&!report.dataset.reportArchive?.length,'Invalid report archive.');validate(report.dataset);}}
    assert(data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta), 'Missing project metadata.');
    if(data.meta.cutoff)assert(typeof data.meta.cutoff==='string' && /^\d{4}-\d{2}-\d{2}$/.test(data.meta.cutoff) && !Number.isNaN(Date.parse(data.meta.cutoff+'T00:00:00Z')) && new Date(data.meta.cutoff+'T00:00:00Z').toISOString().slice(0,10)===data.meta.cutoff,'Invalid reporting cut-off date.');
    unique(data.records, 'id', 'segment');
    for (const record of data.records) {
      assert(record.from!==null && record.to!==null && record.from!=='' && record.to!=='' && Number.isFinite(Number(record.from)) && Number.isFinite(Number(record.to)) && Number(record.to)>Number(record.from), 'Invalid chainage for '+record.id);
      assert(Array.isArray(record.stages) && record.stages.length, 'Missing stages for '+record.id);
      unique(record.stages, 'id', 'stage');
      const identifiedStages=record.stages.filter(s=>s.internalId!=null);if(identifiedStages.length)unique(identifiedStages,'internalId','internal stage');
      assert(record.stages.some(s=>Number(s.weight)>0), 'No positive stage weights for '+record.id);
      for (const stage of record.stages) assert(typeof stage.name==='string' && Number.isFinite(Number(stage.weight)) && Number(stage.weight)>=0 && (stage.rating==='NA' || (typeof stage.rating==='number' && Number.isFinite(stage.rating) && stage.rating>=0 && stage.rating<=1)), 'Invalid stage for '+record.id);
    }
    for (const [key,id] of [['instruments','id'],['rfits','no'],['memos','ref'],['actions','id']]) unique(data[key]||[],id,key);
    if(data.map){
      assert(Array.isArray(data.map.pts)&&data.map.pts.length>=2&&data.map.pts.length<=100000,'Invalid alignment point list.');
      data.map.pts.forEach((p,i)=>assert(Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n))&&p[0]>=0&&p[1]>=-180&&p[1]<=180&&p[2]>=-90&&p[2]<=90&&(!i||p[0]>data.map.pts[i-1][0]),'Invalid or unordered alignment coordinate.'));
      assert(Array.isArray(data.map.marks),'Invalid alignment markers.');
      for(const mark of data.map.marks)assert(mark&&typeof mark.name==='string'&&Number.isFinite(mark.lon)&&Number.isFinite(mark.lat)&&Math.abs(mark.lon)<=180&&Math.abs(mark.lat)<=90,'Invalid alignment marker.');
    }
    for(const snapshot of data.snapshots||[]){assert(snapshot&&typeof snapshot.date==='string'&&!Number.isNaN(Date.parse(snapshot.date)),'Invalid snapshot date.');if(snapshot.segments)for(const value of Object.values(snapshot.segments))assert(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1,'Invalid snapshot progress.');}
    if (data.schemaVersion >= 3) {
      assert(typeof data.projectId==='string' && data.projectId.trim(), 'Missing project identity.');
      assert(Number.isInteger(data.datasetVersion) && data.datasetVersion>=1, 'Invalid dataset revision.');
      assert(data.calculationVersion===CALCULATION, 'Unsupported calculation version.');
      assert(data.workspace && typeof data.workspace.id==='string' && ['master','field'].includes(data.workspace.mode), 'Missing workspace identity or mode.');
      unique(data.records,'internalId','internal segment');
      assert(Number.isInteger(data.workspace.storageRevision) && data.workspace.storageRevision>=0,'Invalid local save revision.');
    }
    // Imported data can reach image HTML through several views; reject unsafe URLs everywhere.
    const visit = (value, depth=0) => {
      assert(depth<60, 'Package nesting is too deep.');
      if (!value || typeof value!=='object') return;
      for (const [key,item] of Object.entries(value)) {
        assert(!['__proto__','prototype','constructor'].includes(key), 'Unsafe package property.');
        if(['savedAt','lastExportAt','createdAt','observedOn','lastUpdated','updatedAt','sentAt','decidedAt','approvedAt','lastSavedAt','exportedAt'].includes(key) && item!=null && item!=='')assert(typeof item==='string' && !Number.isNaN(Date.parse(item)), 'Invalid '+key+' date.');
        if (key==='photos') { assert(Array.isArray(item),'Photos must be a list.'); item.forEach(photo); }
        if (item && typeof item==='object') visit(item,depth+1);
      }
    };
    visit(data);
    if(data.schemaVersion===4)I.validate(data);
    return data;
  }
  function migrateLegacy(input, options={}) {
    const data = clone(input);
    data.schemaVersion ??= 1;
    data.meta ??= {};
    for (const key of arrays) data[key] ??= [];
    data.templates??=null;data.map??=null;
    // Normalize legacy tuple stages without changing their weights or ratings.
    for (const record of data.records) {
      for(const field of ['activity','next','issue'])record[field]??='';
      record.zone ||= 'Zone 1';record.type ||= 'R&R';record.status ||= 'Not Started';
      const stages = record.stages?.length ? record.stages : (data.templates?.[record.type] || options.templates?.[record.type] || []);
      record.stages = stages.map((s,i)=>Array.isArray(s)?{id:'s'+(i+1),name:s[0],weight:s[1],rating:record.ratings?.[i]??0}:{...s,id:s.id||'s'+(i+1),rating:s.rating??record.ratings?.[i]??0});
      delete record.ratings;
    }
    validate(data);
    for(const record of data.records){record.from=Number(record.from);record.to=Number(record.to);for(const stage of record.stages){stage.weight=Number(stage.weight);if(record.internalId)stage.internalId ||= record.internalId+':'+stage.id;}}
    if (data.schemaVersion>=3) {if(data.workspace.mode==='master')data.authorityId ||= data.workspace.id;return data;}
    data.projectId ||= 'legacy-'+uuid();
    data.datasetVersion ||= 1;
    data.calculationVersion = CALCULATION;
    data.baseline ||= data.meta.baselineId ? {id:data.meta.baselineId,status:'legacy-import',approvedAt:null,approvedBy:null} : null;
    data.provenance ||= {source:data.meta.source||'',sourceHashes:[],migration:'legacy-v'+data.schemaVersion};
    data.workspace ||= {id:uuid(),mode:options.mode||'master',createdAt:new Date().toISOString(),storageRevision:0,lastSavedAt:null};
    if(data.workspace.mode==='master')data.authorityId ||= data.workspace.id;
    for (const [key,id] of [['records','id'],['instruments','id'],['rfits','no'],['memos','ref']]) for (const record of data[key]) {
      record.internalId ||= data.projectId+':'+key+':'+encodeURIComponent(record[id]);
      record.revision ||= 1;
    }
    for (const record of data.records) for (const stage of record.stages) stage.internalId ||= record.internalId+':'+stage.id;
    data.schemaVersion=3;
    data.audit.push({date:new Date().toISOString(),action:'local schema migrated to v3',user:'Local workspace'});
    return validate(data);
  }
  function migrate(input,options={}){
    const data=migrateLegacy(input,options);
    if(data.schemaVersion===3){I.upgrade(data);data.schemaVersion=4;data.provenance??={};data.provenance.modelMigrations??=[];const at=new Date().toISOString();data.provenance.modelMigrations.push({id:'instrument-controls-v4',from:3,to:4,at});data.audit.push({date:at,action:'local schema migrated to v4; instrument controls separated; ratings preserved',user:'Local workspace'});}
    return validate(data);
  }
  async function digest(text) {
    return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  async function initialize(input, {mode, acceptedBy, sourceName, sourceHash, manifest=null, templates={}}) {
    assert(['master','field'].includes(mode),'Choose a workspace mode.');
    assert(typeof acceptedBy==='string' && acceptedBy.trim(),'Enter your name to initialize the workspace.');
    const data=migrate(input,{mode,templates});
    if (mode==='master') assert(data.baseline?.id && !input.shared, 'A baseline candidate is required to initialize a master workspace.');
    if (mode==='field') assert(input.shared===true || input.kind==='gt-team-data', 'Select a team data package exported by the RE.');
    const now=new Date().toISOString();
    data.workspace={id:uuid(),mode,createdAt:now,storageRevision:0,lastSavedAt:null};
    if(mode==='master')data.authorityId=data.workspace.id;
    data.provenance={...data.provenance,initializedFrom:{file:sourceName,sha256:sourceHash,at:now},sourceHashes:manifest?.files||data.provenance.sourceHashes||[]};
    if(mode==='master') {
      data.provenance.baselineSource={file:sourceName,sha256:sourceHash};
      data.baseline={...data.baseline,status:'accepted',approvedBy:acceptedBy.trim(),approvedAt:now};
      data.baselineSnapshot=clone({records:data.records,instruments:data.instruments,rfits:data.rfits,memos:data.memos,templates:data.templates,snapshots:data.snapshots,map:data.map,meta:data.meta,baseline:data.baseline,calculationVersion:data.calculationVersion});
    } else delete data.baselineSnapshot;
    data.meta.user={name:acceptedBy.trim(),role:mode==='master'?'RE':'ARE'};
    data.outbox=[];data.inbox=[];data.processed=[];data.decisionQueue=[];
    data.lastExportAt='';
    data.audit.push({date:now,action:mode==='master'?'baseline accepted; master working copy created':'field workspace opened',user:acceptedBy.trim(),baselineId:data.baseline?.id});
    delete data.shared;
    return validate(data);
  }
  const content = data => canonical([data.records,data.instruments,data.rfits,data.memos,data.actions||[],data.templates,data.snapshots,data.map,data.meta.cutoff]);
  function prepareSave(input, previous, now=new Date().toISOString(), {referenceRefresh=false}={}) {
    const data=migrate(input);
    const same=previous && previous.workspace?.id===data.workspace.id;
    if(same) {
      assert(previous.projectId===data.projectId,'Project identity cannot change within a workspace.');
      assert(previous.authorityId===data.authorityId,'Master identity cannot change within a workspace.');
      assert(canonical(previous.baseline)===canonical(data.baseline),'Baseline acceptance cannot change in the working copy.');
      assert(canonical(previous.baselineSnapshot)===canonical(data.baselineSnapshot),'The baseline snapshot is immutable.');
      for(const key of ['reportArchive','reportOutputs','emergencyIssues']){const old=previous[key]||[],next=data[key]||[];assert(Array.isArray(next)&&next.length>=old.length&&old.every((entry,i)=>canonical(entry)===canonical(next[i])),'Archived reports and emergency issue records are append-only.');}
      if(data.workspace.mode==='field') {
        for(const key of ['reportArchive','reportOutputs','emergencyIssues'])assert(canonical(data[key]||[])===canonical(previous[key]||[]),'Field workspaces cannot change reporting archives.');
        if(referenceRefresh)assert(data.datasetVersion>=previous.datasetVersion,'Cannot refresh from older reference data.');
        else {assert(content(data)===content(previous),'Field reference records must be refreshed from an RE team package.');data.datasetVersion=previous.datasetVersion;}
      }
      const old=new Map(previous.records.map(r=>[r.internalId,r]));
      for(const record of data.records) {
        const prior=old.get(record.internalId);
        if(prior && data.workspace.mode==='master') {const a={...record},b={...prior};delete a.revision;delete b.revision;record.revision=prior.revision+(canonical(a)!==canonical(b)?1:0);}
      }
      if(data.workspace.mode==='master')data.datasetVersion=previous.datasetVersion+(content(data)!==content(previous)?1:0);
    }
    data.savedAt=now;
    data.workspace.lastSavedAt=now;
    data.workspace.storageRevision=(previous?.workspace?.storageRevision||0)+1;
    return data;
  }
  function backup(input, now=new Date().toISOString()) {
    const data=migrate(input);
    return {...data,kind:'gt-local-backup',exportedAt:now,lastExportAt:now};
  }
  function team(input, now=new Date().toISOString()) {
    const data=migrate(input);
    assert(data.workspace.mode==='master','Only a master workspace can export team reference data.');
    assert(data.baseline?.approvedAt,'Accept a baseline in Workspace before exporting team reference data.');
    const result=clone(data);
    result.authorityId=data.authorityId||data.workspace.id;
    for(const key of ['baselineSnapshot','workspace','exchange','reportArchive','reportOutputs','emergencyIssues']) delete result[key];
    result.workspace={id:uuid(),mode:'field',createdAt:now,storageRevision:0,lastSavedAt:null};
    result.outbox=[];result.inbox=[];result.processed=[];result.decisionQueue=[];result.audit=[];
    delete result.meta.user;
    result.kind='gt-team-data';result.shared=true;result.exportedAt=now;
    return result;
  }
  function renameSegment(data, oldId, newId) {
    assert(newId.trim() && !data.records.some(r=>r.id!==oldId && (r.id===newId || r.previousIds?.includes(newId))),'Segment ID is empty, already exists or was used by another segment.');
    const record=data.records.find(r=>r.id===oldId);assert(record,'Segment not found.');
    if(newId!==oldId)record.previousIds=[...new Set([...(record.previousIds||[]),oldId])];
    record.id=newId;
    data.audit.push({date:new Date().toISOString(),action:'segment display code changed',segmentInternalId:record.internalId,from:oldId,to:newId,user:data.meta.user?.name||''});
    for(const instrument of data.instruments) if(instrument.segment===oldId)instrument.segment=newId;
    for(const register of [...data.rfits,...data.memos,...(data.actions||[])]) if(register.segments?.includes(oldId)) {
      register.segments=register.segments.map(id=>id===oldId?newId:id);
      register.segmentsText=register.segments.join(', ');
    }
    for(const snapshot of data.snapshots) if(Object.hasOwn(snapshot.segments||{},oldId)){snapshot.segments[newId]=snapshot.segments[oldId];delete snapshot.segments[oldId];}
    for(const draft of data.outbox) if(draft.segmentId===oldId)draft.segmentId=newId;
    // Submitted inbox items and audit events retain their historical identifiers.
    return record;
  }
  const api={SCHEMA,CALCULATION,MIGRATIONS,clone,canonical,uuid,projectDate,validate,migrate,digest,initialize,prepareSave,backup,team,renameSegment};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.GTWorkspace=api;
})(typeof window==='object'?window:globalThis);
