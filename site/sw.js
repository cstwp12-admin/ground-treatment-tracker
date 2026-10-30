/* Version-pinned offline shell. A waiting release requires an explicit checkpointed update. */
const CACHE = "gt-tracker-v0.15.0-pages-test";
const RELEASE = {format:1,version:'0.15.0-pages-test',readSchemaMin:1,readSchemaMax:4,writeSchema:4,packageProtocol:2,encryptionEnvelope:1};
const FILES = ["./","index.html","core/calculations.js","core/workspace.js","core/packages.js","core/storage.js","core/workspace-ui.js","core/packages-ui.js","core/operations.js","core/interface.js","core/instrumentation-ui.js","core/ui-runtime.js","core/instrumentation.js","core/app-base.js","core/workspace-view.js","core/app-ui.js","core/boot.js","assets/app.css","core/reporting.js","core/report-document.js","core/workbooks.js","core/reporting-ui.js","assets/tracker-blank.xlsx","importer.js","exporter.js","vendor/fflate.umd.js","manifest.webmanifest","icon.svg","core/lifecycle.js","core/updates.js","core/lifecycle-ui.js","vendor/LICENSE-fflate.txt"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_RELEASE'){event.ports[0]?.postMessage(RELEASE);return;}
 if(event.data?.type!=='APPLY_UPDATE')return;
 event.waitUntil((async()=>{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});const scope=new URL(self.registration.scope);const tabs=clients.filter(c=>{const u=new URL(c.url);return u.origin===scope.origin&&u.pathname.startsWith(scope.pathname);});
 if(tabs.length>1){event.ports[0]?.postMessage({type:'UPDATE_BLOCKED',message:'Close other tracker tabs before applying this update.'});return;}
 await self.skipWaiting();})());
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;const url=new URL(event.request.url),base=new URL('./',self.location.href);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 const relative=url.pathname.slice(base.pathname.length)||'./';if(!FILES.includes(relative))return;
 // Read this release only. Never mix network assets into a running release.
 event.respondWith(caches.open(CACHE).then(async cache=>{const key=new URL(relative,base).href;const response=await cache.match(key);return response||new Response('Application asset missing. Restore the complete release and reload.',{status:503});}));
});
