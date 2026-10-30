/* Single application shell and navigation entry point. Views do not replace render(). */
'use strict';
for(const [name,view]of Object.entries({Briefing:()=>briefingPage(),Diagram:()=>diagramPage(),Map:()=>mapPage(),Segments:()=>segmentsPage(),Update:()=>updatePage(),Sheet:()=>sheetPage(),Report:()=>withLight(reportPage),Registers:()=>registersPage(),Entry:()=>entryPage(),Outbox:()=>outboxPage(),Review:()=>reviewPage(),Audit:()=>auditPage(),Data:()=>workspacePage()}))GTUI.page(name,view);
function goPage(p){
 if(page==='Update'&&uiSegment&&(uiSegmentIsNew||GTWorkspace.canonical(uiSegment)!==uiSegmentBase)&&!confirm('Leave this form and discard unsaved changes?'))return;
 if(p==='Sheet'&&page!=='Sheet')prevPage=page;if(p==='Pack')p='Report';
 if(page==='Entry'&&p!=='Entry')pruneDrafts();
 if(p==='Update'&&uiMaster()){uiPrepareSegment(false);editBase=JSON.stringify(byId(selected)||{});}
 if(p==='Segments')uiCoverage=false;if(p==='Map')mapView=mapView||fitAll();
 page=p;notice='';uiMenu=false;
}
function themeSelector(){return `<select class="control small" data-theme-sel aria-label="Colour theme">${[['auto','Theme: auto'],['light','Light'],['dark','Dark']].map(([v,l])=>`<option value="${v}" ${theme===v?'selected':''}>${l}</option>`).join('')}</select>`;}
function shellActions(){
 const themeControl=themeSelector();
 if(viewer)return `<div class="actions">${themeControl}<button class="btn small" data-action="print">Print</button></div>`;
 const roles=uiMaster()?['RE']:['ARE','IOW','Other'];return `<div class="actions">${themeControl}<select class="control" data-user="role" aria-label="Your role">${roles.map(r=>`<option ${role()===r?'selected':''}>${r}</option>`).join('')}</select><button class="btn small" data-action="export">Backup</button>${uiMaster()?'<button class="btn primary" data-page="Update">Edit master record</button>':'<button class="btn primary" data-page="Entry">Update progress</button>'}</div>`;
}
function render(){
 if(!ready){app.innerHTML='<section class="card">Opening local workspace…</section>';return;}
 applyTheme();
 if(!viewer&&(startupFault||!state.workspace)){
  app.className='app ui-welcome-app';app.innerHTML=`<header class="ui-welcome-header"><div class="mark">GT</div><div class="brand"><strong>Ground Treatment Tracker</strong><span>Local progress workspace</span></div><div class="ui-welcome-theme">${themeSelector()}</div></header><div class="workspace-welcome">${workspacePage()}</div>${packageModal()}`;
  finishRender();return;
 }
 app.className='app';
 if(viewer&&!['Briefing','Diagram','Map','Segments','Registers','Report','Sheet'].includes(page))page='Briefing';
 if(!viewer&&state.workspace.mode==='field'&&['Update','Review'].includes(page))page='Entry';
 if(page==='Pack')page='Report';if(![...navItems(),'Update','Sheet'].includes(page))page=navItems()[0];
 const storage=viewer?`Read-only briefing · as at ${fmtDate(cutoff())}`:`<strong>${uiMaster()?'Master':'Field'} workspace</strong> · revision ${state.datasetVersion} · ${esc(state.baseline?.id||'Legacy data')} · <span data-storage-status></span> · ${esc(backupText())} <button class="linkbtn" data-workspace-action="unsaved-export">Recovery export</button>`;
 app.innerHTML=`<a class="ui-skip" href="#main-content">Skip to content</a><div class="ui-shell${uiMenu?' menu-open':''}"><aside class="ui-sidebar" id="tracker-navigation"><a class="ui-brand" href="#main-content"><span class="ui-brand-mark">GT<span></span></span><span>GROUND TREATMENT<small>Progress workspace</small></span></a><div class="ui-nav-caption">PROJECT WORKSPACE</div>${nav()}<div class="ui-sidebar-bottom"><span class="ui-local-dot"></span>${viewer?'Read-only briefing':uiMaster()?'Master workspace':'Field workspace'}<small>${esc(state.baseline?.id||'Baseline not recorded')}<br>Version ${VERSION}</small></div></aside><div class="ui-frame"><header class="ui-header"><button class="btn ui-menu-toggle" data-ui-action="menu" aria-label="Toggle navigation" aria-expanded="${uiMenu}" aria-controls="tracker-navigation">☰</button><div class="ui-header-title"><span>${esc(projectName()||'Ground treatment tracker')}</span><small>${esc(uiLabels[page]||page)} / ${viewer?'Read only':uiMaster()?'Master':'Field'}</small></div><span class="ui-local-status"><i></i>Local device storage</span>${shellActions()}</header><div class="offline ui-storage-strip${!viewer&&backupDue()?' warn':''}">${storage}</div><main id="main-content" tabindex="-1" class="ui-main">${notice?`<div class="toast${packageReviewError===notice?' ui-error-toast':''}" role="status"><span>${esc(notice)}</span><button class="linkbtn" data-action="dismiss">Dismiss</button></div>`:''}${GTUI.view(page)}<footer class="foot"><strong>${BRAND} · Ground Treatment Tracker v${VERSION}</strong><span>Progress is an estimate for monitoring and briefing; not a measurement or payment record.</span><span>Developed by WPN</span></footer></main></div></div>${packageModal()}${uiRegisterModal()}`;
 finishRender();
}
function finishRender(){
 if(!viewer&&state.workspace)showStorageStatus();
 const modal=app.querySelector('.package-overlay');if(modal){for(const child of app.children)if(!child.classList.contains('package-overlay'))child.inert=true;app.querySelector('.ui-editor-dialog input, [data-package-password]')?.focus();}
 const side=app.querySelector('.ui-sidebar');if(side&&matchMedia('(max-width:760px)').matches&&!uiMenu)side.inert=true;
 fitLanes();updateScale();GTUI.rendered();
}
GTUI.onError(error=>{notice=error?.message||String(error);if(ready)render();});
