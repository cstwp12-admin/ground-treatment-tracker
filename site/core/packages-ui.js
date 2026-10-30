'use strict';
let packageDialog=null,packageBusy=false,packageReviewError='';
const reviewNotes=new Map(),reviewAcknowledgements=new Set();
function packageFile(label,action,accept='.gtdata,.gtupdate,.gtreceipt,.gtbackup'){return `<label class="btn importlabel">${label}<input type="file" accept="${accept}" data-package-file="${action}"></label>`;}
function packageModal(){
  if(!packageDialog)return '';
  const exporting=packageDialog.direction==='export';
  const title=exporting?({team:'Export encrypted team data',update:'Export encrypted updates',receipt:'Export encrypted review receipt',backup:'Export encrypted backup'}[packageDialog.kind]):'Open encrypted package';
  return `<div class="package-overlay"><section class="card package-dialog" role="dialog" aria-modal="true" aria-labelledby="package-title"><h2 id="package-title">${title}</h2><p>${exporting?'Choose a passphrase of at least 12 characters. Send it to the recipient through a separate channel.':'Enter the passphrase supplied with this file. The data will be validated before any local records change.'}</p>${packageDialog.name?`<p>${esc(packageDialog.name)}</p>`:''}<label class="field">Passphrase<input class="control" type="password" autocomplete="off" data-package-password ${packageBusy?'disabled':''}></label>${exporting?'<label class="field">Confirm passphrase<input class="control" type="password" autocomplete="off" data-package-confirm></label>':''}<p class="small">Passphrases are not saved. There is no password reset for an encrypted file. Share access only with the intended recipients.</p>${packageDialog.error?`<p role="alert" class="note warnbox">${esc(packageDialog.error)}</p>`:''}<div class="savebar"><button class="btn primary" data-package-action="process" ${packageBusy?'disabled':''}>${packageBusy?'Processing…':exporting?'Encrypt and download':'Decrypt and validate'}</button><button class="btn" data-package-action="cancel" ${packageBusy?'disabled':''}>Cancel</button></div></section></div>`;
}
function ensureDraft(record){let draft=draftOf(record.id);if(!draft){draft=GTPackages.makeDraft(state,record);state.outbox.push(draft);}return draft;};
async function flushWorkspace(){clearTimeout(persistSoon.t);persistSoon.t=null;await saveTail.catch(()=>{});await persist();}
async function packageTransaction(transform,options={}){
  await saveTail.catch(()=>{});
  pendingSaves++;
  const task=saveTail.catch(()=>{}).then(async()=>{
    try{const committed=await localStore.commit(transform,storageRevision,options);storageRevision=committed.workspace.storageRevision;lastCommitted=committed;applyLoaded(committed);storageFault='';showStorageStatus();return committed;}
    catch(error){storageFault=GTStorage.errorMessage(error);showStorageStatus();throw error;}finally{pendingSaves--;}
  });saveTail=task;return task;
}
function requestPackageExport(kind,options={}){packageDialog={direction:'export',kind,...options};render();}
async function exportData(share){requestPackageExport(share?'team':'backup');};
function exportRecovery(value=state){requestPackageExport('backup',{recoveryValue:GTWorkspace.clone(value||rawRecovery),recovery:true});};
function sendPacket(){requestPackageExport('update');};
async function processPackage(){
  if(!packageDialog||packageBusy)return;
  const first=app.querySelector('[data-package-password]'),second=app.querySelector('[data-package-confirm]');
  let password=first?.value||'';const confirmation=second?.value;const job=packageDialog;
  if(first)first.value='';if(second)second.value='';
  try{
    if(job.direction==='export'&&password!==confirmation)throw new Error('The passphrases do not match.');
    packageBusy=true;render();
    if(job.direction==='export')await encryptedExport(job,password);else await encryptedImport(job,password);
    packageDialog=null;
  }catch(error){job.error=error.message;packageDialog=job;}
  finally{password='';packageBusy=false;render();}
}
async function encryptedExport(job,password){
  if(!job.recovery)await flushWorkspace();
  let pkg;const source=job.recoveryValue||payload();
  if(job.kind==='update'){
    if(job.resend){const archived=GTPackages.ledger(GTWorkspace.clone(state)).exports.find(e=>e.packageId===job.resend);if(!archived)throw new Error('Original submission is unavailable. Restore a backup containing its export history.');pkg=GTWorkspace.clone(archived.package);}
    else pkg=await GTPackages.submission(source);
  }
  else if(job.kind==='team')pkg=await GTPackages.team(payload());
  else if(job.kind==='backup')pkg=await GTPackages.backup(job.recoveryValue?{...job.recoveryValue,recoveryExport:true}:payload());
  else pkg=await GTPackages.receipt(payload(),job.recipient);
  if(!pkg)throw new Error('Original submission is not available. Restore a full backup containing its export history.');
  const encrypted=await GTPackages.seal(pkg,password),fingerprint=await GTPackages.hash(pkg);
  if(pkg.kind==='backup'){const reopened=await GTPackages.open(encrypted,password);await GTLifecycle.verifyDataset(reopened.body.dataset);if(await GTPackages.hash(reopened)!==fingerprint)throw Error('Backup round-trip verification failed.');}
  if(job.kind==='update'&&!job.resend){await packageTransaction(current=>GTPackages.markExported(current,pkg,fingerprint,source.outbox.filter(d=>d.state==='ready')));entrySeg='';page='Outbox';}
  const extension={team:'gtdata',update:'gtupdate',receipt:'gtreceipt',backup:'gtbackup'}[pkg.kind];
  download(new Blob([encrypted],{type:'application/octet-stream'}),'GT-'+pkg.kind+'-'+pkg.packageId+'.'+extension);
  if(pkg.kind==='backup'&&!job.recovery)await packageTransaction(current=>({...current,lastExportAt:pkg.body.dataset.lastExportAt}));
  notice='Encrypted '+pkg.kind+' package downloaded. Keep the passphrase separately.';
}
async function selectEncryptedFile(file,action){
  if(!file)return;
  try{if(file.size>GTPackages.MAX_FILE_BYTES)throw new Error('Encrypted file exceeds the 57 MiB file limit.');packageDialog={direction:'import',action,name:file.name,serialized:await file.text()};render();}
  catch(error){notice=error.message;render();}
}
async function selectWorkspaceFile(file,action){
  if(!file)return;
  if(action==='baseline'||action==='manifest')return prepareWorkspaceFile(file,action);
  try{
    if(file.size>GTPackages.MAX_FILE_BYTES)throw new Error('File exceeds the package limit.');
    const content=await file.text();let parsed;try{parsed=JSON.parse(content);}catch{throw new Error('Not a valid package file.');}
    if(parsed.format==='gt-encrypted-package')return selectEncryptedFile(file,action);
    // Legacy recovery is retained explicitly; legacy field files cannot enter the controlled exchange.
    if(action==='field')throw new Error('Select an encrypted .gtdata file exported by the current RE workspace. Legacy field drafts can be recovered from a full backup.');
    return prepareWorkspaceFile(file,action);
  }catch(error){notice=error.message;render();}
};
async function encryptedImport(job,password){
  const pkg=await GTPackages.open(job.serialized,password),fingerprint=await GTPackages.hash(pkg);
  const expected={field:'team',refresh:'team',restore:'backup','verify-backup':'backup',update:'update',receipt:'receipt'}[job.action];
  if(pkg.kind!==expected)throw new Error('This is a '+pkg.kind+' package; choose the matching import action.');
  if(job.action==='verify-backup'){await GTLifecycle.verifyDataset(pkg.body.dataset);if(state.workspace)GTPackages.identity(pkg,state);await localStore.metadata('verified-backup',{at:new Date().toISOString(),packageId:pkg.packageId,datasetVersion:pkg.datasetVersion,sha256:fingerprint});await refreshDeviceHealth();notice='Selected backup decrypted and verified. The workspace was not replaced.';return;}
  if(job.action==='restore'||(job.action==='field'&&!state.workspace)){
    if(pkg.kind==='backup'&&state.workspace){GTPackages.identity(pkg,state);}
    const dataset=pkg.body.dataset;
    await prepareWorkspaceFile(new File([JSON.stringify(dataset)],job.name,{type:'application/json'}),job.action==='restore'?'restore':'field');
    if(!pendingWorkspace)throw new Error(notice||'Could not prepare the workspace.');
    pendingWorkspace.controlledPackage={id:pkg.packageId,kind:pkg.kind,sha256:fingerprint};
    return;
  }
  GTPackages.identity(pkg,state);
  if(pkg.kind==='update')GTPackages.ingest(state,pkg,fingerprint);
  else if(pkg.kind==='receipt'){await GTPackages.verifyReceiptReferences(state,pkg);GTPackages.applyReceipt(state,pkg,fingerprint);}
  else GTPackages.refresh(state,pkg,fingerprint);
  await flushWorkspace();
  if(pkg.kind==='update'){
    let result;await packageTransaction(current=>{result=GTPackages.ingest(current,pkg,fingerprint);return result.data;});notice=result.added+' new item(s), '+result.duplicates+' duplicate item(s).';page='Review';
  }else if(pkg.kind==='receipt'){
    await GTPackages.verifyReceiptReferences(state,pkg);await packageTransaction(current=>GTPackages.applyReceipt(current,pkg,fingerprint));notice='Review receipt imported. Submission statuses updated.';page='Outbox';
  }else{
    if(!confirm('Refresh the approved reference data? Your local drafts, submissions and receipts will be kept.'))return;
    await packageTransaction(current=>GTPackages.refresh(current,pkg,fingerprint),{checkpoint:true,referenceRefresh:true});notice='Team reference data refreshed. Local drafts and submission history were retained.';page='Data';mapView=null;entrySeg='';
  }
}
async function importPackets(files){if(files?.length!==1){notice='Open one encrypted update package at a time.';render();return;}return selectEncryptedFile(files[0],'update');};
function ingestPacket(){throw new Error('Legacy plaintext update packets are disabled. Import a controlled encrypted update package.');};
function applyReview(){throw new Error('Use controlled review decisions.');};
async function decide(action,uid){
  if(packageBusy)return;
  try{
    packageBusy=true;await flushWorkspace();const entry=state.inbox.find(e=>e.uid===uid);if(!entry)throw new Error('Submission item not found.');const fingerprint=await GTPackages.hash(entry.item);
    const status={accept:'accepted',reject:'rejected',revise:'revision-requested'}[action];
    const decisionOptions={note:reviewNotes.get(uid)||'',acknowledge:reviewAcknowledgements.has(uid),itemHash:fingerprint};
    GTPackages.decide(payload(),uid,status,decisionOptions);
    await packageTransaction(current=>GTPackages.decide(current,uid,status,decisionOptions));
    packageReviewError='';
    reviewNotes.delete(uid);reviewAcknowledgements.delete(uid);notice='Decision saved with its audit entry and receipt.';
  }catch(error){notice=error.message;packageReviewError=error.message;}finally{packageBusy=false;render();}
};
async function acceptAll(){
  if(packageBusy)return;
  try{packageBusy=true;await flushWorkspace();const hashes=new Map(await Promise.all(state.inbox.filter(e=>e.controlled&&e.state==='pending').map(async e=>[e.uid,await GTPackages.hash(e.item)])));let count=0;
    await packageTransaction(current=>{let next=current;for(const entry of next.inbox.filter(e=>e.controlled&&e.state==='pending')){const d=GTPackages.diff(next,entry);if(d.blocking.length||d.conflicts.length||d.stale)continue;next=GTPackages.decide(next,entry.uid,'accepted',{itemHash:hashes.get(entry.uid),note:'Accepted through clean-update review.'});count++;}return next;});notice=count+' clean item(s) accepted. Stale/conflicting items remain for individual review.';
  }catch(error){notice=error.message;}finally{packageBusy=false;render();}
};
function reviewControlledCard(entry){
  const diff=GTPackages.diff(state,entry),it=entry.item;
  const value=v=>typeof v==='number'?pct1(v):v==='NA'?'N/A':String(v);
  return `<section class="card"><div class="section-head"><h2>${esc(it.segmentId)} · ${esc(entry.from.name||'Unknown author')}</h2>${status(entry.state)}</div><p class="small">Observed ${fmtDate(it.observedOn)} · submitted ${localTime(entry.createdAt)} · base revision ${it.baseDatasetVersion??entry.baseDatasetVersion}${diff.stale?' · newer master data exists':''}${it.supersedesItemId?' · revises item '+esc(it.supersedesItemId):''}</p>
    ${it.observedOn>cutoff()?`<p class="note">Observation is later than the reporting cut-off (${fmtDate(cutoff())}). Review the cut-off before issuing a progress report.</p>`:''}
    ${diff.blocking.map(m=>`<p class="note warnbox">${esc(m)}</p>`).join('')}
    <div class="table-wrap"><table class="table"><thead><tr><th>Field</th><th>Submission base</th><th>Current master</th><th>Proposed</th></tr></thead><tbody>${diff.rows.map(r=>`<tr><td>${esc(r.label)}${r.conflict?' (conflict)':''}</td><td>${esc(value(r.base))}</td><td>${esc(value(r.current))}</td><td>${esc(value(r.value))}</td></tr>`).join('')}</tbody></table></div>
    ${it.photos?.length?`<div class="photos">${it.photos.map(p=>`<figure><img src="${esc(p.data)}" alt="${esc(p.caption)}"><figcaption>${esc(p.caption)}</figcaption></figure>`).join('')}</div>`:''}
    ${entry.state==='pending'&&entry.controlled?`<label class="field">Review comment<textarea class="control" rows="2" data-review-note="${esc(entry.uid)}">${esc(reviewNotes.get(entry.uid)||'')}</textarea></label>${diff.conflicts.length?`<label class="check"><input type="checkbox" data-review-ack="${esc(entry.uid)}" ${reviewAcknowledgements.has(entry.uid)?'checked':''}>I reviewed the conflicting values and explained the override.</label>`:''}<div class="savebar"><button class="btn primary" data-controlled-decision="accept" data-item-id="${esc(entry.uid)}" ${diff.blocking.length||packageBusy?'disabled':''}>Accept</button><button class="btn" data-controlled-decision="reject" data-item-id="${esc(entry.uid)}">Reject</button><button class="btn" data-controlled-decision="revise" data-item-id="${esc(entry.uid)}">Request revision</button></div>`:`<p>${esc(entry.reviewNote||'')}</p>${!entry.controlled?'<p class="note warnbox">Legacy packet is retained for reference. Obtain a new controlled submission to make a decision.</p>':''}`}</section>`;
}
function reviewPage(){
  const controlled=state.inbox.filter(e=>e.state==='pending'),done=state.inbox.filter(e=>e.state!=='pending');
  const recipients=[...new Set(GTPackages.ledger(GTWorkspace.clone(state)).decisions.map(d=>d.recipientWorkspaceId))];
  return `${head('Reviewer','Review updates','Decisions commit the record changes, audit and receipt together.',packageFile('Open encrypted update','update','.gtupdate'))}<p class="note">Package authors and reviewer names are self-declared. Encryption protects the file but does not establish an individual sender identity.</p><div class="card"><h2>${controlled.length} awaiting review</h2><button class="btn" data-action="accept-all">Accept clean updates</button></div>${controlled.map(reviewControlledCard).join('')}<section class="card"><h2>Review receipts</h2>${recipients.length?recipients.map(recipient=>`<button class="btn" data-package-export="receipt" data-recipient="${esc(recipient)}">Export receipt for ${esc((state.inbox.find(e=>e.from.workspaceId===recipient)?.from.name)||recipient)}</button>`).join(' '):'<p>No decisions have been made yet.</p>'}</section>${done.length?`<details><summary>Decided items (${done.length})</summary>${done.slice().reverse().map(reviewControlledCard).join('')}</details>`:''}`;
};
function outboxPage(){
  const exports=GTPackages.ledger(GTWorkspace.clone(state)).exports;
  return `${head('Field observations','Outbox','Encrypted submissions and review receipts.',`<button class="btn" data-page="Entry">New update</button>`)}<section class="card"><div class="savebar"><button class="btn primary" data-package-export="update">Encrypt ready updates</button>${packageFile('Import review receipt','receipt','.gtreceipt')}</div></section>
    ${state.outbox.map(d=>`<section class="card"><h2>${esc(d.segmentId)} · ${esc(d.state)}</h2><p>Observed ${fmtDate(d.observedOn)} · ${d.review?esc(d.review.status):d.state==='sent'?'Awaiting review receipt':'Local draft'}</p>${d.review?`<p>${esc(d.review.note||'')}<br><small>${esc(d.review.reviewer||'')} · ${localTime(d.review.decidedAt)}</small></p>`:''}<div class="savebar">${d.state!=='sent'?`<button class="btn" data-outedit="${esc(d.id)}">Edit draft</button><button class="btn" data-package-rebase="${esc(d.id)}">Compare with current reference</button>`:d.review?.status==='revision-requested'||d.review?.status==='rejected'?`<button class="btn" data-package-revise="${esc(d.id)}">Prepare revised observation</button>`:''}</div></section>`).join('')||'<section class="card">No observations yet.</section>'}
    ${exports.length?`<section class="card"><h2>Submission archive</h2><p>Resending preserves the original package and item IDs. It does not create a new submission.</p>${exports.map(e=>`<button class="btn" data-package-resend="${esc(e.packageId)}">Resend ${esc(e.packageId.slice(0,8))}</button>`).join(' ')}</section>`:''}`;
};
GTUI.on('change','packages-ui:change:1',event=>{const action=event.target.dataset.packageFile;if(action){event.stopImmediatePropagation();const file=event.target.files?.[0];event.target.value='';selectEncryptedFile(file,action);}const ack=event.target.dataset.reviewAck;if(ack){if(event.target.checked)reviewAcknowledgements.add(ack);else reviewAcknowledgements.delete(ack);}},true);
GTUI.on('input','packages-ui:input:2',event=>{if(event.target.dataset.reviewNote)reviewNotes.set(event.target.dataset.reviewNote,event.target.value);},true);
GTUI.on('keydown','packages-ui:keydown:3',event=>{
  if(!packageDialog)return;
  if(event.key==='Escape'&&!packageBusy){event.preventDefault();packageDialog=null;render();}
  if(event.key==='Enter'&&event.target.matches('[data-package-password],[data-package-confirm]')){event.preventDefault();processPackage();}
  if(event.key==='Tab'){const controls=[...app.querySelectorAll('.package-dialog input:not(:disabled),.package-dialog button:not(:disabled)')];if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}}
},true);
GTUI.on('click','packages-ui:click:4',async event=>{
  const actionButton=event.target.closest('[data-package-action],[data-package-export],[data-controlled-decision],[data-package-resend],[data-package-rebase],[data-package-revise]');
  if(!actionButton)return;event.stopImmediatePropagation();const d=actionButton.dataset;
  try{
    if(d.packageAction==='cancel'){packageDialog=null;render();}
    else if(d.packageAction==='process')await processPackage();
    else if(d.packageAction==='raw-recovery'){
      if(confirm('Download readable project data for diagnosis? Keep this JSON off public/shared sites.'))download(new Blob([JSON.stringify(startupFault?rawRecovery:payload(),null,2)],{type:'application/json'}),'GT-plaintext-diagnostic-'+todayISO()+'.json');
    }else if(d.packageExport)requestPackageExport(d.packageExport,{recipient:d.recipient});
    else if(d.packageResend)requestPackageExport('update',{resend:d.packageResend});
    else if(d.controlledDecision)await decide(d.controlledDecision,d.itemId);
    else if(d.packageRebase){
      if(confirm('Rebase this draft onto the current approved reference? Proposed observations/photos are kept where stages still match. Review all values before marking it ready.')){await flushWorkspace();await packageTransaction(current=>GTPackages.rebase(current,d.packageRebase));notice='Draft rebased for comparison. Open it and review the values.';render();}
    }else if(d.packageRevise){
      await flushWorkspace();await packageTransaction(current=>{const old=current.outbox.find(v=>v.id===d.packageRevise),r=current.records.find(r=>r.internalId===old?.segmentInternalId);if(!r)throw new Error('Segment no longer exists.');if(current.outbox.some(v=>v.segmentInternalId===r.internalId&&v.state!=='sent'))throw new Error('An unsent observation already exists for this segment.');const draft=GTPackages.makeDraft(current,r);draft.supersedesItemId=old.id;draft.activity=old.activity;draft.next=old.next;draft.issue=old.issue;draft.observedOn=old.observedOn;draft.photos=GTWorkspace.clone(old.photos||[]);draft.stages=draft.stages.map(s=>({...s,rating:old.stages.find(v=>v.name===s.name)?.rating??s.rating}));draft.instruments=GTWorkspace.clone(old.instruments||{});current.outbox.push(draft);return current;});notice='New draft created. The original submission and receipt remain in history.';render();
    }
  }catch(error){notice=error.message;render();}
},true);
