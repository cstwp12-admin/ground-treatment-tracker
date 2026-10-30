(function(root){
 'use strict';
 const VERSION=1,INSTALLATION=['pending','installed','not-required'],CONDITION=['unverified','serviceable','damaged','replaced','inaccessible'];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const done=status=>/^(installed|drilled|replaced)$/i.test(String(status||'').trim());
 function legacyState(status){return done(status)?'installed':/^not required$/i.test(status||'')?'not-required':'pending';}
 function legacyCondition(status){return /^damaged$/i.test(status||'')?'damaged':/^replaced$/i.test(status||'')?'replaced':done(status)?'serviceable':'unverified';}
 function initialBinding(record){const stages=record.stages.filter(s=>s.purpose==='instrumentation-installation');return stages.length===1?{mode:'derived',stageInternalId:stages[0].internalId,source:'template'}:{mode:'manual',stageInternalId:null,source:'operator'};}
 function upgrade(data){
  data.instrumentation={version:VERSION,installationPolicy:'installation-evidence-v1',readingContractVersion:1};
  for(const r of data.records){
   const candidates=r.stages.filter(s=>/^instrumentation\b/i.test(s.name));
   if(!r.instrumentationBinding)r.instrumentationBinding=candidates.length===1?{mode:'derived',stageInternalId:candidates[0].internalId,source:'legacy-unique'}:{mode:'manual',stageInternalId:null,source:candidates.length?'legacy-ambiguous':'legacy-unlinked'};
   if(candidates.length===1)candidates[0].purpose='instrumentation-installation';
  }
  for(const instrument of data.instruments){
   instrument.internalId||=data.projectId+':instruments:'+encodeURIComponent(instrument.id);
   const knownInstalled=data.records.some(r=>(r.observations||[]).some(o=>(o.changes?.instruments||[]).some(i=>i.internalId===instrument.internalId&&done(i.value))));
   instrument.installationState??=knownInstalled&&!/^not required$/i.test(instrument.status||'')?'installed':legacyState(instrument.status);
   instrument.condition??=legacyCondition(instrument.status);instrument.controlRevision??=1;
  }
  return data;
 }
 function validate(data){
  check(data.instrumentation?.version===VERSION&&data.instrumentation.installationPolicy==='installation-evidence-v1'&&data.instrumentation.readingContractVersion===1,'Unsupported instrumentation contract.');
  const seen=new Set();for(const i of data.instruments){check(typeof i.internalId==='string'&&!seen.has(i.internalId),'Missing or duplicate internal instrument identity.');seen.add(i.internalId);check(INSTALLATION.includes(i.installationState)&&CONDITION.includes(i.condition)&&Number.isInteger(i.controlRevision)&&i.controlRevision>=1,'Invalid instrument installation/condition controls.');}
  for(const r of data.records){const b=r.instrumentationBinding;check(b&&['manual','derived'].includes(b.mode)&&typeof b.source==='string','Missing instrumentation stage binding for '+r.id);check(b.mode==='manual'?b.stageInternalId===null:r.stages.some(s=>s.internalId===b.stageInternalId),'Instrumentation binding points to a missing stage in '+r.id);}
  return data;
 }
 function statusProposal(instrument,status){
  let installationState=instrument.installationState,condition=instrument.condition;
  if(done(status)){installationState='installed';condition=legacyCondition(status);}
  else if(/^damaged$/i.test(status))condition='damaged';
  else if(/^not required$/i.test(status))installationState='not-required';
  else if(/^not (installed|drilled)$/i.test(status))installationState='pending';
  else if(/^to verify$/i.test(status))condition='unverified';
  return {installationState,condition};
 }
 function needsMaster(instrument,status){const next=statusProposal(instrument,status);return next.installationState!==instrument.installationState&&(next.installationState==='not-required'||instrument.installationState==='not-required'||instrument.installationState==='installed'&&next.installationState==='pending');}
 function applyStatus(instrument,status,{master=false,reason=''}={}){
  check(!needsMaster(instrument,status)||master&&reason.trim(),'Installation reversal or applicability change requires an explicit master edit and reason.');
  const next=statusProposal(instrument,status),changed=next.installationState!==instrument.installationState;
  if(changed||next.condition!==instrument.condition)instrument.controlRevision++;
  Object.assign(instrument,next,{status});return changed;
 }
 function masterControls(instrument,values,prior=null){
  instrument.installationState??='pending';instrument.condition??='unverified';instrument.controlRevision??=1;
  const before=prior?.installationState??'pending',oldCondition=prior?.condition??'unverified',reason=String(values.controlReason||'').trim();instrument.installationState=before;instrument.condition=oldCondition;
  let proposed=values.status?statusProposal(instrument,values.status):{installationState:before,condition:oldCondition};
  if(values.installationState!==undefined&&values.installationState!==(prior?.installationState??'pending'))proposed.installationState=values.installationState;
  if(values.condition!==undefined&&values.condition!==(prior?.condition??'unverified'))proposed.condition=values.condition;
  check(INSTALLATION.includes(proposed.installationState)&&CONDITION.includes(proposed.condition),'Select valid installation and condition controls.');
  const guarded=proposed.installationState!==before&&(proposed.installationState==='not-required'||before==='not-required'||before==='installed'&&proposed.installationState==='pending');
  check(!guarded||reason,'Record a reason for reversing installation or changing instrument applicability.');
  check(!prior||prior.segment===instrument.segment||reason,'Record a reason for moving an instrument to another segment.');
  Object.assign(instrument,proposed);instrument.controlRevision=prior?prior.controlRevision+(before!==proposed.installationState||oldCondition!==proposed.condition||prior.segment!==instrument.segment?1:0):1;
  instrument.status=prior&&before===proposed.installationState&&oldCondition===proposed.condition&&(!values.status||values.status===prior.status)?prior.status:proposed.installationState==='not-required'?'Not Required':proposed.condition==='damaged'?'Damaged':proposed.condition==='replaced'&&proposed.installationState==='installed'?'Replaced':proposed.installationState==='installed'?(/^drilled$/i.test(values.status||'')?'Drilled':'Installed'):'Not installed';
  if(reason)instrument.lastControlReason=reason;delete instrument.controlReason;
  return before!==proposed.installationState;
 }
 function recalculate(data,segmentId){
  const r=data.records.find(r=>r.id===segmentId),binding=r?.instrumentationBinding;if(!binding||binding.mode!=='derived')return;
  const stage=r.stages.find(s=>s.internalId===binding.stageInternalId),eligible=data.instruments.filter(i=>i.segment===segmentId&&i.installationState!=='not-required');
  // Applicability of the construction stage remains an explicit scope decision.
  if(stage&&stage.rating!=='NA'&&eligible.length)stage.rating=eligible.filter(i=>i.installationState==='installed').length/eligible.length;
 }
 function preview(data,record,proposals){const next=JSON.parse(JSON.stringify({records:[record],instruments:data.instruments}));let changed=false;for(const [id,status]of Object.entries(proposals||{})){const i=next.instruments.find(i=>i.id===id&&i.segment===record.id);if(i&&status&&!needsMaster(i,status))changed=applyStatus(i,status)||changed;}if(changed)recalculate(next,record.id);return next.records[0];}
 function binding(record,next,reason=''){
  const prior=record.instrumentationBinding,mode=next?.mode,id=mode==='manual'?null:next?.stageInternalId;
  check(['manual','derived'].includes(mode)&& (mode==='manual'||record.stages.some(s=>s.internalId===id)),'Select an existing instrumentation stage or manual control.');
  const changed=prior&&(prior.mode!==mode||prior.stageInternalId!==id);check(!changed||reason.trim(),'Record a scope reason for changing the instrumentation stage link.');
  return changed||!prior?{mode,stageInternalId:id,source:'operator'}:prior;
 }
 // Contract only: numerical reading entry, calculation and alerts remain Phase 5.
 const readingContract=Object.freeze({version:1,identity:['id','instrumentInternalId','seriesId'],measurement:['measuredAt','rawValue','unit','referenceVersion'],quality:['quality','observer'],correction:['supersedesId']});
 function validateReading(reading){check(reading&&['id','instrumentInternalId','seriesId','unit','referenceVersion','observer'].every(k=>typeof reading[k]==='string'&&reading[k].trim()),'Reading identity, unit, reference and observer are required.');check(typeof reading.rawValue==='number'&&Number.isFinite(reading.rawValue),'A finite raw reading is required.');check(typeof reading.measuredAt==='string'&&/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(reading.measuredAt)&&!isNaN(Date.parse(reading.measuredAt)),'Reading time needs a valid explicit time zone.');check(['unverified','checked','invalid'].includes(reading.quality),'Invalid reading quality.');check(!reading.supersedesId||typeof reading.supersedesId==='string'&&reading.supersedesId!==reading.id,'Invalid reading correction link.');return reading;}
 const api={VERSION,INSTALLATION,CONDITION,upgrade,validate,initialBinding,statusProposal,needsMaster,applyStatus,masterControls,recalculate,preview,binding,readingContract,validateReading};if(typeof module==='object'&&module.exports)module.exports=api;else root.GTInstrumentation=api;
})(typeof window==='object'?window:globalThis);
