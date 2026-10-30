/* Named delegates and explicit page/render hooks. One native listener per target/type. */
(function(root){
 'use strict';
 function eventHub(target,onError=error=>{throw error;}){
  const types=new Map();let sequence=0;
  function on(type,name,handler,options={}){
   if(typeof options==='boolean')options={capture:options};
   if(typeof handler!=='function'||!name)throw Error('A named UI handler is required.');
   let entry=types.get(type);
   if(!entry){entry={handlers:[],listener:null};types.set(type,entry);
    entry.listener=event=>{let stopped=false;const original=event.stopImmediatePropagation;event.stopImmediatePropagation=function(){stopped=true;return original.call(event);};try{for(const route of entry.handlers){if(stopped)break;try{const result=route.handler(event);if(result&&typeof result.catch==='function')result.catch(onError);}catch(error){onError(error);break;}}}finally{event.stopImmediatePropagation=original;}};
    target.addEventListener(type,entry.listener,{capture:true,passive:false});
   }
   if(entry.handlers.some(h=>h.name===name))throw Error('Duplicate UI route: '+type+'/'+name);
   entry.handlers.push({name,handler,capture:!!options.capture,priority:options.priority||0,sequence:sequence++});
   entry.handlers.sort((a,b)=>Number(b.capture)-Number(a.capture)||b.priority-a.priority||a.sequence-b.sequence);
  }
  return {on,inspect:()=>[...types].map(([type,e])=>({type,nativeListeners:1,routes:e.handlers.map(h=>h.name)})),dispose(){for(const [type,e]of types)target.removeEventListener(type,e.listener,{capture:true});types.clear();}};
 }
 function createRuntime(target,windowTarget){
  let errorHandler=error=>console.error(error);const hub=eventHub(target,error=>errorHandler(error)),windowHub=eventHub(windowTarget,error=>errorHandler(error)),pages=new Map(),hooks=new Map();
  return {on:hub.on,windowOn:windowHub.on,page(name,view){if(pages.has(name))throw Error('Duplicate page: '+name);pages.set(name,view);},view(name){const fn=pages.get(name);if(!fn)throw Error('Unknown page: '+name);return fn();},afterRender(name,fn){if(hooks.has(name))throw Error('Duplicate render hook: '+name);hooks.set(name,fn);},rendered(){for(const fn of hooks.values())fn();},onError(fn){errorHandler=fn;},inspect(){return {app:hub.inspect(),window:windowHub.inspect(),pages:[...pages.keys()],renderHooks:[...hooks.keys()]};}};
 }
 if(typeof module==='object'&&module.exports)module.exports={eventHub,createRuntime};else root.GTUI=createRuntime(document.getElementById('app'),root);
})(typeof window==='object'?window:globalThis);
