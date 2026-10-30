(function(root){
  'use strict';
  const lifecycle=typeof module==='object'&&module.exports?require('./lifecycle.js'):root.GTLifecycle;
  const errorMessage=error=>error?.name==='QuotaExceededError'?'Browser storage quota is full. Keep this tab open and export an encrypted recovery backup or diagnostic JSON before freeing device space. Your last committed save is retained.':error?.message||String(error);
  class LocalStore {
    constructor({name='WP12-GT-Tracker',indexedDB=root.indexedDB,model=root.GTWorkspace}={}) {this.name=name;this.indexedDB=indexedDB;this.model=model;this.connection=null;}
    async open(){
      if(!this.indexedDB)throw new Error('Local database is unavailable. Enable browser storage or export a recovery file.');
      if(!this.connection)this.connection=new Promise((resolve,reject)=>{
        const request=this.indexedDB.open(this.name,2);
        request.onupgradeneeded=()=>{for(const name of ['state','recovery','baselines'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
        request.onerror=()=>{this.connection=null;reject(request.error);};
        request.onblocked=()=>{this.connection=null;reject(new Error('Close other tracker tabs to upgrade local storage, then reload.'));};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.connection=null;};resolve(db);};
      });
      return this.connection;
    }
    async read(){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('state');const request=tx.objectStore('state').get('project');let value;request.onsuccess=()=>{value=request.result??null;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Read interrupted.'));});}
    async commit(input,expected,{checkpoint=false,baselineSource=null,allowInvalidPrevious=false,referenceRefresh=false,restore=false}={}){
      const db=await this.open(),model=this.model;
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(['state','recovery','baselines'],'readwrite');
        const store=tx.objectStore('state');const request=store.get('project');let output,failure;
        request.onsuccess=()=>{try{
          const raw=request.result||null;
          const revision=raw?.workspace?.storageRevision||0;
          if(revision!==expected)throw new Error('This workspace changed in another tab. Export your unsaved recovery file, then reload before saving.');
          let previous=null;
          try{previous=raw?model.migrate(raw):null;}catch(error){if(!allowInvalidPrevious)throw error;}
          const candidate=typeof input==='function'?input(model.clone(previous)):input;
          output=model.prepareSave(candidate,restore?null:previous,new Date().toISOString(),{referenceRefresh});
          output.workspace.storageRevision=revision+1;
          if(restore){if(lifecycle.bytes(output)>40*1024*1024)throw Error('Restored workspace exceeds the 40 MiB recovery limit. Retain the source and use diagnostic recovery.');}
          else lifecycle.assertGrowth(output,raw);
          if(raw){tx.objectStore('recovery').put(raw,'previous');if(checkpoint)tx.objectStore('recovery').put(raw,'before-replacement');}
          if(baselineSource)tx.objectStore('baselines').add(baselineSource,candidate.workspace.id);
          store.put(output,'project');
          if(restore)tx.objectStore('recovery').put({at:output.savedAt,fromWorkspace:raw?.workspace?.id||null,fromStorageRevision:revision,toWorkspace:output.workspace.id,toDatasetVersion:output.datasetVersion},'meta:last-restore');
          tx.objectStore('recovery').put({revision:revision+1,at:output.savedAt,bytes:lifecycle.bytes(output)},'last-commit');
        }catch(error){failure=error;tx.abort();}};
        tx.oncomplete=()=>resolve(output);
        tx.onerror=()=>reject(failure||tx.error||new Error('Local save failed.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('Local save was interrupted.'));
      });
    }
    async recovery(key='previous'){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('recovery');const r=tx.objectStore('recovery').get(key);let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value||null);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Recovery read interrupted.'));});}
    async metadata(key,value){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('recovery',value===undefined?'readonly':'readwrite'),store=tx.objectStore('recovery'),r=value===undefined?store.get('meta:'+key):store.put(value,'meta:'+key);let result=value;r.onsuccess=()=>{if(value===undefined)result=r.result??null;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage metadata write interrupted.'));});}
    async checkpoint(expected,key='before-update'){
      if(!['before-update','before-recovery'].includes(key))throw Error('Unsupported checkpoint.');
      const raw=await this.read();if(!raw)throw Error('No saved workspace to checkpoint.');
      await lifecycle.verifyDataset(raw);const fingerprint=await this.model.digest(this.model.canonical(raw)),db=await this.open();
      return new Promise((resolve,reject)=>{const tx=db.transaction(['state','recovery'],'readwrite'),r=tx.objectStore('state').get('project');let failure;
        r.onsuccess=()=>{try{if((r.result?.workspace?.storageRevision||0)!==expected||this.model.canonical(r.result)!==this.model.canonical(raw))throw Error('Workspace changed before checkpoint. Reload before applying an update.');tx.objectStore('recovery').put(raw,key);tx.objectStore('recovery').put({at:new Date().toISOString(),revision:expected,sha256:fingerprint},'meta:'+key);}catch(e){failure=e;tx.abort();}};
        tx.oncomplete=()=>resolve({sha256:fingerprint,revision:expected});tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Checkpoint interrupted.'));
      });
    }
  }
  if(typeof module==='object'&&module.exports)module.exports={LocalStore,errorMessage};else root.GTStorage={LocalStore,errorMessage};
})(typeof window==='object'?window:globalThis);
