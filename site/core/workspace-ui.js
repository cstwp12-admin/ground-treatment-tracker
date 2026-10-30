/* Phase 1B adapter for the legacy views. Core model/storage are independent of UI. */
'use strict';
const localStore=new GTStorage.LocalStore();
let storageRevision=0,saveTail=Promise.resolve(),storageFault='',startupFault=false,rawRecovery=null,pendingWorkspace=null,workspacePerson='',lastCommitted=null,pendingSaves=0;
payload=function(){return GTWorkspace.clone({...state,schemaVersion:GTWorkspace.SCHEMA});};
function applyLoaded(input){
  const migrated=GTWorkspace.migrate(input,{templates:STAGES});
  loadViewState(migrated);
};
function showStorageStatus(){
  const element=app.querySelector('[data-storage-status]');
  if(element){element.classList.toggle('warn',!!storageFault);element.textContent=storageFault?'Not saved: '+storageFault:state.workspace?.lastSavedAt?'Saved '+localTime(state.workspace.lastSavedAt)+' · revision '+state.datasetVersion:'Not saved on this device yet';}
}
function localTime(value){return value?new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'})+' MYT':'Never';}
persist=function(){
  if(viewer)return Promise.resolve();
  if(startupFault)return Promise.reject(new Error('Resolve the local storage problem before saving.'));
  if(!state.workspace)return Promise.reject(new Error('Open or initialize a workspace first.'));
  const snapshot=payload();
  pendingSaves++;
  const task=saveTail.catch(()=>{}).then(async()=>{
    try{
      const committed=await localStore.commit(snapshot,storageRevision);
      storageRevision=committed.workspace.storageRevision;lastCommitted=committed;
      // Keep any edits made while this save was in flight; update only storage bookkeeping.
      state.workspace={...state.workspace,...committed.workspace};state.savedAt=committed.savedAt;state.datasetVersion=committed.datasetVersion;
      for(const record of state.records){const saved=committed.records.find(r=>r.internalId===record.internalId);if(saved)record.revision=saved.revision;}
      storageFault='';showStorageStatus();return committed;
    }catch(error){storageFault=GTStorage.errorMessage(error);showStorageStatus();throw error;}finally{pendingSaves--;}
  });
  saveTail=task;return task;
};
persistSoon=function(){clearTimeout(persistSoon.t);showStorageStatus();const e=app.querySelector('[data-storage-status]');if(e)e.textContent='Unsaved changes · saving shortly…';persistSoon.t=setTimeout(()=>{persistSoon.t=null;persist().catch(()=>{render();});},500);};
save=async function(){busy=true;render();try{await persist();notice='Update saved on this device.';}catch(error){notice='Could not save locally: '+error.message;}busy=false;render();};
loadSaved=async function(){
  const raw=await localStore.read();
  rawRecovery=raw;
  storageRevision=raw?.workspace?.storageRevision||0;
  if(raw!==null)return raw;
  const old=localStorage.getItem('wp12-gt-tracker-v1');
  if(old){const data=JSON.parse(old);rawRecovery=data;return data;}
  return null;
};
async function start(){
  if(EMBED){applyLoaded(EMBED);page='Briefing';ready=true;render();return;}
  try{
    const saved=await loadSaved();
    if(saved){
      await GTLifecycle.verifyDataset(saved);
      const openedRelease=await localStore.metadata('application-version');
      if(openedRelease?.version!==VERSION){await localStore.checkpoint(storageRevision);await localStore.metadata('application-version',{version:VERSION,at:new Date().toISOString()});}
      applyLoaded(saved);lastCommitted=GTWorkspace.clone(state);
      if(saved.schemaVersion!==GTWorkspace.SCHEMA)await persist();
      if(saved.meta?.demo){notice='Fictional demonstration workspace restored. Use Workspace to initialize your project.';}
      if(state.baseline && !state.baseline.approvedAt)notice='Legacy workspace migrated. Baseline acceptance is not recorded. Initialize a master working copy from B001 in Workspace.';
    }
  }catch(error){startupFault=true;storageFault=error.message;}
  if(viewer)page='Briefing';
  ready=true;render();
  lifecycleStart().catch(error=>{deviceHealth.error=error.message;refreshLifecyclePanel();});
};
function fileControl(label,action){return `<label class="btn importlabel">${label}<input type="file" accept="${action==='field'?'.gtdata':action==='restore'?'.gtbackup,.json':'.json,application/json'}" data-workspace-file="${action}"></label>`;}
function workspaceChoices(){return `<div class="workspace-grid">
  <section class="card"><div class="kicker">RE / data custodian</div><h2>Create master workspace</h2><p>Choose the private baseline file. Check the figures and record your acceptance to create a working copy.</p>${fileControl('Choose baseline JSON','baseline')}</section>
  <section class="card"><div class="kicker">ARE / IOW</div><h2>Open field package</h2><p>Choose team reference data supplied by the RE. Enter observations locally and return update files for review.</p>${fileControl('Choose team data package','field')}</section>
  <section class="card"><div class="kicker">Recovery</div><h2>Restore local backup</h2><p>Restore records, evidence, drafts and queues from a full backup. Current data is checkpointed before replacement.</p>${fileControl('Choose backup file','restore')}</section>
  </div>`;}
function pendingPreview(){
  if(!pendingWorkspace)return '';
  const p=pendingWorkspace,d=p.data,m=GTWorkspace.migrate(d,{templates:STAGES});
  const active=m.records.filter(r=>progress(r)!==null),length=active.reduce((n,r)=>n+len(r),0);
  return `<section class="card workspace-confirm"><h2>${p.action==='baseline'?'Accept baseline and create working copy':p.action==='field'?'Open field workspace':'Restore this backup'}</h2>
  <p><strong>${esc(p.name)}</strong> · project ${esc(m.projectId)} · baseline ${esc(m.baseline?.id||'Not recorded')}</p>
  <div class="tb4"><div><span>Cut-off</span><strong>${fmtDate(m.meta.cutoff)}</strong></div><div><span>Segments</span><strong>${m.records.length}</strong></div><div><span>Active length</span><strong>${fmt(length)} m</strong></div><div><span>Progress</span><strong>${pct1(rollupLength(m.records))}</strong></div></div>
  <p class="small">Source fingerprint (SHA-256): ${esc(p.hash)}</p>
  ${p.action==='baseline'?`<p>The original baseline remains preserved. Your acceptance applies to this separate master working copy.</p>${fileControl('Optional: attach baseline manifest','manifest')}<p class="small">${p.manifest?'Manifest matches the selected baseline. Original source fingerprints will be retained.':'The selected baseline file fingerprint will always be retained. Attach its manifest to retain the original workbook/KML fingerprints as well.'}</p>`:''}
  ${p.action!=='restore'?`<label class="field">Your name<input class="control" data-workspace-person value="${esc(workspacePerson)}" autocomplete="name"></label>`:''}
  ${state.workspace?'<p class="note warnbox">This replaces the current local workspace. Export a backup first if it contains unsaved work.</p>':''}
  <div class="savebar"><button class="btn primary" data-workspace-action="confirm">${p.action==='baseline'?'Accept and create master':p.action==='field'?'Open field workspace':'Restore backup'}</button><button class="btn" data-workspace-action="cancel">Cancel</button></div></section>`;
}
function recoveryPanel(){return `<section class="card"><h2>Local data could not be opened</h2><p role="alert">${esc(storageFault)}</p><p>The stored data has not been replaced. Export a recovery copy before trying a backup or reloading.</p><div class="savebar"><button class="btn" data-workspace-action="recovery-export">Export recoverable data</button><button class="btn" data-workspace-action="previous-export">Download previous save</button><button class="btn" data-workspace-action="checkpoint-export">Download pre-replacement checkpoint</button><button class="btn" data-workspace-action="reload">Retry by reloading</button></div></section>`;}
async function prepareWorkspaceFile(file,action){
  if(!file)return;
  try{
    if(file.size>50*1024*1024)throw new Error('This JSON file exceeds the 50 MB import limit.');
    const text=await file.text(),data=JSON.parse(text);
    if(action==='manifest'){
      if(!pendingWorkspace||pendingWorkspace.action!=='baseline')throw new Error('Choose a baseline first.');
      if(data.baselineId!==pendingWorkspace.data.baseline?.id||!Array.isArray(data.files))throw new Error('Manifest is for another baseline.');
      if(!data.files.some(item=>item.file===pendingWorkspace.name&&item.sha256===pendingWorkspace.hash))throw new Error('Baseline checksum does not match this manifest.');
      pendingWorkspace.manifest=data;
    }else{
      const migrated=GTWorkspace.migrate(data,{templates:STAGES});
      if(action==='baseline'&&data.baseline?.status!=='validated-migration-candidate')throw new Error('Choose a validated baseline candidate, such as B001. Use Restore for backups.');
      if(action==='field'&&data.shared!==true&&data.kind!=='gt-team-data')throw new Error('Choose team reference data exported by the RE.');
      if(action==='restore'&&data.kind!=='gt-local-backup'&&!(data.schemaVersion<=2&&!data.shared&&!data.baseline))throw new Error('Choose a full local backup, not a baseline or team package.');
      if(action==='restore')await GTLifecycle.verifyDataset(migrated);
      pendingWorkspace={action,data,name:file.name,hash:await GTWorkspace.digest(text)};
    }
    notice='';page='Data';render();
  }catch(error){notice=error.message;if(!state.workspace)render();else{page='Data';render();}}
}
async function confirmWorkspace(){
  const p=pendingWorkspace;if(!p)return;
  try{
    await saveTail.catch(()=>{});
    const candidate=p.action==='restore'?GTWorkspace.migrate(p.data,{templates:STAGES}):await GTWorkspace.initialize(p.data,{mode:p.action==='baseline'?'master':'field',acceptedBy:workspacePerson,sourceName:p.name,sourceHash:p.hash,manifest:p.manifest,templates:STAGES});
    if(p.controlledPackage)candidate.provenance={...candidate.provenance,openedPackage:GTWorkspace.clone(p.controlledPackage)};
    if(state.workspace&&!confirm('Replace this local workspace? A pre-replacement checkpoint will be kept. Download a backup first if needed.'))return;
    if(p.action==='restore')await GTLifecycle.verifyDataset(candidate);
    clearTimeout(persistSoon.t);persistSoon.t=null;
    const committed=await localStore.commit(candidate,storageRevision,{checkpoint:true,restore:p.action==='restore',baselineSource:p.action==='baseline'?{file:p.name,sha256:p.hash,data:p.data,manifest:p.manifest||null}:null,allowInvalidPrevious:startupFault});
    storageRevision=committed.workspace.storageRevision;lastCommitted=committed;applyLoaded(committed);
    startupFault=false;storageFault='';rawRecovery=null;pendingWorkspace=null;entrySeg='';mapView=null;page=state.workspace.mode==='master'?'Briefing':'Entry';notice=p.action==='restore'?'Backup restored and saved on this device.':'Workspace created and saved on this device.';render();
  }catch(error){notice=error.message;render();}
}
importJson=async function(file){return selectWorkspaceFile(file,'restore');};
importWorkbook=async function(){notice='Routine workbook replacement is disabled. Initialize from a baseline or restore a backup in Workspace.';page='Data';render();};
function updateField(id,key,value){
  if(state.workspace?.mode==='field')return id;
  if(key!=='id')return mutateLegacyField(id,key,value);
  try{GTWorkspace.renameSegment(state,id,String(value).trim());return String(value).trim();}catch(error){notice=error.message;return id;}
};
// Capturing handlers intercept only workspace actions, leaving existing field entry controls intact.
GTUI.on('change','workspace-ui:change:1',event=>{
  const action=event.target.dataset.workspaceFile;if(!action)return;
  event.stopImmediatePropagation();const file=event.target.files?.[0];event.target.value='';selectWorkspaceFile(file,action);
},true);
GTUI.on('input','workspace-ui:input:2',event=>{if(event.target.matches('[data-workspace-person]'))workspacePerson=event.target.value;},true);
GTUI.on('click','workspace-ui:click:3',async event=>{
  const button=event.target.closest('[data-workspace-action]');if(!button)return;
  event.stopImmediatePropagation();
  try{
    const action=button.dataset.workspaceAction;
    if(action==='confirm')await confirmWorkspace();
    else if(action==='cancel'){pendingWorkspace=null;render();}
    else if(action==='backup')await exportData(false);
    else if(action==='team')await exportData(true);
    else if(action==='reload')location.reload();
    else if(action==='recovery-export'||action==='unsaved-export')exportRecovery(startupFault?rawRecovery:payload());
    else if(action==='previous-export'||action==='checkpoint-export'){
      const value=await localStore.recovery(action==='previous-export'?'previous':'before-replacement');
      if(value)exportRecovery(value);else{notice='No '+(action==='previous-export'?'previous save':'pre-replacement checkpoint')+' is available yet.';render();}
    }
  }catch(error){notice=error.message;render();}
},true);
function hasUnsavedChanges(){return !!state.workspace && (!lastCommitted || GTWorkspace.canonical(payload())!==GTWorkspace.canonical(lastCommitted));}
GTUI.windowOn('beforeunload','workspace-ui:beforeunload:1',event=>{if(storageFault||persistSoon.t||pendingSaves||hasUnsavedChanges()){event.preventDefault();event.returnValue='';}});
